// Monster AI system — host-authoritative state machines with detection.
// States: IDLE PATROL INVESTIGATE HEAR_PLAYER SEE_PLAYER STALK CHASE ATTACK
//         SEARCH LOSE_TARGET RETREAT DORMANT (mimic)
// Detection combines distance, line of sight (cell walls), ambient light,
// movement noise, running noise and flashlight exposure.
// The HOST runs AI and streams snapshots; non-hosts interpolate.
// 'shadow' entities are private hallucinations computed locally.
import * as THREE from 'three';
import { CELL, bfsPath } from '../worldgen.js';
import { buildMonster, MONSTER_TYPES } from './defs.js';

export const TYPE_IDS = ['watcher', 'stalker', 'hunter', 'ambusher', 'mimic', 'shadow'];

// which monsters a level can produce
const LEVEL_POOLS = [
  ['watcher', 'watcher', 'stalker', 'hunter', 'mimic'],
  ['stalker', 'watcher', 'hunter', 'ambusher', 'ambusher', 'mimic'],
  ['hunter', 'ambusher', 'ambusher', 'stalker', 'mimic'],
  ['watcher', 'ambusher', 'stalker', 'mimic'],
  ['stalker', 'stalker', 'mimic', 'mimic', 'hunter'],
  ['watcher', 'stalker', 'stalker', 'mimic', 'hunter'],
];
// hard caps so the world never fills with monsters
const CAPS = { watcher: 1, stalker: 1, hunter: 1, ambusher: 2, mimic: 2 };

const HEAR_WALK = 8, HEAR_RUN = 24;

export class MonsterSystem {
  constructor(scene, world, worldMgr, audio, network, isHostFn) {
    this.scene = scene;
    this.world = world;
    this.worldMgr = worldMgr;
    this.audio = audio;
    this.network = network;
    this.isHost = isHostFn;
    this.monsters = new Map();
    this.nextId = 1;
    this.time = 0;
    this.onNearCallback = null;
    this.onCaught = null;
    this.getLightAt = () => 0.5;
    this.getPlayers = null;

    // pacing state machine: quiet -> uneasy -> encounter -> cooldown -> quiet
    this.pacing = 'quiet';
    this.pacingT = 30 + Math.random() * 25;
    this.dwellCell = '';
    this.dwellT = 0;

    this.hallucTimer = 50 + Math.random() * 60;
  }

  bind(getPlayers) { this.getPlayers = getPlayers; }

  // ------------------------------------------------------------- spawning
  hostSpawnLogic(dt, player, players) {
    this.pacingT -= dt;

    // dwell tracking: lingering in one cell raises danger
    const cc = `${Math.floor(player.pos.x / CELL)},${Math.floor(player.pos.z / CELL)}`;
    if (cc === this.dwellCell) this.dwellT += dt; else { this.dwellCell = cc; this.dwellT = 0; }

    switch (this.pacing) {
      case 'quiet':
        if (this.pacingT <= 0) {
          this.pacing = 'uneasy';
          this.pacingT = 25 + Math.random() * 25;
        }
        break;
      case 'uneasy':
        if (this.pacingT <= 0) {
          const active = [...this.monsters.values()].filter((m) => !m.private);
          const playerCount = 1 + (players ? players.length : 0);
          const darkness = 1 - this.getLightAt(player.pos.x, player.pos.z);
          const noise = player.anim === 'run' ? 0.15 : player.anim === 'walk' ? 0.05 : 0;
          const dwell = Math.min(0.25, this.dwellT / 120 * 0.25);
          const crowd = Math.min(0.15, playerCount * 0.03);
          const chanceOf = 0.35 + darkness * 0.2 + noise + dwell + crowd - active.length * 0.25;
          if (Math.random() < chanceOf) {
            const pool = LEVEL_POOLS[this.world.level] || LEVEL_POOLS[0];
            let type = pool[(Math.random() * pool.length) | 0];
            // respect caps
            const countOf = (t) => active.filter((m) => m.type === t).length;
            for (let tries = 0; tries < 4 && countOf(type) >= (CAPS[type] || 1); tries++) {
              type = pool[(Math.random() * pool.length) | 0];
            }
            if (countOf(type) < (CAPS[type] || 1)) {
              const cell = this.worldMgr.monstersSpawnCell(player.pos.x, player.pos.z);
              this.spawnMonster(type, (cell[0] + 0.5) * CELL, (cell[1] + 0.5) * CELL);
              this.pacing = 'encounter';
              this.pacingT = 40 + Math.random() * 40;
              break;
            }
          }
          this.pacing = 'cooldown';
          this.pacingT = 35 + Math.random() * 45;
        }
        break;
      case 'encounter':
        if (this.pacingT <= 0 || ![...this.monsters.values()].some((m) => !m.private)) {
          this.pacing = 'cooldown';
          this.pacingT = 50 + Math.random() * 60;
        }
        break;
      case 'cooldown':
        if (this.pacingT <= 0) {
          this.pacing = 'quiet';
          this.pacingT = 35 + Math.random() * 35;
        }
        break;
    }
  }

