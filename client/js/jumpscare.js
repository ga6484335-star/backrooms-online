// Dynamic jumpscare director — rare, varied, cinematic, never predictable.
// Host authors shared scares (relay 'scare' events); personal ones stay local.
// Every scare hands control back immediately; nothing here blocks the loop.
import { CELL } from './worldgen.js';
import { MONSTER_TYPES } from './monsters/defs.js';

const GLOBAL_COOLDOWN = 150;   // seconds between major scares (min)
const PER_TYPE_COOLDOWN = 260; // same scare type won't repeat for a while

export class JumpscareDirector {
  constructor(monsters, lightMgr, audio, renderer, player, net, sendEvent) {
    this.monsters = monsters;
    this.lightMgr = lightMgr;
    this.audio = audio;
    this.renderer = renderer;
    this.player = player;
    this.net = net;             // for reachability of relay (unused directly)
    this.sendEvent = sendEvent; // host broadcast fn(kind, data)
    this.isHost = () => false;
    this.cooldown = 45 + Math.random() * 40; // grace at game start
    this.active = null;         // {type, t, data}
    this.perType = new Map();   // type -> seconds since used
    this.onMessage = null;
  }

  setHostFn(fn) { this.isHost = fn; }

  update(dt, player, remotePlayers) {
    for (const [k, v] of this.perType) this.perType.set(k, v + dt);
    if (this.active) this.updateActive(dt, player);
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (!this.isHost()) return;

    // pick a scare whose per-type cooldown expired, weighted by context
    const opts = [];
    const near = this.nearestPlayer(player, remotePlayers);
    const nearDoor = this.findDoorNear(player.pos.x, player.pos.z, 9);
    const inDark = this.lightMgr && this.lightMgr.brightnessAt(player.pos.x, player.pos.z) < 0.3;
    const canUse = (t) => (this.perType.get(t) ?? 1e9) > PER_TYPE_COOLDOWN;
    if (canUse('cross')) opts.push(['cross', 3]);
    if (canUse('appear')) opts.push(['appear', 2.5]);
    if (canUse('rush')) opts.push(['rush', 2]);
    if (canUse('figure')) opts.push(['figure', 2.5]);
    if (canUse('shadowback')) opts.push(['shadowback', 2]);
    if (nearDoor && canUse('door')) opts.push(['door', 3.2]);
    if (inDark && canUse('dark')) opts.push(['dark', 3]);
    if (player.flashOn && canUse('beam')) opts.push(['beam', 2.6]);
    if (!opts.length) return;
    let total = 0; for (const o of opts) total += o[1];
    let roll = Math.random() * total, type = 'cross';
    for (const o of opts) { roll -= o[1]; if (roll <= 0) { type = o[0]; break; } }
    this.trigger(type, player, near, nearDoor);
  }

