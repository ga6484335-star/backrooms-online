// Monster AI system. The HOST runs authoritative AI for shared monsters and
// streams compact snapshots; non-hosts interpolate. 'shadow' entities are
// private hallucinations computed locally.
// Snapshot wire format: [id, typeIdx, x, z, yaw, state, extra]
import * as THREE from 'three';
import { CELL, bfsPath } from '../worldgen.js';
import { buildMonster, MONSTER_TYPES } from './defs.js';

export const TYPE_IDS = ['watcher', 'stalker', 'runner', 'mimic', 'shadow'];

export class MonsterSystem {
  constructor(scene, world, worldMgr, audio, network, isHostFn) {
    this.scene = scene;
    this.world = world;
    this.worldMgr = worldMgr;
    this.audio = audio;
    this.network = network;
    this.isHost = isHostFn;
    this.monsters = new Map(); // id -> monster
    this.nextId = 1;
    this.spawnTimer = 20 + Math.random() * 30;
    this.hallucTimer = 40 + Math.random() * 60;
    this.time = 0;
    this.onNearCallback = null;
    this.playerRefs = null; // set via bind
  }

  bind(getPlayers) { this.getPlayers = getPlayers; }

  // ------------------------------------------------------------------ spawns
  hostSpawnLogic(dt, playerPos) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 55 + Math.random() * 70; // encounters are RARE
      // choose type weighted by rarity
      const roll = Math.random();
      let acc = 0, chosen = 'watcher';
      for (const t of TYPE_IDS) {
        if (t === 'shadow') continue; // private only
        acc += MONSTER_TYPES[t].rarity;
        if (roll < acc) { chosen = t; break; }
      }
      const cell = this.worldMgr.monstersSpawnCell(playerPos[0], playerPos[2]);
      this.spawnMonster(chosen, (cell[0] + 0.5) * CELL, (cell[1] + 0.5) * CELL);
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
      x, z, yaw: 0, state: 'idle',
      target: null, path: null, pathI: 0,
      voiceTimer: 6 + Math.random() * 10,
      life: 0, observedT: 0,
      extra: 0,
    };
    if (type === 'mimic') m.state = 'dormant';
    this.monsters.set(id, m);
    return m;
  }

  spawnHallucination(px, pz, pyaw) {
    // shadow appears behind or at the periphery of one player's view
    const a = pyaw + Math.PI + (Math.random() - 0.5) * 1.6; // behind-ish
    const d = 9 + Math.random() * 12;
    const x = px + Math.sin(a) * -d, z = pz + Math.cos(a) * -d;
    const m = this.spawnMonster('shadow', x, z);
    m.private = true;
    this.audio.monsterVoice('shadow', x, 1.6, z, 0.6);
    return m;
  }

  // ------------------------------------------------------------------ update
  update(dt, player, remotePlayers, camDir) {
    this.time += dt;
    const ppos = [player.pos.x, player.pos.y, player.pos.z];

    if (this.isHost()) this.hostSpawnLogic(dt, ppos);

    // private hallucination scheduling (every client schedules their own shadow)
    this.hallucTimer -= dt;
    if (this.hallucTimer <= 0) {
      this.hallucTimer = 90 + Math.random() * 120;
      if (Math.random() < 0.7) this.spawnHallucination(ppos[0], ppos[2], player.yaw);
    }

    const remove = [];
    for (const m of this.monsters.values()) {
      m.life += dt;
      if (m.private) this.updatePrivate(m, dt, player, camDir);
      else if (this.isHost()) this.updateHost(m, dt, player, remotePlayers);
      this.updateMesh(m, dt);
      this.updateVoice(m, dt, ppos);

      const d = Math.hypot(m.x - ppos[0], m.z - ppos[2]);
      if (d > m.def.despawnDist || m.life > 600) remove.push(m.id);
      if (m.state === 'gone') remove.push(m.id);

      // near callback (trauma + heartbeat)
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

  updateHost(m, dt, player, remotePlayers) {
    // gather all player positions
    const players = [{ id: -1, x: player.pos.x, z: player.pos.z }];
    if (remotePlayers) {
      for (const [id, p] of remotePlayers.players) players.push({ id, x: p.cur.x, z: p.cur.z });
    }
    // nearest player
    let nearest = null, nd = 1e9;
    for (const p of players) {
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      if (d < nd) { nd = d; nearest = p; }
    }

    switch (m.type) {
      case 'watcher': this.aiWatcher(m, dt, nearest, nd); break;
      case 'stalker': this.aiStalker(m, dt, nearest, nd); break;
      case 'runner': this.aiRunner(m, dt, nearest, nd); break;
      case 'mimic': this.aiMimic(m, dt, nearest, nd); break;
    }
  }

  moveToward(m, tx, tz, speed, dt) {
    // pathfind occasionally, steer the rest
    if (!m.path || m.pathI >= m.path.length || (m.repathT = (m.repathT || 0) - dt) <= 0) {
      const from = [Math.floor(m.x / CELL), Math.floor(m.z / CELL)];
      const to = [Math.floor(tx / CELL), Math.floor(tz / CELL)];
      m.path = bfsPath(this.world, from, to);
      m.pathI = 0;
      m.repathT = 1.5;
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
  }

  aiWatcher(m, dt, p, nd) {
    // keeps distance, repositions around the player, vanishes if observed long
    m.state = 'watch';
    if (p && nd > m.def.keepDist[1]) this.moveToward(m, p.x, p.z, 1.1, dt);
    if (p) m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
  }

  aiStalker(m, dt, p, nd) {
    m.state = 'stalk';
    if (!p) return;
    if (nd > m.def.keepDist[1]) this.moveToward(m, p.x, p.z, m.def.speed, dt);
    else if (nd < m.def.keepDist[0]) {
      // back away
      this.moveToward(m, m.x + (m.x - p.x), m.z + (m.z - p.z), m.def.speed * 0.7, dt);
    }
    m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
  }

  aiRunner(m, dt, p, nd) {
    if (m.state === 'idle' && p && nd < m.def.aggroRange) {
      m.state = 'charge';
      this.audio.monsterVoice('runner', m.x, 1.6, m.z, 1);
    }
    if (m.state === 'charge' && p) {
      this.moveToward(m, p.x, p.z, m.def.speed, dt);
      if (nd < 0.9) {
        // caught!
        m.state = 'gone';
        if (this.onCaught) this.onCaught(m, p);
      }
      if (nd > 30) m.state = 'gone'; // gave up
    }
  }

  aiMimic(m, dt, p, nd) {
    if (m.state === 'dormant') {
      if (p && nd < m.def.aggroRange) {
        m.state = 'reveal';
        m.mesh.userData.reveal();
        this.audio.creak();
      }
    } else if (m.state === 'reveal' && p) {
      this.moveToward(m, p.x, p.z, m.def.speed, dt);
      if (nd < 1.1) {
        m.state = 'gone';
        if (this.onCaught) this.onCaught(m, p);
      }
    }
  }

  // private hallucination: exists only locally; fades when looked at
  updatePrivate(m, dt, player, camDir) {
    const dx = m.x - player.pos.x, dz = m.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) m.yaw = Math.atan2(dx, dz);
    // is the player looking at it?
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot > 0.92) {
      m.observedT += dt;
      if (m.observedT > m.def.despawnLookAt) {
        m.state = 'gone'; // vanishes when directly observed
      }
    } else {
      m.observedT = Math.max(0, m.observedT - dt * 2);
    }
    // opacity flicker
    m.mesh.traverse((o) => {
      if (o.isMesh) { o.material.transparent = true; o.material.opacity = Math.max(0.15, 1 - m.observedT / m.def.despawnLookAt); }
    });
  }

  updateMesh(m, dt) {
    m.mesh.position.set(m.x, 0, m.z);
    m.mesh.rotation.y = m.yaw;
    // runner leg scramble animation
    if (m.type === 'runner' && m.state === 'charge') {
      const t = this.time * 14;
      const u = m.mesh.userData;
      if (u.legL) { u.legL.rotation.x = Math.sin(t) * 0.9; u.legR.rotation.x = -Math.sin(t) * 0.9; u.armL.rotation.x = -Math.sin(t) * 0.7; u.armR.rotation.x = Math.sin(t) * 0.7; }
    }
    // watcher slow sway
    if (m.type === 'watcher') {
      m.mesh.rotation.z = Math.sin(this.time * 0.4 + m.id) * 0.03;
    }
  }

  remove(id) {
    const m = this.monsters.get(id);
    if (!m) return;
    this.scene.remove(m.mesh);
    this.monsters.delete(id);
  }

  // ------------------------------------------------------------ networking
  hostSnapshot() {
    const list = [];
    for (const m of this.monsters.values()) {
      if (m.private) continue;
      list.push([m.id, TYPE_IDS.indexOf(m.type), +m.x.toFixed(2), +m.z.toFixed(2), +m.yaw.toFixed(2), stateCode(m.state)]);
    }
    return list;
  }

  applySnapshot(list) {
    if (this.isHost()) return; // host is authoritative
    const seen = new Set();
    for (const row of list) {
      const [id, typeIdx, x, z, yaw, state] = row;
      seen.add(id);
      let m = this.monsters.get(id);
      if (!m) {
        m = this.spawnMonster(TYPE_IDS[typeIdx] || 'watcher', x, z, id);
      }
      // store interpolation targets
      m.netX = x; m.netZ = z; m.netYaw = yaw; m.state = stateName(state);
      if (m.type === 'mimic' && stateName(state) !== 'dormant') m.mesh.userData.reveal();
    }
    for (const m of [...this.monsters.values()]) {
      if (!m.private && !seen.has(m.id)) this.remove(m.id);
    }
    // interpolate
    for (const m of this.monsters.values()) {
      if (m.private || m.netX === undefined) continue;
      m.x += (m.netX - m.x) * 0.25;
      m.z += (m.netZ - m.z) * 0.25;
      let dy = (m.netYaw || 0) - m.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * 0.25;
    }
  }
}

const STATE_CODES = { idle: 0, watch: 1, stalk: 2, charge: 3, dormant: 4, reveal: 5, gone: 6 };
function stateCode(s) { return STATE_CODES[s] ?? 0; }
function stateName(c) { return Object.keys(STATE_CODES).find((k) => STATE_CODES[k] === c) || 'idle'; }