  spawnMonster(type, x, z, forcedId) {
    const def = MONSTER_TYPES[type];
    const id = forcedId ?? (this.nextId++);
    const mesh = buildMonster(type);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const m = {
      id, type, def, mesh,
      x, z, yaw: Math.random() * Math.PI * 2, state: type === 'mimic' ? 'dormant' : 'idle',
      target: null, path: null, pathI: 0,
      voiceTimer: 6 + Math.random() * 10,
      life: 0, observedT: 0,
      stateT: 0, lastSeen: null, interest: null,
      patrolTarget: null, animT: Math.random() * 10,
      homeX: x, homeZ: z,
    };
    this.monsters.set(id, m);
    return m;
  }

  spawnHallucination(px, pz, pyaw) {
    const a = pyaw + Math.PI + (Math.random() - 0.5) * 1.6;
    const d = 9 + Math.random() * 12;
    const x = px + Math.sin(a) * -d, z = pz + Math.cos(a) * -d;
    const m = this.spawnMonster('shadow', x, z);
    m.private = true;
    this.audio.monsterVoice('shadow', x, 1.6, z, 0.6);
    return m;
  }

  // ------------------------------------------------------------- detection
  hasLOS(x0, z0, x1, z1) {
    // march the segment across the cell grid; blocked by non-door walls
    const dx = x1 - x0, dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return true;
    const steps = Math.ceil(dist / (CELL * 0.49));
    let px = x0, pz = z0;
    let cx = Math.floor(x0 / CELL), cz = Math.floor(z0 / CELL);
    for (let i = 0; i < steps; i++) {
      px += dx / steps; pz += dz / steps;
      const nx = Math.floor(px / CELL), nz = Math.floor(pz / CELL);
      if (nx === cx && nz === cz) continue;
      // crossed edge(s): figure out which direction(s)
      if (nx !== cx) {
        const dir = nx > cx ? 0 : 2;
        const w = this.world.wallInfo(cx, cz, dir);
        if (w.wall && !w.door) return false;
      }
      if (nz !== cz) {
        const dir = nz > cz ? 1 : 3;
        const w = this.world.wallInfo(cx, cz, dir);
        if (w.wall && !w.door) return false;
      }
      cx = nx; cz = nz;
    }
    return true;
  }

  detect(m, players) {
    // returns {player, nd, seen, heard}
    let best = null, bestScore = 1e9;
    for (const p of players) {
      const dx = p.x - m.x, dz = p.z - m.z;
      const nd = Math.hypot(dx, dz);
      let seen = false, heard = false;
      if (m.def.vision > 0 && nd < m.def.vision) {
        if (this.hasLOS(m.x, m.z, p.x, p.z)) {
          const light = this.getLightAt(p.x, p.z);
          const flash = p.fl ? 1.6 : 1;
          const moving = p.anim === 'run' ? 1.25 : p.anim === 'walk' ? 1 : 0.65;
          const effRange = m.def.vision * (0.35 + light * 0.65) * flash * moving;
          if (nd < effRange) seen = true;
        }
      }
      if (m.def.hearing > 0 && nd < m.def.hearing) {
        if (p.anim === 'run' && nd < HEAR_RUN) heard = true;
        else if (p.anim === 'walk' && nd < HEAR_WALK) heard = true;
      }
      const score = nd - (seen ? 100 : 0) - (heard ? 50 : 0);
      if (score < bestScore) { bestScore = score; best = { player: p, nd, seen, heard }; }
    }
    return best;
  }