  trigger(type, player, near, nearDoor) {
    this.cooldown = GLOBAL_COOLDOWN * (0.75 + Math.random() * 0.75);
    this.perType.set(type, 0);
    const payload = { type, x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1), yaw: +player.yaw.toFixed(2) };
    if (nearDoor) { payload.door = [nearDoor.cx, nearDoor.cz, nearDoor.dir]; }
    if (near) payload.nearId = near.id;
    this.sendEvent('scare', payload);
    this.fire(payload, player);
  }

  // shared scares replay on every client; local geometry is deterministic
  // given the payload position, so all clients place it identically enough
  fire(data, player) {
    const px = data.x, pz = data.z, pyaw = data.yaw;
    switch (data.type) {
      case 'cross': this.scareCross(px, pz, pyaw); break;
      case 'appear': this.scareAppear(px, pz, pyaw); break;
      case 'door': this.scareDoor(px, pz, pyaw, data.door); break;
      case 'dark': this.scareDark(px, pz); break;
      case 'beam': this.scareBeam(px, pz, pyaw); break;
      case 'rush': this.scareRush(px, pz, pyaw); break;
      case 'figure': this.scareFigure(px, pz, pyaw); break;
      case 'shadowback': this.scareShadowBack(px, pz, pyaw); break;
    }
  }

  nearestPlayer(player, remotePlayers) {
    let best = null, bd = 30;
    if (remotePlayers) for (const [id, p] of remotePlayers.players) {
      const d = Math.hypot(p.cur.x - player.pos.x, p.cur.z - player.pos.z);
      if (d < bd && !p.cur.dead) { bd = d; best = { id, x: p.cur.x, z: p.cur.z }; }
    }
    return best;
  }

  findDoorNear(x, z, radius) {
    if (!this.monsters.worldMgr) return null;
    let best = null, bd = radius;
    for (const d of this.monsters.worldMgr.doorIndex.values()) {
      const dist = Math.hypot(d.x - x, d.z - z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  // place a temporary monster ahead of the player (off their view cone if
  // possible so it appears dramatic, not popped-in)
  placeAhead(px, pz, pyaw, dist, kind) {
    const fx = -Math.sin(pyaw), fz = -Math.cos(pyaw);
    const sx = px + fx * dist, sz = pz + fz * dist;
    const cx = Math.floor(sx / CELL), cz = Math.floor(sz / CELL);
    const mx = (cx + 0.5) * CELL, mz = (cz + 0.5) * CELL;
    const m = this.monsters.spawnMonster(kind, mx, mz);
    m.scare = true; // tag: temporary director puppet
    m.yaw = Math.atan2(px - mx, pz - mz);
    return m;
  }

  // -- 1. something crosses the corridor ahead ----------------------------
  scareCross(px, pz, pyaw) {
    const m = this.placeAhead(px, pz, pyaw, 14, 'hollow');
    m.scareRule = 'cross';
    m.crossTo = null;
    this.audio.monsterVoice('hollow', m.x, 1.5, m.z, 1);
    this.renderer.bumpGlitch(0.8);
    this.player.trauma(0.45);
    this.active = { type: 'cross', t: 0, m };
  }

  // -- 2. a doorway that was empty now holds a watcher ---------------------
  scareAppear(px, pz, pyaw, door) {
    const m = this.placeAhead(px, pz, pyaw, door ? 8 : 12, 'watcher');
    m.scareRule = 'dissolve';
    m.scareT = 2.6;
    this.audio.monsterVoice('watcher', m.x, 2.4, m.z, 1);
    this.player.trauma(0.5);
    this.active = { type: 'appear', t: 0, m };
  }

  // -- 3. the nearest door swings; something stands behind it --------------
  scareDoor(px, pz, pyaw, door) {
    if (!door || !this.monsters.worldMgr) { this.scareAppear(px, pz, pyaw); return; }
    const key = `${door.cx},${door.cz},${door.dir}`;
    this.monsters.worldMgr.setDoorOpen(key, true);
    if (this.sendEvent) this.sendEvent('door', { key, open: true });
    const m = this.placeAhead(door.x, door.z, pyaw, 6, 'stalker');
    m.scareRule = 'dissolve';
    m.scareT = 2.2;
    this.audio.doorCreak(door.x, door.z);
    this.audio.monsterVoice('stalker', m.x, 1.4, m.z, 1);
    this.player.trauma(0.55);
    this.active = { type: 'door', t: 0, m };
  }

  // -- 4. lights die; in the black, something breathes close ---------------
  scareDark(px, pz) {
    if (this.lightMgr && this.lightMgr.killNearest) {
      const key = this.lightMgr.killNearest(px, pz, 10);
      if (key && this.sendEvent) this.sendEvent('lightdie', { key });
    }
    const bx = px + (Math.random() - 0.5) * 4, bz = pz + (Math.random() - 0.5) * 4;
    this.audio.behindYou();
    this.renderer.bumpGlitch(1.1);
    this.player.trauma(0.6);
    if (this.onMessage) this.onMessage('IT IS BREATHING.');
    this.active = { type: 'dark', t: 0, m: null, pos: [bx, bz] };
  }

  // -- 5. the beam flickers; when it settles, a hollow stands in it --------
  scareBeam(px, pz, pyaw) {
    const m = this.placeAhead(px, pz, pyaw, 5, 'hollow');
    m.scareRule = 'dissolve';
    m.scareT = 1.8;
    this.audio.monsterVoice('hollow', m.x, 1.5, m.z, 1);
    this.renderer.bumpGlitch(0.9);
    this.player.trauma(0.55);
    this.active = { type: 'beam', t: 0, m };
  }

  // -- 6. a runner screams past at full speed ------------------------------
  scareRush(px, pz, pyaw) {
    const m = this.placeAhead(px, pz, pyaw + Math.PI, 10, 'runner');
    m.scareRule = 'rush';
    m.scareTarget = [px + Math.cos(pyaw) * 4, pz - Math.sin(pyaw) * 4];
    this.audio.monsterVoice('runner', m.x, 1.4, m.z, 1);
    this.renderer.bumpGlitch(1.2);
    this.player.trauma(0.7);
    this.active = { type: 'rush', t: 0, m };
  }

  // -- 7. a lit room goes black; a tall one was already there --------------
  scareFigure(px, pz, pyaw) {
    if (this.lightMgr && this.lightMgr.killNearest) {
      const key = this.lightMgr.killNearest(px, pz, 12);
      if (key && this.sendEvent) this.sendEvent('lightdie', { key });
    }
    const m = this.placeAhead(px, pz, pyaw, 10, 'tallone');
    m.scareRule = 'dissolve';
    m.scareT = 3;
    this.audio.monsterVoice('tallone', m.x, 1.8, m.z, 0.9);
    this.player.trauma(0.5);
    this.active = { type: 'figure', t: 0, m };
  }

  // -- 8. scuttle behind you: when you turn — nothing. ---------------------
  scareShadowBack(px, pz) {
    const bx = px + Math.sin(px) * 0 + (Math.random() - 0.5) * 5;
    const bz = pz + (Math.random() - 0.5) * 5;
    this.audio.distantFootsteps(5);
    this.audio.behindYou();
    this.player.trauma(0.4);
    if (this.onMessage) this.onMessage('FOOTSTEPS. BEHIND YOU.');
    this.active = { type: 'shadowback', t: 0, m: null, pos: [bx, bz] };
  }

  // drive the active puppet until it dissolves
  updateActive(dt, player) {
    const a = this.active;
    a.t += dt;
    const m = a.m;
    if (m) {
      m.scareT -= dt;
      if (a.type === 'cross') {
        // slide across the corridor, accelerating like fleeing prey
        if (!m.crossTo) {
          const side = Math.random() < 0.5 ? 1 : -1;
          m.crossTo = [m.x + Math.cos(m.yaw + Math.PI / 2) * 9 * side, m.z - Math.sin(m.yaw + Math.PI / 2) * 9 * side];
        }
        this.monsters.moveToward(m, m.crossTo[0], m.crossTo[1], 5.5 * (1 + a.t), dt);
      } else if (a.type === 'rush' && m.scareTarget) {
        this.monsters.moveToward(m, m.scareTarget[0], m.scareTarget[1], 8.5, dt);
      }
      if (m.scareT <= 0 || m.state === 'gone') { this.monsters.remove(m.id); this.active = null; }
      return;
    }
    if (a.t > 4) this.active = null;
  }
}
