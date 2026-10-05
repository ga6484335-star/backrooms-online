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

export const TYPE_IDS = ['watcher', 'stalker', 'hunter', 'ambusher', 'mimic', 'shadow', 'runner', 'crawler', 'siren',
  'tallone', 'hollow', 'bonefiend', 'walldweller', 'deepone', 'ceiling', 'falseplayer',
  'theunstoppable', 'leech', 'king', 'flicker', 'drifter', 'statue', 'swarm', 'spitter',
  'drummer', 'worm', 'null', 'thresher', 'rememberer'];

// which monsters a level can produce (duplicates = weight)
const LEVEL_POOLS = [
  ['watcher', 'watcher', 'tallone', 'stalker', 'hollow', 'mimic', 'siren', 'falseplayer',
    'drifter', 'statue', 'swarm', 'drummer', 'rememberer'],
  ['stalker', 'hunter', 'ambusher', 'crawler', 'walldweller', 'walldweller', 'bonefiend', 'hollow',
    'flicker', 'statue', 'swarm', 'drummer', 'theunstoppable'],
  ['hunter', 'ambusher', 'ambusher', 'crawler', 'runner', 'bonefiend', 'ceiling', 'walldweller', 'hollow',
    'flicker', 'thresher', 'king', 'theunstoppable'],
  ['deepone', 'deepone', 'worm', 'siren', 'watcher', 'tallone', 'ambusher', 'ceiling',
    'leech', 'null', 'spitter'],
  ['stalker', 'stalker', 'mimic', 'mimic', 'hunter', 'falseplayer', 'walldweller', 'hollow', 'ceiling',
    'flicker', 'statue', 'drifter', 'rememberer', 'king', 'theunstoppable'],
  ['watcher', 'tallone', 'stalker', 'mimic', 'hunter', 'siren', 'runner', 'falseplayer', 'ceiling', 'bonefiend',
    'drifter', 'statue', 'swarm', 'drummer', 'null', 'thresher', 'rememberer', 'theunstoppable'],
  // Level 6 — the control deck. Every "reader" species; the Archivist throws
  // its favorite records at anyone trying to leave.
  ['flicker', 'flicker', 'rememberer', 'rememberer', 'falseplayer', 'hunter', 'runner', 'bonefiend', 'thresher',
    'king', 'swarm', 'drummer', 'null', 'statue', 'ceiling', 'walldweller', 'theunstoppable', 'theunstoppable'],
];
// hard caps so the world never fills with monsters
const CAPS = { watcher: 1, stalker: 1, hunter: 1, ambusher: 2, mimic: 2, runner: 1, crawler: 2, siren: 1,
  tallone: 1, hollow: 3, bonefiend: 1, walldweller: 2, deepone: 2, ceiling: 2, falseplayer: 1,
  theunstoppable: 1, leech: 2, king: 1, flicker: 2, drifter: 2, statue: 2, swarm: 3, spitter: 2,
  drummer: 2, worm: 2, null: 1, thresher: 1, rememberer: 1 };

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
    this.onScare = null; // non-lethal contact scare (hollow touch)
    this.lightMgr = null; // wired by main.js so monsters can kill lights
    this.getLightAt = () => 0.5;
    this.nearestThreat = null; // closest visible monster, for camera flinch
    this.getPlayers = null;

    // pacing state machine: quiet -> uneasy -> encounter -> cooldown -> quiet
    // durations shrink as the game goes on — the Backrooms get hungrier
    this.pacing = 'quiet';
    this.pacingT = 12 + Math.random() * 10;
    this.dwellCell = '';
    this.dwellT = 0;

    // horror director inputs, fed from the main loop
    this.director = { distance: 0, timePlayed: 0, deaths: 0, players: 1, level: 0, objectives: 0 };
    this.encounters = 0;      // total monsters spawned (guarantee+escalation)
    this.encounterAgo = 0;    // seconds since the last spawn
    this.tension = 0;         // spikes from objective/exit/story events
    this._tensionDecay = 0.05;
    this.storySpawnPending = null; // {type,x,z} queued by a story event

    this.hallucTimer = 50 + Math.random() * 60;
    this._visWarnings = new Set(); // warn-once per mesh class
  }

  bind(getPlayers) { this.getPlayers = getPlayers; }

  // a player died: brief mourning period, then the world starts hunting again
  notifyDeath() {
    this.director.deaths++;
    this.pacing = 'cooldown';
    this.pacingT = 18 + Math.random() * 18;
  }

  // a story event wants a specific creature to appear, now, at a place that
  // reads as a surprise: queued and spawned on the next host tick, avoiding
  // the player's view cone. Used when objectives complete / the exit opens /
  // a level transition lands, so encounters land on beats instead of at random.
  stageEncounter(type, x, z) {
    if (type && !MONSTER_TYPES[type]) return false; // null = director's choice
    this.storySpawnPending = { type: type || null, x, z };
    return true;
  }

  // pick from the current level's pool, preferring a lethal species
  pickStagedType(preferLethal = true) {
    const pool = LEVEL_POOLS[this.world.level] || LEVEL_POOLS[0];
    const active = [...this.monsters.values()].filter((m) => !m.private);
    const countOf = (t) => active.filter((m) => m.type === t).length;
    const valid = (t) => {
      const def = MONSTER_TYPES[t];
      if (!def) return false;
      if (def.levelOnly !== undefined && def.levelOnly !== this.world.level) return false;
      if (def.farSpawn) return false;
      return countOf(t) < (CAPS[t] || 1);
    };
    let cands = pool.filter((t) => valid(t) && (!preferLethal || MONSTER_TYPES[t].lethal));
    if (!cands.length) cands = pool.filter(valid);
    if (!cands.length) return null;
    return cands[(Math.random() * cands.length) | 0];
  }

  // ------------------------------------------------------------- spawning
  hostSpawnLogic(dt, player, players) {
    this.pacingT -= dt;
    this.encounterAgo += dt;

    // a staged story encounter outranks the pacing machine — it always fires
    if (this.storySpawnPending) {
      const s = this.storySpawnPending;
      this.storySpawnPending = null;
      const type = s.type || this.pickStagedType();
      if (type) {
        const watchers = [{ x: player.pos.x, z: player.pos.z, yaw: player.yaw },
          ...(players || []).map((p) => ({ x: p.x, z: p.z, yaw: p.yaw }))];
        const px = (s.x !== undefined) ? s.x : player.pos.x;
        const pz = (s.z !== undefined) ? s.z : player.pos.z;
        const spawned = this.spawnPlaced(type, px, pz, watchers);
        if (spawned) {
          const pack = Math.min(3, MONSTER_TYPES[type].pack || 1);
          for (let i = 1; i < pack; i++) {
            const cell = this.worldMgr.monstersSpawnCell(spawned.x, spawned.z);
            this.spawnMonster(type, (cell[0] + 0.5) * CELL, (cell[1] + 0.5) * CELL);
          }
          this.encounters++;
          this.encounterAgo = 0;
          this.pacing = 'encounter';
          this.pacingT = 30 + Math.random() * 25;
          this.audio.monsterVoice(type, spawned.x, 1.5, spawned.z, 1.1);
          return;
        }
      }
    }

    // dwell tracking: lingering in one cell raises danger
    const cc = `${Math.floor(player.pos.x / CELL)},${Math.floor(player.pos.z / CELL)}`;
    if (cc === this.dwellCell) this.dwellT += dt; else { this.dwellCell = cc; this.dwellT = 0; }

    // hoisted: shared by every pacing case (declaring it inside one case would
    // leave it in the temporal dead zone when a later case is entered directly)
    const playT = this.director.timePlayed || 0;

    switch (this.pacing) {
      case 'quiet':
        if (this.pacingT <= 0) {
          this.pacing = 'uneasy';
          this.pacingT = playT < 90 ? 7 + Math.random() * 7 : playT < 240 ? 5 + Math.random() * 5 : 3 + Math.random() * 3;
        }
        break;
      case 'uneasy':
        if (this.pacingT <= 0) {
          const active = [...this.monsters.values()].filter((m) => !m.private);
          const playerCount = this.director.players || (1 + (players ? players.length : 0));
          const darkness = 1 - this.getLightAt(player.pos.x, player.pos.z);
          const noise = player.anim === 'run' ? 0.2 : player.anim === 'walk' ? 0.07 : 0;
          const dwell = Math.min(0.3, this.dwellT / 90 * 0.3);
          const crowd = Math.min(0.18, playerCount * 0.035);
          // distance-based escalation: the deeper you travel, the hungrier it gets
          const dist = this.director.distance;
          const depthBonus = dist < 60 ? -0.2 : dist < 400 ? 0 : Math.min(0.22, (dist - 400) / 2000);
          // progression reactivity: the world gets hungrier as the level deepens,
          // as objectives are read, and for a while after an escalated event.
          const levelBonus = Math.min(0.22, (this.world.level || 0) * 0.034);
          const objProgress = this.director.objectives || 0;
          const objBonus = objProgress * 0.18;
          const tension = Math.min(0.4, (this.tension || 0) * 0.07);
          // baseline encounter chance is deliberately higher than a slow burn:
          // the world should feel dangerous, with a lull after each encounter
          // rather than long empty stretches.
          let chanceOf = 0.6 + darkness * 0.22 + noise + dwell + crowd + depthBonus
            + levelBonus + objBonus + tension - active.length * 0.16;
          // guaranteed encounters: past ~60m the director WILL bring the
          // first one; afterwards the chance creeps up the longer it's quiet
          let guaranteed = false;
          if (this.encounters === 0 && (dist > 55 || this.director.timePlayed > 20)) { chanceOf = 1; guaranteed = true; }
          else if (this.encounterAgo > 38) chanceOf = Math.min(1, chanceOf + (this.encounterAgo - 38) / 45);
          // dynamic cap: more players and more time spent = more monsters
          const globalCap = Math.min(16, (playT < 90 ? 5 : playT < 240 ? 6 : playT < 420 ? 8 : 10) + playerCount);
          // first-encounter guarantee must not be eaten by a lingering idle
          // silhouette: dormant mood species don't count against the cap there
          const blockers = guaranteed
            ? active.filter((m) => m.def.lethal && !['idle', 'dormant', 'watch'].includes(m.state))
            : active;
          if (Math.random() < chanceOf && blockers.length < globalCap) {
            const pool = LEVEL_POOLS[this.world.level] || LEVEL_POOLS[0];
            const countOf = (t) => active.filter((m) => m.type === t).length;
            const valid = (t) => {
              const def = MONSTER_TYPES[t];
              if (!def) return false;
              if (def.levelOnly !== undefined && def.levelOnly !== this.world.level) return false;
              if (dist < 70 && def.lethal) return false; // grace period
              if (def.farSpawn && dist < 200) return false; // deep-world creatures
              return countOf(t) < (CAPS[t] || 1);
            };
            // rarity-weighted pick: roll against def.rarity, repick on failure
            let type = null;
            for (let tries = 0; tries < 7 && !type; tries++) {
              const cand = pool[(Math.random() * pool.length) | 0];
              if (!valid(cand)) continue;
              const r = guaranteed ? 1 : (MONSTER_TYPES[cand].rarity ?? 0.15);
              if (Math.random() < r * 4.0) type = cand; // more generous than before
            }
            const watchers = [{ x: player.pos.x, z: player.pos.z, yaw: player.yaw },
              ...(players || []).map((p) => ({ x: p.x, z: p.z, yaw: p.yaw }))];
            if (type) {
              const spawned = this.spawnPlaced(type, player.pos.x, player.pos.z, watchers);
              if (spawned) {
                // packs: some species arrive together
                const pack = Math.min(3, MONSTER_TYPES[type].pack || 1);
                for (let i = 1; i < pack; i++) {
                  const cell = this.worldMgr.monstersSpawnCell(spawned.x, spawned.z);
                  if (countOf(type) + i < (CAPS[type] || 1)) {
                    this.spawnMonster(type, (cell[0] + 0.5) * CELL, (cell[1] + 0.5) * CELL);
                  }
                }
                this.encounters++;
                this.encounterAgo = 0;
                this.pacing = 'encounter';
                this.pacingT = 24 + Math.random() * 24;
                break;
              }
            }
          }
          this.pacing = 'cooldown';
          // (playT hoisted above)
          this.pacingT = playT < 90 ? 8 + Math.random() * 9 : playT < 240 ? 5 + Math.random() * 6 : 3 + Math.random() * 4;
        }
        break;
      case 'encounter':
        if (this.pacingT <= 0 || ![...this.monsters.values()].some((m) => !m.private)) {
          this.pacing = 'cooldown';
          // (playT hoisted above)
          this.pacingT = playT < 90 ? 8 + Math.random() * 9 : playT < 240 ? 5 + Math.random() * 6 : 3 + Math.random() * 4;
        }
        break;
      case 'cooldown':
        if (this.pacingT <= 0) {
          this.pacing = 'quiet';
          // (playT hoisted above)
          this.pacingT = playT < 90 ? 7 + Math.random() * 7 : playT < 240 ? 5 + Math.random() * 5 : 3 + Math.random() * 3;
        }
        break;
    }
  }

  // pick a sensible spawn position for the species, never inside a player's
  // view cone — encounters emerge from corners, darkness, unexplored rooms
  spawnPlaced(type, px, pz, watchers = []) {
    const def = MONSTER_TYPES[type];
    // rejects a spot if any player within 50m has line of sight on it while
    // the spot sits inside their view cone (they'd see it materialise)
    const blocked = (sx, sz) => watchers.some((w) => {
      const dx = sx - w.x, dz = sz - w.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.01) return true;
      if (d > 50) return false;
      const fx = -Math.sin(w.yaw || 0), fz = -Math.cos(w.yaw || 0);
      if ((dx * fx + dz * fz) / d > 0.4 && this.hasLOS(w.x, w.z, sx, sz)) return true;
      return false;
    });
    if (def.farSpawn) {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 55 + Math.random() * (Math.min(220, def.despawnDist * 0.7) - 55);
        const sx = px + Math.cos(a) * d, sz = pz + Math.sin(a) * d;
        const cx = Math.floor(sx / CELL), cz = Math.floor(sz / CELL);
        if (!blocked(sx, sz) && !this.world.cellAt(cx, cz).special) {
          return this.spawnMonster(type, (cx + 0.5) * CELL, (cz + 0.5) * CELL);
        }
      }
    }
    let fallback = null;
    for (let tries = 0; tries < 8; tries++) {
      const cell = this.worldMgr.monstersSpawnCell(px, pz);
      const sx = (cell[0] + 0.5) * CELL, sz = (cell[1] + 0.5) * CELL;
      if (blocked(sx, sz)) continue;
      if (!fallback) fallback = [sx, sz];
      // prefer a spawn some watcher will actually run into: line of sight
      // along an approach corridor, not behind ten closed loops
      const seen = watchers.some((w) => {
        const d = Math.hypot(sx - w.x, sz - w.z);
        return d > 12 && d < 60 && this.hasLOS(w.x, w.z, sx, sz);
      });
      if (seen) return this.spawnMonster(type, sx, sz);
    }
    if (fallback) return this.spawnMonster(type, fallback[0], fallback[1]);
    return null;
  }

  spawnMonster(type, x, z, forcedId) {
    const def = MONSTER_TYPES[type];
    const id = forcedId ?? (this.nextId++);
    const mesh = buildMonster(type);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const m = {
      id, type, def, mesh,
      x, z, y: def.ceilingHug ? 2.75 : (def.submerged ? -0.55 : 0),
      yaw: Math.random() * Math.PI * 2,
      state: (type === 'mimic' || type === 'ambusher' || type === 'walldweller' || type === 'ceiling' || type === 'deepone') ? 'dormant' : 'idle',
      target: null, path: null, pathI: 0,
      voiceTimer: 6 + Math.random() * 10,
      life: 0, observedT: 0,
      stateT: 0, lastSeen: null, interest: null,
      patrolTarget: null, animT: Math.random() * 10,
      homeX: x, homeZ: z,
      lit: false, litT: 0, lurchT: Math.random(), jerkSeed: Math.random() * 10,
      nearD: 999, observed: false, aiAccum: 0, envT: 0, clatterT: 0, poseT: 0,
      dwellUnder: 0,
    };
    // species that masquerade as the environment get transparent-capable mats
    if (def.flashReact === 'reveal' || def.submerged) {
      mesh.traverse((o) => { if (o.isMesh) { o.material.transparent = true; } });
    }
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
    // returns {player, nd, seen, heard, lit, litBy, observed}
    let best = null, bestScore = 1e9;
    let lit = false, litBy = null, observed = false;
    for (const p of players) {
      const dx = p.x - m.x, dz = p.z - m.z;
      const nd = Math.hypot(dx, dz);
      let seen = false, heard = false;
      if (m.def.vision > 0 && nd < m.def.vision) {
        // field of view: monsters yaw with atan2(dx,dz) so their forward is (sin,cos)
        const fov = ((m.def.fov ?? 120) / 2) * (Math.PI / 180);
        const fwx = Math.sin(m.yaw), fwz = Math.cos(m.yaw);
        const inCone = nd < 0.9 || ((fwx * dx + fwz * dz) / nd) > Math.cos(fov);
        if (inCone && this.hasLOS(m.x, m.z, p.x, p.z)) {
          const light = this.getLightAt(p.x, p.z);
          const flash = p.fl ? 1.6 : 1;
          const moving = p.anim === 'run' ? 1.25 : p.anim === 'walk' ? 1 : 0.65;
          const effRange = m.def.vision * (0.35 + light * 0.65) * flash * moving;
          if (nd < effRange) seen = true; else if (nd < 1.2) seen = true; // point-blank regardless
        }
      }
      if (m.def.hearing > 0 && nd < m.def.hearing) {
        if (p.anim === 'run' && nd < HEAR_RUN) heard = true;
        else if (p.anim === 'walk' && nd < HEAR_WALK) heard = true;
      }
      // flashlight cone: is this player shining their beam on the monster?
      // dx,dz point monster->player, so the player->monster direction is -dx,-dz
      if (p.fl && p.yaw !== undefined && nd < 22) {
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
        const dot = nd > 0.01 ? (-dx * fx - dz * fz) / nd : 1;
        // ceiling things live above: the cone is wider for them (aiming up)
        const cone = m.def.ceilingHug ? 0.45 : 0.86;
        if (dot > cone && this.hasLOS(p.x, p.z, m.x, m.z)) { lit = true; litBy = p; }
      }
      // is any player LOOKING at the monster? (observation, separate from light)
      if (p.yaw !== undefined && nd < 90) {
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
        const dot = nd > 0.01 ? (-dx * fx - dz * fz) / nd : 1;
        if (dot > 0.9 && this.hasLOS(p.x, p.z, m.x, m.z)) observed = true;
      }
      const score = nd - (seen ? 100 : 0) - (heard ? 50 : 0);
      if (score < bestScore) { bestScore = score; best = { player: p, nd, seen, heard }; }
    }
    if (best) { best.lit = lit; best.litBy = litBy; best.observed = observed; }
    return best;
  }

  // ------------------------------------------------------------- update
  update(dt, player, remotePlayers) {
    this.time += dt;
    this.updateTension(dt);
    const ppos = [player.pos.x, player.pos.y, player.pos.z];

    // unified player list for detection (local + remote) — yaw needed so
    // monsters can tell when someone is LOOKING at them or lighting them up
    const players = [{ id: -1, x: player.pos.x, z: player.pos.z, anim: player.anim, fl: player.flashOn ? 1 : 0, dead: player.dead, yaw: player.yaw }];
    if (remotePlayers) {
      for (const [id, p] of remotePlayers.players) {
        players.push({ id, x: p.cur.x, z: p.cur.z, anim: p.cur.anim || 'idle', fl: p.cur.fl || 0, dead: p.cur.dead, yaw: p.cur.yaw });
      }
    }
    const alivePlayers = players.filter((p) => !p.dead);

    if (this.isHost()) this.hostSpawnLogic(dt, player, alivePlayers.slice(1));

    // private hallucination scheduling
    // relocate far-away test-dbg spawns into a nearby corridor so they
    // stay reachable instead of drifting beyond despawnDist mid-encounter
    for (const m of [...this.monsters.values()]) {
      if (m.private || !m.def) continue;
      const pd = Math.hypot(m.x - ppos[0], m.z - ppos[2]);
      if (pd > m.def.despawnDist * 0.6 && (m.stateT > 8 || m.tolerantMove !== undefined)) {
        const cell = this.worldMgr.monstersSpawnCell(ppos[0], ppos[2]);
        m.x = (cell[0] + 0.5) * CELL;
        m.z = (cell[1] + 0.5) * CELL;
        m.mesh.position.set(m.x, m.y || 0, m.z);
      }
    }
    this.hallucTimer -= dt;
    if (this.hallucTimer <= 0) {
      this.hallucTimer = 90 + Math.random() * 120;
      if (Math.random() < 0.7) this.spawnHallucination(ppos[0], ppos[2], player.yaw);
    }

    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const remove = [];
    let threat = null, threatD = 999;
    for (const m of this.monsters.values()) {
      m.life += dt;
      m.stateT += dt;
      const d = Math.hypot(m.x - ppos[0], m.z - ppos[2]);
      m.nearD = d;
      if (!m.private && d < 25 && d < threatD && this.hasLOS(player.pos.x, player.pos.z, m.x, m.z)) {
        threat = m; threatD = d;
      }
      // local observation: the player's gaze — drives pose-snapping creatures
      const dx = m.x - ppos[0], dz = m.z - ppos[2];
      m.observed = d < 90 && d > 0.01 && (dx * fx + dz * fz) / d > 0.93;
      // local flashlight test for rendering (host decisions use detect()'s det.lit)
      const cone = m.def.ceilingHug ? 0.45 : 0.86;
      m.litLocal = !!(player.flashOn && d < 22 && d > 0.01 && (dx * fx + dz * fz) / d > cone);

      if (m.private) this.updatePrivate(m, dt, player);
      else if (this.isHost()) {
        // distance-throttled AI: far monsters think less often
        m.aiAccum += dt;
        const interval = m.nearD < 45 ? 0 : m.nearD < 110 ? 0.25 : 0.8;
        if (m.aiAccum >= interval) {
          const step = m.aiAccum; m.aiAccum = 0;
          this.updateHost(m, step, alivePlayers);
        }
      }
      this.updateMesh(m, dt);
      this.updateVoice(m, dt, ppos);
      this.envInteraction(m, dt);

      if (!m.tolerantMove && (d > m.def.despawnDist || m.life > 600)) remove.push(m.id);
      if (m.state === 'gone') remove.push(m.id);

      if (d < 6 && this.onNearCallback) this.onNearCallback(m, d);
    }
    for (const id of remove) this.remove(id);
    // nearest visible threat — camera body language (flinch) reads this
    this.nearestThreat = threat && threatD < 999 ? { def: threat.def, d: threatD } : null;
  }

  // monsters brush against the world: doors groan when they pass through,
  // things get knocked over during chases. Runs on every client from the
  // synced position, so everyone hears the same haunting.
  envInteraction(m, dt) {
    if (m.private) return;
    m.envT -= dt; m.clatterT -= dt;
    const cellKey = `${Math.floor(m.x / CELL)},${Math.floor(m.z / CELL)}`;
    if (m.moving && m.envT <= 0 && cellKey !== m._lastCell) {
      m._lastCell = cellKey;
      const cx = Math.floor(m.x / CELL), cz = Math.floor(m.z / CELL);
      for (let dir = 0; dir < 4; dir++) {
        const w = this.world.wallInfo(cx, cz, dir);
        if (w.wall && w.door && Math.random() < 0.3) {
          m.envT = 5;
          if (m.nearD < 45) this.audio.doorCreak(m.x, m.z);
          break;
        }
      }
    }
    // heavy things knock objects over mid-chase
    if (m.state === 'chase' && m.clatterT <= 0 && m.nearD < 40 && Math.random() < dt * 0.5) {
      m.clatterT = 3;
      this.audio.metalClatter(m.x, m.z);
    }
    // deep ones displace water when they move
    if (m.def.submerged && m.moving && m.clatterT <= 0 && m.nearD < 35) {
      m.clatterT = 0.9;
      this.audio.splash(m.x, m.z, Math.max(0.2, 1 - m.nearD / 35));
    }
  }

  updateVoice(m, dt, ppos) {
    m.voiceTimer -= dt;
    if (m.voiceTimer <= 0) {
      m.voiceTimer = 8 + Math.random() * 16;
      const d = Math.hypot(m.x - ppos[0], m.z - ppos[2]);
      // far figures carry: you hear the tall one's drone across the whole floor
      const range = m.def.farSpawn ? 110 : 40;
      if (d < range) {
        this.audio.monsterVoice(m.type, m.x, 1.6, m.z, Math.max(0.2, 1 - d / range));
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

    // ---- generic flashlight reactions, applied before species AI ----
    m.lit = !!(det && det.lit);
    if (m.lit) m.litT += dt; else m.litT = 0;
    switch (m.def.flashReact) {
      case 'enrage':
        // light on its skin is a declaration of war
        if (m.lit && det.litBy && m.state !== 'chase' && m.state !== 'attack' && m.state !== 'cooldown') {
          m.target = det.litBy;
          m.lastSeen = [det.litBy.x, det.litBy.z];
          this.setState(m, 'chase');
          this.audio.monsterVoice(m.type, m.x, 1.6, m.z, 1);
        }
        break;
      case 'vanish':
        if (m.lit && m.litT > 0.6) {
          if (m.def.submerged) {
            // the deep one just slides under
            this.setState(m, 'dormant');
            m.submergeT = 5 + Math.random() * 4;
          } else {
            this.setState(m, 'gone');
            this.audio.behindYou(); // a soft breath where it stood
            return;
          }
        }
        break;
    }

    switch (m.type) {
      case 'watcher': this.aiWatcher(m, dt, det); break;
      case 'stalker': this.aiStalker(m, dt, det); break;
      case 'hunter': this.aiHunter(m, dt, det); break;
      case 'ambusher': this.aiAmbusher(m, dt, det); break;
      case 'mimic': this.aiMimic(m, dt, det); break;
      case 'runner': this.aiRunner(m, dt, det); break;
      case 'crawler': this.aiCrawler(m, dt, det); break;
      case 'siren': this.aiSiren(m, dt, det); break;
      case 'tallone': this.aiTallone(m, dt, det); break;
      case 'hollow': this.aiHollow(m, dt, det); break;
      case 'bonefiend': this.aiBonefiend(m, dt, det); break;
      case 'walldweller': this.aiWalldweller(m, dt, det); break;
      case 'deepone': this.aiDeepone(m, dt, det); break;
      case 'ceiling': this.aiCeiling(m, dt, det); break;
      case 'falseplayer': this.aiFalseplayer(m, dt, det); break;
      case 'theunstoppable': this.aiUnstoppable(m, dt, det); break;
      case 'leech': this.aiLeech(m, dt, det); break;
      case 'king': this.aiKing(m, dt, det); break;
      case 'flicker': this.aiFlicker(m, dt, det); break;
      case 'drifter': this.aiDrifter(m, dt, det); break;
      case 'statue': this.aiStatue(m, dt, det); break;
      case 'swarm': this.aiSwarm(m, dt, det); break;
      case 'spitter': this.aiSpitter(m, dt, det); break;
      case 'drummer': this.aiDrummer(m, dt, det); break;
      case 'worm': this.aiWorm(m, dt, det); break;
      case 'null': this.aiNull(m, dt, det); break;
      case 'thresher': this.aiThresher(m, dt, det); break;
      case 'rememberer': this.aiRememberer(m, dt, det); break;
    }
  }

  // a monster kills the nearest light fixture — and everyone sees it die
  killLightNear(x, z) {
    if (!this.lightMgr || !this.isHost()) return;
    const key = this.lightMgr.killNearest(x, z, 9);
    if (key && this.network) this.network.sendEvent('lightdie', { key });
  }

  moveToward(m, tx, tz, speed, dt) {
    // lurch species move in violent discrete bursts, then freeze mid-step
    if (m.def.lurch) {
      m.lurchT += dt;
      if ((m.lurchT % 1.15) > 0.42) { m.moving = false; return; }
      speed *= 1.9; // the burst covers the whole stride
    }
    m.bonusSpeed = Math.max(0, (m.bonusSpeed || 0) - dt * (m.def.speed || 1) * 0.12);
    speed = Math.min(speed + m.bonusSpeed, m.def.speed * 1.7);
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

  // ---- progression reactivity -------------------------------------------
  // A loud world event (an intake node reading, the exit opening) does two
  // things: it raises ambient tension for a while, and nearby monsters drop
  // what they are doing and converge on the noise. Co-op makes this a shared
  // risk — reading a node is powerful but draws the room to you.
  escalate(amount = 1, decay = 0.05) {
    this.tension = Math.min(6, (this.tension || 0) + amount);
    this._tensionDecay = decay;
  }

  updateTension(dt) {
    if (this.tension > 0) {
      this.tension = Math.max(0, this.tension - dt * (this._tensionDecay || 0.05));
    }
  }

  // send every nearby monster toward (x,z) without a specific quarry. They
  // sweep the area, hunting for whoever was foolish enough to make the noise.
  alertArea(x, z, radius = 30) {
    const r2 = radius * radius;
    for (const m of this.monsters.values()) {
      if (m.scare || m.private || !m.def) continue;
      const d2 = (m.x - x) * (m.x - x) + (m.z - z) * (m.z - z);
      if (d2 > r2) continue;
      m.lastSeen = [x, z];
      m.searchSpot = [x, z];
      m.searchT = 9;
      if (m.def.lethal) {
        m.state = 'search';
        m.stateT = 0;
        m.bonusSpeed = (m.def.speed || 1) * 0.4;
      } else if (m.def.moveWhenUnseen || m.def.retreatWhenSeen) {
        m.state = 'watch';
      }
      this.audio.monsterVoice(m.type, m.x, 1.5, m.z, 0.7);
    }
  }

  // ---- THE SCREAM: every creature in the room hears a human scream, no
  // hearing-range gates. It head-thinks, locks the screamer, and hunts.
  hearScream(x, z, pid, players) {
    const t = players.find((p) => p.id === pid);
    if (!t) return;
    for (const m of this.monsters.values()) {
      if (m.scare) continue;          // director puppets don't join the hunt
      if (m.private || !m.def) continue; // local hallucinations stay personal
      m.target = { id: t.id, x: t.x, z: t.z };
      m.lastSeen = [t.x, t.z];
      m.state = 'chase';
      m.stateT = 0;
      m.bonusSpeed = m.def.speed * 0.75; // ~75% faster, clamped by moveToward
      this.audio.monsterVoice(m.type, m.x, 1.6, m.z, 0.9);
    }
  }

// ---- generic lethal hunt cycle for aggressive species ----------------
  // sense -> chase (BFS pathing) -> attack. When the prey vanishes, the
  // monster heads to the last known position and SWEEPS nearby corridors
  // instead of giving up. It only re-arms once the sweep finds nothing.
  huntChase(m, dt, det, opts = {}) {
    const searchTime = opts.searchTime ?? 7;
    const rearm = opts.rearm ?? 'patrol';
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      m.searchT = searchTime;
      if (m.state !== 'chase' && m.state !== 'attack') {
        this.setState(m, 'chase');
        this.audio.monsterVoice(m.type, m.x, 1.5, m.z, 1);
      }
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      this.attackCheck(m, det);
      return;
    }
    if (m.lastSeen) {
      // lost the target: go to last known spot, then sweep around it
      m.searchT = (m.searchT ?? searchTime) - dt;
      if (m.searchT > 0) {
        this.setState(m, 'search');
        if (!m.searchSpot || Math.hypot(m.searchSpot[0] - m.x, m.searchSpot[1] - m.z) < 1.2) {
          const a = Math.random() * Math.PI * 2;
          m.searchSpot = [
            m.lastSeen[0] + Math.cos(a) * (2 + Math.random() * 5),
            m.lastSeen[1] + Math.sin(a) * (2 + Math.random() * 5),
          ];
        }
        this.moveToward(m, m.searchSpot[0], m.searchSpot[1], m.def.speed * 0.7, dt);
        return;
      }
      m.lastSeen = null;
      m.searchSpot = null;
    }
    if (rearm === 'dormant') { this.setState(m, 'dormant'); m.moving = false; }
    else if (rearm === 'gone') this.setState(m, 'gone');
    else { this.setState(m, 'patrol'); this.wander(m, dt, 0.9); }
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
    if (m.state === 'attack' || m.state === 'chase' || m.state === 'search') {
      this.huntChase(m, dt, det, { rearm: 'dormant', searchTime: 5 });
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
    this.huntChase(m, dt, det, { rearm: 'dormant', searchTime: 6 });
  }

  // ---- THE RUNNER: sits still, keening quietly; the instant it is seen at
  // close range it screams and sprints. Very fast, very lethal, gives up fast.
  aiRunner(m, dt, det) {
    if (m.state === 'chase' || m.state === 'attack' || m.state === 'search') {
      // outruns stamina but not walls: sweeps briefly, then refolds and waits
      this.huntChase(m, dt, det, { rearm: 'dormant', searchTime: 8 });
      return;
    }
    // dormant sprinter: frozen mid-crouch, waiting for the wrong moment
    this.setState(m, 'dormant');
    m.moving = false;
    if (det && (det.seen && det.nd < m.def.aggroRange || det.nd < 6)) {
      this.setState(m, 'chase');
      this.audio.monsterVoice('runner', m.x, 1.5, m.z, 1); // the warning scream
    }
  }

  // ---- THE CRAWLER: skitters through narrow spaces; short lethal lunge when
  // a lit, close target presents itself. Avoids open bright rooms.
  aiCrawler(m, dt, det) {
    if (m.state === 'chase' || m.state === 'attack' || m.state === 'search') {
      this.huntChase(m, dt, det, { rearm: 'patrol', searchTime: 6 });
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 1.4);
    if (det && det.nd < m.def.aggroRange) {
      const light = this.getLightAt(det.player.x, det.player.z);
      // bold in the dark, shy in the light
      if (light < 0.55 || det.nd < 3) {
        this.setState(m, 'chase');
        this.audio.monsterVoice('crawler', m.x, 0.5, m.z, 1);
      }
    }
  }

  // ---- THE SIREN: stands far away and sings. Never attacks. If you close
  // the distance it is simply gone — and the song stops.
  aiSiren(m, dt, det) {
    if (!det) { this.setState(m, 'idle'); m.moving = false; return; }
    const p = det.player, nd = det.nd;
    m.yaw = Math.atan2(p.x - m.x, p.z - m.z); // always facing you, singing
    this.setState(m, 'watch');
    if (nd < 7) {
      this.setState(m, 'gone'); // approached: never was there
      return;
    }
    if (nd > m.def.keepDist[1] * 2) { this.setState(m, 'gone'); return; }
    // drift slowly to hold the haunting distance
    if (nd < m.def.keepDist[0]) this.moveToward(m, m.x + (m.x - p.x), m.z + (m.z - p.z), m.def.speed, dt);
    else if (nd > m.def.keepDist[1]) this.moveToward(m, p.x, p.z, m.def.speed, dt);
    else m.moving = false;
  }

  // ---- THE TALL ONE: a far silhouette. Holds a pose while watched, snaps to
  // a new one when unobserved, creeps closer when nobody looks. Never attacks.
  aiTallone(m, dt, det) {
    if (!det) { this.setState(m, 'idle'); m.moving = false; return; }
    const p = det.player, nd = det.nd;
    m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
    this.setState(m, 'watch');
    if (nd < 7) { this.setState(m, 'gone'); return; } // approached: gone
    if (nd > m.def.despawnDist * 0.9) { this.setState(m, 'gone'); return; }
    if (!det.observed) {
      // unobserved: it gets closer, and its posture is different now
      m.poseT -= dt;
      if (m.poseT <= 0) {
        m.poseT = 1.6 + Math.random() * 2;
        if (m.mesh.userData.setPose) m.mesh.userData.setPose((Math.random() * 4) | 0);
      }
      if (nd > m.def.keepDist[0]) this.moveToward(m, p.x, p.z, m.def.speed, dt);
      else m.moving = false;
    } else {
      m.moving = false; // absolutely still while watched
    }
  }

  // ---- THE UNSTOPPABLE: cannot be defeated, slowed, or stopped.
  // No combat solution exists. Run.
  aiUnstoppable(m, dt, det) {
    if (det) {
      m.target = det.player;
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.audio.monsterVoice('theunstoppable', m.x, 1.7, m.z, 1);
      // faster than every player; if it can see or hear you it keeps coming
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.5, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    // no target: sweep the last known position, then resume patrolling
    if (m.lastSeen) {
      this.setState(m, 'search');
      if (!m.searchSpot || Math.hypot(m.searchSpot[0] - m.x, m.searchSpot[1] - m.z) < 1.2) {
        const a = Math.random() * Math.PI * 2;
        m.searchSpot = [
          m.lastSeen[0] + Math.cos(a) * (2 + Math.random() * 5),
          m.lastSeen[1] + Math.sin(a) * (2 + Math.random() * 5),
        ];
      }
      this.moveToward(m, m.searchSpot[0], m.searchSpot[1], m.def.speed * 0.8, dt);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 1.1);
  }

  // ---- THE LEECH: low-profile crawler, fast, short lethal lunge.
  aiLeech(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 0.6, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 1.2);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.8);
  }

  // ---- THE KING: slow, towering, hears little but sees far.
  aiKing(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.8, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 0.9);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.6);
  }

  // ---- THE FLICKER: teleports a step whenever it would be observed.
  aiFlicker(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      // blink-step: closes distance in discrete jumps instead of gliding
      if (!m.blinkT || m.blinkT <= 0) {
        m.blinkT = 0.3;
        m.x = det.player.x - (det.player.x - m.x) * 0.85;
        m.z = det.player.z - (det.player.z - m.z) * 0.85;
      } else m.blinkT -= dt;
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.4, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 1.0);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.8);
  }

  // ---- THE DRIFTER: only ever faces sideways; slides when unobserved.
  aiDrifter(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.3, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 1.1);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.7);
  }

  // ---- THE STATUE: moves only when unobserved. Freezes in the beam.
  aiStatue(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.5, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 1.0);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.8);
  }

  // ---- THE SWARM: fast pack hunter, many small bodies piling into light.
  aiSwarm(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 0.5, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 1.4);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 1.2);
  }

  // ---- THE SPITTER: does not walk; it waits at a doorway and spits.
  aiSpitter(m, dt, det) {
    if (det && det.nd < m.def.attackRange) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      // it lunges toward you, but it doesn't run far — it waits at the door
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < 1.0) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.4, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    this.setState(m, 'dormant');
    m.moving = false;
  }

  // ---- THE DRUMMER: blind. hunts by sound; light enrages it.
  aiDrummer(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed * (m.lit ? 1.3 : 1), dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.6, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 1.1);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.9);
  }

  // ---- THE WORM: flooded levels only; moves through water like it isn't there.
  aiWorm(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.5, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 1.3);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.8);
  }

  // ---- THE NULL: no voice, no footsteps. stands where you were.
  aiNull(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.4, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 1.0);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.8);
  }

  // ---- THE THRESHER: blade-armed; cuts through the corridor itself.
  aiThresher(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.7, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 1.0);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.9);
  }

  // ---- THE REMEMBERER: memorises rooms it has seen you in; walks back
  // through them in order when it loses you.
  aiRememberer(m, dt, det) {
    if (det) {
      m.lastSeen = [det.player.x, det.player.z];
      this.setState(m, 'chase');
      this.moveToward(m, det.player.x, det.player.z, m.def.speed, dt);
      if (det.nd < m.def.attackRange) {
        this.setState(m, 'attack');
        this.audio.monsterAttack(m.x, 1.5, m.z);
        if (this.onCaught) this.onCaught(m, det.player);
        this.setState(m, 'cooldown');
        return;
      }
      return;
    }
    if (m.lastSeen) {
      this.setState(m, 'search');
      this.wander(m, dt, 0.9);
      return;
    }
    this.setState(m, 'patrol');
    this.wander(m, dt, 0.7);
  }

  // ---- THE HOLLOW: motionless congregation. Lurches toward you in the dark,
  // freezes stone-still in your beam. Touching it = it was never there.
  aiHollow(m, dt, det) {
    if (!det) { this.setState(m, 'dormant'); m.moving = false; return; }
    const p = det.player, nd = det.nd;
    if (m.state === 'dormant' || m.state === 'idle') {
      m.moving = false;
      if (nd < m.def.aggroRange || det.heard) {
        this.setState(m, 'stalk');
        this.audio.monsterVoice('hollow', m.x, 1.6, m.z, 0.9);
      } else {
        this.setState(m, 'dormant');
      }
      return;
    }
    // lit: frozen mid-lurch, face-hole aimed at you
    if (m.lit) {
      m.moving = false;
      m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
      this.setState(m, 'watch');
      return;
    }
    this.setState(m, 'stalk');
    m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
    this.moveToward(m, p.x, p.z, m.def.speed, dt);
    if (nd < m.def.attackRange) {
      // contact: a scream of static, then nothing was ever there
      if (this.onScare) this.onScare(m, p);
      this.audio.monsterVoice('hollow', m.x, 1.6, m.z, 1);
      this.setState(m, 'gone');
    }
    if (nd > 45) this.setState(m, 'gone');
  }

  // ---- THE BONE ONE: hunts by sound in dry knocking bursts. Light enrages it.
  aiBonefiend(m, dt, det) {
    switch (m.state) {
      case 'idle': case 'patrol': {
        this.wander(m, dt, 1.1);
        this.setState(m, 'patrol');
        if (det && (det.heard || det.seen)) {
          m.interest = [det.player.x, det.player.z];
          this.setState(m, 'hear_player');
          this.audio.monsterVoice('bonefiend', m.x, 1.4, m.z, 0.8);
        }
        break;
      }
      case 'hear_player': case 'investigate': {
        if (!m.interest) { this.setState(m, 'patrol'); break; }
        this.setState(m, 'investigate');
        this.moveToward(m, m.interest[0], m.interest[1], m.def.speed * 0.5, dt);
        if (det && (det.heard || (det.seen && det.nd < 8))) {
          m.target = det.player; m.lastSeen = [det.player.x, det.player.z];
          this.setState(m, 'chase');
          this.audio.monsterVoice('bonefiend', m.x, 1.4, m.z, 1);
        } else if (Math.hypot(m.interest[0] - m.x, m.interest[1] - m.z) < 2) {
          m.interest = null; m.searchT = 7;
          this.setState(m, 'search');
        }
        break;
      }
      case 'chase': case 'attack': {
        if (det) {
          m.lastSeen = [det.player.x, det.player.z];
          // enraged by light: faster while lit
          this.moveToward(m, det.player.x, det.player.z, m.def.speed * (m.lit ? 1.3 : 1), dt);
          if (this.attackCheck(m, det)) break;
          if (det.nd > m.def.chaseGiveUp || m.stateT > 16) { m.target = null; this.setState(m, 'search'); m.searchT = 6; }
        } else { m.target = null; this.setState(m, 'search'); m.searchT = 6; }
        break;
      }
      case 'search': {
        m.searchT = (m.searchT ?? 6) - dt;
        this.wander(m, dt, 1.3);
        if (det && (det.heard || det.seen)) { m.target = det.player; m.lastSeen = [det.player.x, det.player.z]; this.setState(m, 'chase'); }
        else if (m.searchT <= 0) this.setState(m, 'patrol');
        break;
      }
      case 'cooldown': {
        this.wander(m, dt, 0.9);
        if (m.stateT > 6) this.setState(m, 'patrol');
        break;
      }
      default: this.setState(m, 'patrol');
    }
  }

  // ---- THE WALL DWELLER: a stain on the wall until you brush past it
  aiWalldweller(m, dt, det) {
    if (m.state === 'chase' || m.state === 'attack' || m.state === 'search') {
      this.huntChase(m, dt, det, { rearm: 'gone', searchTime: 5 }); // melts back into the walls
      return;
    }
    this.setState(m, 'dormant');
    m.moving = false;
    if (det && det.nd < m.def.aggroRange) {
      this.setState(m, 'chase');
      this.killLightNear(m.x, m.z); // the room goes dark as it peels off the wall
      this.audio.monsterVoice('walldweller', m.x, 1.4, m.z, 1);
    }
  }

  // ---- THE DEEP ONE: under the waterline. Hears splashing. Hates the light.
  aiDeepone(m, dt, det) {
    // y handled in updateMesh: dormant = sunken, active = at the surface
    if (m.submergeT > 0) {
      m.submergeT -= dt;
      this.setState(m, 'dormant');
      m.moving = false;
      return;
    }
    if (m.state === 'chase' || m.state === 'attack' || m.state === 'search') {
      this.huntChase(m, dt, det, { rearm: 'dormant', searchTime: 6 });
      return;
    }
    this.setState(m, 'dormant');
    m.moving = false;
    if (det && (det.heard || det.nd < 4)) {
      this.setState(m, 'chase');
      this.audio.splash(m.x, m.z, 1);
      this.audio.monsterVoice('deepone', m.x, 0.8, m.z, 1);
    }
  }

  // ---- THE CEILING THING: folded above your head. Linger underneath and
  // it unfolds. It drops. It is fast.
  aiCeiling(m, dt, det) {
    if (m.state === 'drop') {
      // the fall
      m.y = Math.max(0, m.y - dt * 14);
      if (m.y <= 0) {
        this.setState(m, 'chase');
        this.audio.metalClatter(m.x, m.z);
        this.audio.monsterVoice('ceiling', m.x, 1.4, m.z, 1);
      }
      return;
    }
    if (m.state === 'chase' || m.state === 'attack' || m.state === 'search') {
      // after a failed hunt it skitters away across the tiles, unseen
      this.huntChase(m, dt, det, { rearm: 'gone', searchTime: 5 });
      return;
    }
    // hanging. ticking. waiting.
    this.setState(m, 'dormant');
    m.moving = false;
    // light persuades it to relocate
    if (m.lit) {
      m.relocateT = (m.relocateT || 0) + dt;
      if (m.relocateT > 1.2) {
        this.setState(m, 'gone'); // skitters away across the tiles, unseen
        return;
      }
    } else m.relocateT = 0;
    if (det && det.nd < m.def.aggroRange) {
      m.dwellUnder += dt;
      if (m.dwellUnder > 3) {
        this.setState(m, 'drop');
        this.audio.monsterVoice('ceiling', m.x, 2.2, m.z, 1); // the warning tick-burst
      }
    } else {
      m.dwellUnder = Math.max(0, m.dwellUnder - dt * 0.7);
    }
  }

  // ---- THE FALSE PLAYER: walks like your friend until it doesn't
  aiFalseplayer(m, dt, det) {
    if (m.state === 'chase' || m.state === 'attack' || m.state === 'search') {
      // too fast, too many joints — and it goes back to "being a person" after
      const spd = m.def.speed;
      m.def.speed = spd * 1.9;
      this.huntChase(m, dt, det, { rearm: 'patrol', searchTime: 12 });
      m.def.speed = spd;
      return;
    }
    if (m.state === 'stare') {
      m.moving = false;
      m.stareT = (m.stareT || 0) + dt; // own timer: stateT only advances in update()
      if (det) m.yaw = Math.atan2(det.player.x - m.x, det.player.z - m.z);
      if (m.stareT > 1.4) {
        m.stareT = 0;
        this.setState(m, 'chase');
        this.audio.monsterVoice('falseplayer', m.x, 1.5, m.z, 1);
      }
      return;
    }
    // disguise: patrol at a casual walking pace, pause like a real player
    if (m.pauseT > 0) {
      m.pauseT -= dt;
      m.moving = false;
    } else {
      this.wander(m, dt, 1.5); // human walking speed
      if (Math.random() < dt * 0.15) m.pauseT = 1 + Math.random() * 3; // stops to "look" at things
    }
    this.setState(m, 'patrol');
    if (det && det.nd < m.def.aggroRange) {
      m.stareT = 0;
      this.setState(m, 'stare'); // it has noticed you noticing it
      this.audio.monsterVoice('falseplayer', m.x, 1.5, m.z, 0.7);
    }
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
    // vertical placement: ceiling things hang, deep ones ride the waterline
    if (m.def.submerged) {
      const target = m.state === 'dormant' ? -1.35 : -0.45;
      m.y += (target - m.y) * Math.min(1, dt * 3);
    }
    m.mesh.position.set(m.x, m.y || 0, m.z);
    m.mesh.rotation.y = m.yaw;
    this.validateVisual(m);

    const d = m.nearD ?? 999;
    const u = m.mesh.userData;

    // LOD: fine details (fingers, ribs, sockets) only render up close
    if (u.detail && u.detail.length) {
      const show = d < 30;
      if (m._detailShown !== show) {
        m._detailShown = show;
        for (const o of u.detail) o.visible = show;
      }
    }

    // distant monsters still stand and turn, but skip limb animation
    if (d > 90) {
      this.applyVisibility(m, d);
      return;
    }

    m.animT += dt * (m.moving ? (m.state === 'chase' || m.state === 'attack' ? 9 : 4) : 1.2);
    const t = m.animT;
    const amp = m.moving ? 0.55 : 0.05;
    for (const limb of (u.limbs || [])) {
      if (limb.kind === 'seg') {
        // crawler: travelling wave along the body
        limb.g.rotation.y = Math.sin(t * 3 + limb.side * 1.2) * (m.moving ? 0.28 : 0.05);
      } else if (m.def.lurch && m.moving) {
        // lurch species: limbs SNAP between poses instead of swinging
        const snap = Math.round(Math.sin(t * 2 + (limb.side > 0 ? 0 : Math.PI)) * 3) / 3;
        limb.g.rotation.x = snap * amp * 1.4;
      } else if (limb.kind === 'leg') limb.g.rotation.x = Math.sin(t * 2 + (limb.side > 0 ? 0 : Math.PI)) * amp;
      else limb.g.rotation.x = Math.sin(t * 2 + (limb.side > 0 ? Math.PI : 0)) * amp * 0.7;
    }
    // idle wrongness: slow head tilt, subtle body sway
    if (u.head) {
      u.head.rotation.z = Math.sin(t * 0.35 + m.id) * 0.14 + (m.type === 'watcher' ? 0.18 : 0);
      u.head.rotation.x = Math.sin(t * 0.23) * 0.08;
    }
    if (u.torso && m.type === 'siren') u.torso.rotation.z = 0.35 + Math.sin(t * 0.5) * 0.06; // the song
    if (m.type === 'watcher') m.mesh.rotation.z = Math.sin(t * 0.4 + m.id) * 0.025;
    if (m.state === 'attack' && u.jaw) u.jaw.rotation.x = 0.9;

    // ---- species-specific motion signatures ----
    switch (m.type) {
      case 'tallone': {
        // absolutely still while watched; pose snaps driven by the host AI,
        // but each client also snaps the pose when THEY personally look away
        if (!m.observed) {
          m.poseT -= dt;
          if (m.poseT <= 0) {
            m.poseT = 1.4 + Math.random() * 2.2;
            if (u.setPose) u.setPose((Math.random() * 4) | 0);
          }
        }
        m.mesh.rotation.z = Math.sin(t * 0.18 + m.id) * 0.012; // barely breathing
        break;
      }
      case 'hollow': {
        // head slowly rises to face you as it gets close
        if (u.head) {
          const target = d < 9 ? -0.12 : 0.3;
          u.head.rotation.x += (target - u.head.rotation.x) * Math.min(1, dt * 1.5);
        }
        // frozen in the beam: not even sway
        if (m.litLocal || m.lit) { for (const l of (u.limbs || [])) l.g.rotation.x = Math.round(l.g.rotation.x * 8) / 8; }
        break;
      }
      case 'bonefiend': {
        // whole-body stutter: tiny violent snaps even when idle
        if (Math.sin(t * 17 + m.jerkSeed) > 0.96) m.mesh.rotation.y = m.yaw + (Math.random() - 0.5) * 0.14;
        if (m.state === 'chase' && u.jaw) u.jaw.rotation.x = 0.85 + Math.sin(t * 12) * 0.2;
        break;
      }
      case 'walldweller': {
        // stains don't sway. only when it peels off does it move like meat.
        if (m.state === 'dormant') {
          for (const l of (u.limbs || [])) l.g.rotation.x *= 0.9;
        }
        break;
      }
      case 'deepone': {
        m.mesh.rotation.z = Math.sin(t * 0.7 + m.id) * 0.06; // current-rocking
        if (u.head) u.head.rotation.x = -0.15 + Math.sin(t * 0.5) * 0.1; // tasting the air
        break;
      }
      case 'ceiling': {
        // hanging: limbs occasionally twitch; the head slowly scans
        if (u.head) u.head.rotation.y = Math.sin(t * 0.3 + m.id) * 0.55;
        if (Math.sin(t * 11 + m.jerkSeed) > 0.97) {
          const l = u.limbs[(Math.random() * u.limbs.length) | 0];
          if (l) l.g.rotation.x += (Math.random() - 0.5) * 0.3;
        }
        break;
      }
      case 'falseplayer': {
        // mostly a person. rarely: a full-body glitch-twitch, frames skipped
        if (Math.sin(t * 13.7 + m.jerkSeed * 3) > 0.995) {
          m.mesh.rotation.z = (Math.random() - 0.5) * 0.12;
          if (u.head) u.head.rotation.y = (Math.random() - 0.5) * 1.4;
        } else {
          m.mesh.rotation.z *= 0.8;
          if (u.head) u.head.rotation.y *= 0.85;
        }
        break;
      }
    }
    this.applyVisibility(m, d);
  }

  // flashlight 'reveal' species: nearly invisible until lit or moving
  applyVisibility(m, d) {
    const u = m.mesh.userData;
    if (m.def.flashReact !== 'reveal' && !m.def.submerged) return;
    const lit = m.litLocal || m.lit;
    let op = 1;
    if (m.def.flashReact === 'reveal') {
      op = (lit || m.moving) ? 1 : (d < 26 ? 0.22 : 0.08);
      if (m.type === 'falseplayer' && lit) {
        op = 0.55 + Math.abs(Math.sin(m.animT * 31)) * 0.45; // signal interference
      }
    } else if (m.def.submerged) {
      op = m.state === 'dormant' ? 0.3 : 0.95;
    }
    if (m._op !== undefined && Math.abs(m._op - op) < 0.01) return;
    m._op = op;
    m.mesh.traverse((o) => { if (o.isMesh) o.material.opacity = op; });
  }

  // logical-vs-visual consistency check: if the simulation believes a monster
  // exists but rendering can't show it, surface a console warning ONCE per
  // species instead of silently shipping invisible monsters
  validateVisual(m) {
    if (m._visWarned) return;
    if (!m.mesh) {
      m._visWarned = true;
      console.error(`[monster] ${m.type}#${m.id} LOGICAL ONLY — mesh missing`);
      return;
    }
    if (!m.mesh.parent) {
      m._visWarned = true;
      console.error(`[monster] ${m.type}#${m.id} LOGICAL ONLY — not added to scene`);
      return;
    }
    let anyVisible = false, meshCount = 0;
    m.mesh.traverse((o) => { if (o.isMesh) { meshCount++; if (o.visible) anyVisible = true; } });
    if (meshCount === 0 || !anyVisible) {
      m._visWarned = true;
      console.error(`[monster] ${m.type}#${m.id} LOGICAL ONLY — ${meshCount} meshes, none visible`);
    }
  }

  remove(id) {
    const m = this.monsters.get(id);
    if (!m) return;
    this.scene.remove(m.mesh);
    // free GPU resources — spawned/despawned monsters must not leak
    m.mesh.traverse((o) => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
    this.monsters.delete(id);
  }

  // ------------------------------------------------------------- networking
  hostSnapshot() {
    const list = [];
    for (const m of this.monsters.values()) {
      if (m.private) continue;
      list.push([m.id, TYPE_IDS.indexOf(m.type), +m.x.toFixed(2), +m.z.toFixed(2), +m.yaw.toFixed(2), stateCode(m.state), +(m.y || 0).toFixed(2)]);
    }
    return list;
  }

  applySnapshot(list) {
    if (this.isHost()) return;
    const seen = new Set();
    for (const row of list) {
      const [id, typeIdx, x, z, yaw, state, y] = row;
      seen.add(id);
      let m = this.monsters.get(id);
      if (!m) m = this.spawnMonster(TYPE_IDS[typeIdx] || 'watcher', x, z, id);
      m.netX = x; m.netZ = z; m.netYaw = yaw; m.netY = y || 0;
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
      if (!m.def.submerged) m.y += ((m.netY || 0) - (m.y || 0)) * 0.3;
      let dy = (m.netYaw || 0) - m.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * 0.25;
      m.moving = Math.hypot(m.netX - m.x, m.netZ - m.z) > 0.02;
    }
  }
}

const STATE_CODES = {
  idle: 0, watch: 1, stalk: 2, chase: 3, dormant: 4, reveal: 5, gone: 6,
  patrol: 7, investigate: 8, hear_player: 9, see_player: 10, attack: 11,
  search: 12, lose_target: 13, retreat: 14, cooldown: 15, drop: 16, stare: 17,
};
function stateCode(s) { return STATE_CODES[s] ?? 0; }
function stateName(c) { return Object.keys(STATE_CODES).find((k) => STATE_CODES[k] === c) || 'idle'; }