  // ------------------------------------------------------------- update
  update(dt, player, remotePlayers) {
    this.time += dt;
    const ppos = [player.pos.x, player.pos.y, player.pos.z];

    // unified player list for detection (local + remote)
    const players = [{ id: -1, x: player.pos.x, z: player.pos.z, anim: player.anim, fl: player.flashOn ? 1 : 0, dead: player.dead }];
    if (remotePlayers) {
      for (const [id, p] of remotePlayers.players) {
        players.push({ id, x: p.cur.x, z: p.cur.z, anim: p.cur.anim || 'idle', fl: p.cur.fl || 0, dead: p.cur.dead });
      }
    }
    const alivePlayers = players.filter((p) => !p.dead);

    if (this.isHost()) this.hostSpawnLogic(dt, player, alivePlayers.slice(1));

    // private hallucination scheduling
    this.hallucTimer -= dt;
    if (this.hallucTimer <= 0) {
      this.hallucTimer = 90 + Math.random() * 120;
      if (Math.random() < 0.7) this.spawnHallucination(ppos[0], ppos[2], player.yaw);
    }

    const remove = [];
    for (const m of this.monsters.values()) {
      m.life += dt;
      m.stateT += dt;
      if (m.private) this.updatePrivate(m, dt, player);
      else if (this.isHost()) this.updateHost(m, dt, alivePlayers);
      this.updateMesh(m, dt);
      this.updateVoice(m, dt, ppos);

      const d = Math.hypot(m.x - ppos[0], m.z - ppos[2]);
      if (d > m.def.despawnDist || m.life > 600) remove.push(m.id);
      if (m.state === 'gone') remove.push(m.id);

      if (d < 6 && this.onNearCallback) this.onNearCallback(m, d);
    }
    for (const id of remove) this.remove(id);
  }

  updateVoice(m, dt, ppos) {
    m.voiceTimer -= dt;
    if (m.voiceTimer <= 0) {
      m.voiceTimer = 8 + Math.random() * 16;
      const d = Math.hypot(m.x - ppos[0], m.z - ppos[2]);
      if (d < 40) {
        this.audio.monsterVoice(m.type, m.x, 1.6, m.z, Math.max(0.3, 1 - d / 40));
      }
    }
  }

  setState(m, s) {
    if (m.state === s) return;
    m.state = s;
    m.stateT = 0;
  }

  updateHost(m, dt, players) {
    if (!players.length) return;
    const det = this.detect(m, players);
    const p = det && det.player, nd = det ? det.nd : 1e9;

    switch (m.type) {
      case 'watcher': this.aiWatcher(m, dt, det); break;
      case 'stalker': this.aiStalker(m, dt, det); break;
      case 'hunter': this.aiHunter(m, dt, det); break;
      case 'ambusher': this.aiAmbusher(m, dt, det); break;
      case 'mimic': this.aiMimic(m, dt, det); break;
    }
  }

  moveToward(m, tx, tz, speed, dt) {
    if (!m.path || m.pathI >= m.path.length || (m.repathT = (m.repathT || 0) - dt) <= 0) {
      const from = [Math.floor(m.x / CELL), Math.floor(m.z / CELL)];
      const to = [Math.floor(tx / CELL), Math.floor(tz / CELL)];
      m.path = bfsPath(this.world, from, to);
      m.pathI = 0;
      m.repathT = 1.2;
    }
    let gx = tx, gz = tz;
    if (m.path && m.pathI < m.path.length) {
      const node = m.path[m.pathI];
      gx = (node[0] + 0.5) * CELL; gz = (node[1] + 0.5) * CELL;
      if (Math.hypot(gx - m.x, gz - m.z) < CELL * 0.4) m.pathI++;
    }
    const dx = gx - m.x, dz = gz - m.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) {
      m.x += (dx / d) * speed * dt;
      m.z += (dz / d) * speed * dt;
      m.yaw = Math.atan2(dx, dz);
    }
    m.moving = speed > 0.05;
  }

  wander(m, dt, speed = 0.7) {
    if (!m.patrolTarget || Math.hypot(m.patrolTarget[0] - m.x, m.patrolTarget[1] - m.z) < 1.5) {
      const cell = this.worldMgr.monstersSpawnCell(m.x, m.z);
      m.patrolTarget = [(cell[0] + 0.5) * CELL, (cell[1] + 0.5) * CELL];
    }
    this.moveToward(m, m.patrolTarget[0], m.patrolTarget[1], speed, dt);
  }

  attackCheck(m, det) {
    if (!m.def.lethal || !det) return false;
    if (det.nd < m.def.attackRange) {
      this.setState(m, 'attack');
      this.audio.monsterAttack(m.x, 1.5, m.z);
      if (this.onCaught) this.onCaught(m, det.player);
      this.setState(m, 'cooldown');
      return true;
    }
    return false;
  }

  // ---- THE WATCHER: stands far away, watches, creeps closer when unseen,
  // vanishes if approached or stared at too long
  aiWatcher(m, dt, det) {
    m.moving = false;
    if (!det) { this.setState(m, 'idle'); return; }
    const p = det.player, nd = det.nd;
    m.yaw = Math.atan2(p.x - m.x, p.z - m.z); // always faces the player
    this.setState(m, 'watch');

    // is the player looking at the watcher?
    const lookDot = p.yaw !== undefined ? null : null;
    if (nd < 7) {
      this.setState(m, 'gone'); // approached: simply gone
      return;
    }
    // creep closer only while unobserved (host uses 'seen' as proxy inverse)
    if (!det.seen && nd > m.def.keepDist[0]) {
      this.moveToward(m, p.x, p.z, m.def.speed, dt);
      this.setState(m, 'stalk');
    }
    if (nd > m.def.keepDist[1] * 1.8) this.setState(m, 'gone'); // drifted too far to matter
  }

  // ---- THE STALKER: shadows the player at a distance, freezes when seen,
  // retreats if cornered
  aiStalker(m, dt, det) {
    if (!det) { this.wander(m, dt); this.setState(m, 'patrol'); return; }
    const p = det.player, nd = det.nd;
    m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
    if (det.seen && nd < 14) {
      // noticed: freeze, then back away
      this.setState(m, 'retreat');
      m.moving = false;
      if (m.stateT > 1.2 || nd < m.def.keepDist[0]) {
        this.moveToward(m, m.x + (m.x - p.x), m.z + (m.z - p.z), m.def.speed * 1.3, dt);
      }
      if (nd > 30) this.setState(m, 'gone');
    } else {
      this.setState(m, 'stalk');
      if (nd > m.def.keepDist[1]) this.moveToward(m, p.x, p.z, m.def.speed, dt);
      else m.moving = false;
    }
  }

  // ---- THE HUNTER: real danger. sees/hears -> investigates -> chases -> kills
  aiHunter(m, dt, det) {
    switch (m.state) {
      case 'idle': case 'patrol': {
        this.wander(m, dt, 0.9);
        this.setState(m, 'patrol');
        if (det && (det.seen || det.heard)) {
          m.interest = [det.player.x, det.player.z];
          this.setState(m, det.seen ? 'see_player' : 'hear_player');
          this.audio.monsterVoice('hunter', m.x, 1.8, m.z, 0.9);
        }
        break;
      }
      case 'see_player': case 'hear_player': case 'investigate': {
        if (!m.interest) { this.setState(m, 'patrol'); break; }
        this.setState(m, 'investigate');
        this.moveToward(m, m.interest[0], m.interest[1], m.def.speed * 0.45, dt);
        if (det && det.seen) {
          m.target = det.player;
          m.lastSeen = [det.player.x, det.player.z];
          this.setState(m, 'chase');
          this.audio.monsterVoice('hunter', m.x, 1.8, m.z, 1);
        } else if (Math.hypot(m.interest[0] - m.x, m.interest[1] - m.z) < 2) {
          m.interest = null;
          m.searchT = 8;
          this.setState(m, 'search');
        }
        break;
      }
      case 'chase': {
        if (!m.target) { this.setState(m, 'search'); m.searchT = 6; break; }
        const dNow = this.detect(m, players_alive(m, det));
        // keep chasing while we can still sense the target
        if (det && (det.seen || det.heard || det.nd < 10)) {
          m.lastSeen = [det.player.x, det.player.z];
          m.searchT = 6;
        } else {
          m.searchT = (m.searchT ?? 6) - dt;
          if (m.searchT <= 0) {
            m.target = null;
            this.setState(m, 'lose_target');
            break;
          }
        }
        const t = m.lastSeen || [m.target.x, m.target.z];
        this.moveToward(m, t[0], t[1], m.def.speed, dt);
        if (this.attackCheck(m, det)) break;
        if (det && det.nd > m.def.chaseGiveUp) {
          m.target = null;
          this.setState(m, 'lose_target');
        }
        break;
      }
      case 'search': {
        m.searchT = (m.searchT ?? 6) - dt;
        this.wander(m, dt, 1.2);
        if (det && det.seen) {
          m.target = det.player;
          m.lastSeen = [det.player.x, det.player.z];
          this.setState(m, 'chase');
        } else if (m.searchT <= 0) this.setState(m, 'patrol');
        break;
      }
      case 'lose_target': {
        this.wander(m, dt, 1.0);
        if (m.stateT > 5) this.setState(m, 'patrol');
        if (det && det.seen) { m.target = det.player; m.lastSeen = [det.player.x, det.player.z]; this.setState(m, 'chase'); }
        break;
      }
      case 'cooldown': {
        this.wander(m, dt, 0.8);
        if (m.stateT > 6) this.setState(m, 'patrol');
        break;
      }
      default: this.setState(m, 'patrol');
    }
  }

  // ---- THE AMBUSHER: motionless in the dark; erupts when someone is close
  aiAmbusher(m, dt, det) {
    if (m.state === 'attack' || m.state === 'chase') {
      if (det) {
        m.lastSeen = [det.player.x, det.player.z];
        this.setState(m, 'chase');
        this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
        if (this.attackCheck(m, det)) return;
        if (det.nd > m.def.chaseGiveUp || m.stateT > 10) this.setState(m, 'gone');
      } else if (m.stateT > 6) this.setState(m, 'gone');
      return;
    }
    // dormant in darkness
    this.setState(m, 'dormant');
    m.moving = false;
    if (det && det.nd < m.def.aggroRange) {
      this.setState(m, 'attack');
      m.stateT = 0;
      this.audio.monsterVoice('ambusher', m.x, 1.4, m.z, 1);
    }
  }

  // ---- THE MIMIC: looks like furniture until touched by proximity
  aiMimic(m, dt, det) {
    if (m.state === 'dormant') {
      m.moving = false;
      if (det && det.nd < m.def.aggroRange) {
        this.setState(m, 'reveal');
        m.mesh.userData.reveal();
        this.audio.creak();
        this.audio.monsterVoice('mimic', m.x, 1, m.z, 1);
      }
      return;
    }
    if (det) {
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (this.attackCheck(m, det)) return;
      if (det.nd > m.def.chaseGiveUp || m.stateT > 14) this.setState(m, 'gone');
    } else if (m.stateT > 8) this.setState(m, 'gone');
  }

  // ---- private hallucination: fades when directly observed
  updatePrivate(m, dt, player) {
    const dx = m.x - player.pos.x, dz = m.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) m.yaw = Math.atan2(dx, dz);
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot > 0.92) {
      m.observedT += dt;
      if (m.observedT > m.def.despawnLookAt) m.state = 'gone';
    } else {
      m.observedT = Math.max(0, m.observedT - dt * 2);
    }
    m.mesh.traverse((o) => {
      if (o.isMesh) { o.material.transparent = true; o.material.opacity = Math.max(0.15, 1 - m.observedT / m.def.despawnLookAt); }
    });
  }

  // ------------------------------------------------------------- animation
  updateMesh(m, dt) {
    m.mesh.position.set(m.x, 0, m.z);
    m.mesh.rotation.y = m.yaw;
    m.animT += dt * (m.moving ? (m.state === 'chase' || m.state === 'attack' ? 9 : 4) : 1.2);
    const u = m.mesh.userData;
    const t = m.animT;
    const amp = m.moving ? 0.55 : 0.05;
    for (const limb of (u.limbs || [])) {
      if (limb.kind === 'leg') limb.g.rotation.x = Math.sin(t * 2 + (limb.side > 0 ? 0 : Math.PI)) * amp;
      else limb.g.rotation.x = Math.sin(t * 2 + (limb.side > 0 ? Math.PI : 0)) * amp * 0.7;
    }
    // idle wrongness: slow head tilt, subtle body sway
    if (u.head) {
      u.head.rotation.z = Math.sin(t * 0.35 + m.id) * 0.14 + (m.type === 'watcher' ? 0.18 : 0);
      u.head.rotation.x = Math.sin(t * 0.23) * 0.08;
    }
    if (m.type === 'watcher') m.mesh.rotation.z = Math.sin(t * 0.4 + m.id) * 0.025;
    if (m.state === 'attack' && u.jaw) u.jaw.rotation.x = 0.9;
  }

  remove(id) {
    const m = this.monsters.get(id);
    if (!m) return;
    this.scene.remove(m.mesh);
    this.monsters.delete(id);
  }

  // ------------------------------------------------------------- networking
  hostSnapshot() {
    const list = [];
    for (const m of this.monsters.values()) {
      if (m.private) continue;
      list.push([m.id, TYPE_IDS.indexOf(m.type), +m.x.toFixed(2), +m.z.toFixed(2), +m.yaw.toFixed(2), stateCode(m.state)]);
    }
    return list;
  }

  applySnapshot(list) {
    if (this.isHost()) return;
    const seen = new Set();
    for (const row of list) {
      const [id, typeIdx, x, z, yaw, state] = row;
      seen.add(id);
      let m = this.monsters.get(id);
      if (!m) m = this.spawnMonster(TYPE_IDS[typeIdx] || 'watcher', x, z, id);
      m.netX = x; m.netZ = z; m.netYaw = yaw;
      const sn = stateName(state);
      if (m.type === 'mimic' && sn !== 'dormant' && m.state === 'dormant') m.mesh.userData.reveal();
      m.state = sn;
    }
    for (const m of [...this.monsters.values()]) {
      if (!m.private && !seen.has(m.id)) this.remove(m.id);
    }
    for (const m of this.monsters.values()) {
      if (m.private || m.netX === undefined) continue;
      m.x += (m.netX - m.x) * 0.25;
      m.z += (m.netZ - m.z) * 0.25;
      let dy = (m.netYaw || 0) - m.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * 0.25;
      m.moving = Math.hypot(m.netX - m.x, m.netZ - m.z) > 0.02;
    }
  }
}

// helper used in hunter chase (kept tiny to avoid closures over stale det)
function players_alive(m, det) { return det ? [det.player] : []; }

const STATE_CODES = {
  idle: 0, watch: 1, stalk: 2, chase: 3, dormant: 4, reveal: 5, gone: 6,
  patrol: 7, investigate: 8, hear_player: 9, see_player: 10, attack: 11,
  search: 12, lose_target: 13, retreat: 14, cooldown: 15,
};
function stateCode(s) { return STATE_CODES[s] ?? 0; }
function stateName(c) { return Object.keys(STATE_CODES).find((k) => STATE_CODES[k] === c) || 'idle'; }
