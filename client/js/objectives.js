// ============================================================================
// OBJECTIVES — per-level cooperative goals that gate progression.
//
// No more random teleporting between levels. Each level lays out a small set of
// deterministic OBJECTIVE SITES (intake nodes, relays, archives) on the
// guaranteed-open highway corridors near spawn, so they are always reachable by
// every player in the room. Activating a site reveals a story fragment. When
// every objective is done the exit is unlocked and the party advances together.
//
// All placement is a pure function of (seed, level) and every client computes
// the same cells, so the world needs no extra server state for positions —
// only completed objectives are relayed (see the `obj` event).
// ============================================================================
import { rngFrom, hashStr } from './rng.js';
import { isFinalLevel } from './story.js';

// per-level objective plans. `site` = activate N objective sites.
// `survive` = once everything else is done, hold the level for `seconds`.
export const OBJECTIVE_PLANS = {
  0: [{ id: 'nodes', kind: 'site', label: 'FIND THE INTAKE NODES', count: 3 }],
  1: [{ id: 'nodes', kind: 'site', label: 'TRACE THE HUM', count: 3 }],
  2: [{ id: 'nodes', kind: 'site', label: 'PURGE THE CAPSTANS', count: 3 }],
  3: [{ id: 'nodes', kind: 'site', label: 'DRAIN THE ARCHIVE', count: 3 }],
  4: [{ id: 'nodes', kind: 'site', label: 'RECOVER THE FILE', count: 3 }],
  5: [{ id: 'nodes', kind: 'site', label: 'ACCOUNT FOR THE GUESTS', count: 3 }],
  6: [
    { id: 'nodes', kind: 'site', label: 'ALIGN THE RELAYS', count: 3 },
    { id: 'nodes2', kind: 'site', label: 'HOLD THE READ', count: 3 },
    { id: 'hold', kind: 'survive', label: 'SURVIVE THE READ', seconds: 75 },
  ],
};

export function planFor(level) {
  return OBJECTIVE_PLANS[level] || OBJECTIVE_PLANS[0];
}

export function siteGoal(level) {
  return planFor(level).filter((o) => o.kind === 'site').reduce((n, o) => n + o.count, 0);
}

// Deterministic site cells for a level. Placed along the guaranteed-open
// highway corridors (rows/columns divisible by 4) at increasing radii, so a
// straight walk from spawn crosses each one. Sites never drop inside a special
// room: if a candidate cell is special we nudge outward until it is ordinary.
export function siteCells(world, level, count) {
  const seed = world.seed >>> 0;
  const rng = rngFrom(hashStr(seed, `obj:${level}`));
  const out = [];
  const total = count !== undefined ? count : siteGoal(level);
  const used = new Set();
  let i = 0;
  while (out.length < total && i < total * 12) {
    const r = 6 + i * 3 + ((rng() * 2) | 0);
    const axis = i % 2;              // 0 = x-highway, 1 = z-highway
    const sign = (i >> 1) % 2 ? -1 : 1;
    i++;
    let cx, cz;
    if (axis === 0) { cx = sign * r; cz = 0; } else { cx = 0; cz = sign * r; }
    // only accept ordinary cells; nudge along the highway if we hit a special
    for (let n = 0; n < 8; n++) {
      const tx = axis === 0 ? cx + sign * n : cx;
      const tz = axis === 1 ? cz + sign * n : cz;
      const key = `${tx},${tz}`;
      if (used.has(key)) continue;
      const cell = world.cellAt(tx, tz);
      if (cell.special || cell.water) continue;
      used.add(key);
      out.push([tx, tz]);
      break;
    }
  }
  return out;
}

export function siteCenter(cx, cz) {
  return [(cx + 0.5) * 4, (cz + 0.5) * 4]; // CELL = 4
}

export function siteKey(level, cx, cz) { return `site:${level}:${cx},${cz}`; }

// Every objective site for a level, as {key, cx, cz}, in activation order.
export function objectiveSites(world, level) {
  const cells = siteCells(world, level, siteGoal(level));
  return cells.map(([cx, cz], i) => ({ key: siteKey(level, cx, cz), cx, cz, index: i }));
}

// Deterministic exit cell: further out along a highway than every site, so it
// is always reachable and never overlaps an objective.
export function exitCellFor(world, level) {
  const seed = world.seed >>> 0;
  const rng = rngFrom(hashStr(seed, `exit:${level}`));
  const base = siteGoal(level) * 3 + 8;
  for (let k = 0; k < 20; k++) {
    const r = base + k * 2 + ((rng() * 2) | 0);
    const axis = k % 2;
    const sign = (k >> 1) % 2 ? -1 : 1;
    for (let n = 0; n < 6; n++) {
      const cx = axis === 0 ? sign * (r + n) : 0;
      const cz = axis === 1 ? sign * (r + n) : 0;
      const cell = world.cellAt(cx, cz);
      if (!cell.special && !cell.water) return [cx, cz];
    }
  }
  return [base, 0];
}

// ---------------------------------------------------------------------------
// HIDDEN ROOMS / LORE CACHES — optional, exploration-rewarding secrets.
//
// Every level hides exactly one "cache" room inside a real generated special
// room (never a corridor), placed deterministically far from spawn. The cache
// holds a lore fragment that deepens the story without gating progression, so
// co-op players are rewarded for splitting up and exploring.
//
// Like the sites, placement is a pure function of (seed, level): all clients
// derive the same location and the same clue, so nothing needs to be networked
// except the "found" event.
export const CACHE_PLANS = {
  0: { label: 'THE FIRST INTAKE', room: 'darkroom' },
  1: { label: 'CAPSTAN LOGS', room: 'ventroom' },
  2: { label: 'DUB HOUSE', room: 'monitorroom' },
  3: { label: 'DROWNED ARCHIVE', room: 'whiteroom' },
  4: { label: 'OPERATOR DESK', room: 'monitorroom' },
  5: { label: 'ROOM FORTY', room: 'clockroom' },
  6: { label: 'THE READ HEAD', room: 'whiteroom' },
};

export function cachePlanFor(level) {
  return CACHE_PLANS[level] || CACHE_PLANS[0];
}

// Find a generated special room of the planned type within `radius` regions of
// spawn. Deterministic: scans regions in a fixed order from the centre out.
// Returns {cx, cz, type, region} or null (callers fall back to a highway cell).
export function cacheCellFor(world, level, radius = 6) {
  const want = cachePlanFor(level).room;
  for (let ring = 1; ring <= radius; ring++) {
    // fixed winding order so every client visits the same regions in the same order
    for (let rz = -ring; rz <= ring; rz++) {
      for (let rx = -ring; rx <= ring; rx++) {
        // only the outer shell of the ring (inner cells were scanned already)
        if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
        const region = world.regionAt(rx, rz);
        const s = region.special;
        if (!s || s.type !== want) continue;
        // hide it at the far corner of the room so it is not visible from the door
        const cx = s.x + Math.min(1, s.w - 1);
        const cz = s.z + Math.min(1, s.h - 1);
        return { cx, cz, type: s.type, region: `${rx},${rz}` };
      }
    }
  }
  return null;
}

// A secondary fallback: any special room at all (lore still rewards exploring).
export function anyCacheCellFor(world, level, radius = 8) {
  for (let ring = 1; ring <= radius; ring++) {
    for (let rz = -ring; rz <= ring; rz++) {
      for (let rx = -ring; rx <= ring; rx++) {
        if (Math.max(Math.abs(rx), Math.abs(rz)) !== ring) continue;
        const s = world.regionAt(rx, rz).special;
        if (!s || s.type === 'noclipdoor') continue;
        const cx = s.x + Math.min(1, s.w - 1);
        const cz = s.z + Math.min(1, s.h - 1);
        return { cx, cz, type: s.type, region: `${rx},${rz}` };
      }
    }
  }
  return null;
}

export function cacheKey(level, cx, cz) { return `cache:${level}:${cx},${cz}`; }

// Memoised per (seed, level) so streaming chunks don't re-scan regions.
const _cacheMemo = new Map();

// The full cache descriptor for a level, including its resolved cell and the
// lore fragment it holds. Deterministic; safe to call on every client.
export function loreCacheFor(world, level) {
  const memoKey = `${world.seed >>> 0}:${level}`;
  const hit0 = _cacheMemo.get(memoKey);
  if (hit0) return hit0;
  const plan = cachePlanFor(level);
  let hit = cacheCellFor(world, level);
  if (!hit) hit = anyCacheCellFor(world, level);
  let cx, cz;
  if (hit) { cx = hit.cx; cz = hit.cz; }
  else {
    // ultimate fallback: a highway cell well beyond the exit
    const [ex, ez] = exitCellFor(world, level);
    cx = ex + 4; cz = ez;
  }
  const desc = {
    key: cacheKey(level, cx, cz),
    cx, cz,
    x: (cx + 0.5) * 4, z: (cz + 0.5) * 4,
    label: plan.label,
    room: hit ? hit.type : null,
    lore: loreFor(level),
  };
  _cacheMemo.set(memoKey, desc);
  return desc;
}

// ---- lore fragments -------------------------------------------------------
// Deeper than the objective beats: these are the personal, quiet reveals a
// curious player finds by going off the path. One per level, plus a shared
// "true" fragment that ties the whole thing together.
export const LORE = {
  0: {
    title: 'A CAMCORDER, STILL TAPING',
    body: 'The tape in your own camcorder is not blank. It has been running for forty years. '
      + 'Every frame is this room. Every frame is you, arriving, over and over. You press STOP. '
      + 'The counter keeps climbing.',
  },
  1: {
    title: 'CAPSTAN LOG 118',
    body: 'DAY 40. The machine does not lift or pump. It TURNS. We measured the hum against a '
      + 'wristwatch: one revolution per breath. We are not walking through a building. We are '
      + 'walking through the inside of a recording being wound.',
  },
  2: {
    title: 'THE DUB HOUSE',
    body: 'A room of empty chairs facing a screen. On the screen: you, seated in one of them, '
      + 'watching a screen, watching you. The chairs are warm. The operator\'s chair is warmer.',
  },
  3: {
    title: 'THE DROWNED ARCHIVE',
    body: 'Everything swallowed by the flood is filed underwater. You find a drawer labelled with '
      + 'your surname. Inside: the belongings of someone you have never met who remembers being '
      + 'you. The water keeps them legible. The air would not.',
  },
  4: {
    title: 'ONBOARDING FORM 4-A',
    body: 'NAME: (yours). ROLE: SUBJECT, then OPERATOR, then SUBJECT AGAIN. The form is a loop. '
      + 'You have signed it before, in your own hand, in years that have not happened yet. The '
      + 'pen is still warm.',
  },
  5: {
    title: 'ROOM FORTY',
    body: 'The door is unlocked. Inside: your bed, made. Your camcorder on the nightstand, '
      + 'taping the ceiling. On the ceiling, a small red light — the same as yours — winks back. '
      + 'The room is recording the room. It always was.',
  },
  6: {
    title: 'THE READ HEAD',
    body: 'Behind the projector, the head itself: an eye the size of a doorway, wet, patient, '
      + 'slow. It is not looking at you. It is looking at the place you will be standing in ten '
      + 'seconds. It is always early. That is how it escapes.',
  },
};

// A single truth fragment all levels can surface once every cache is found.
export const LORE_TRUTH = 'THE RECORD HAS NO EDGE. EACH ESCAPE IS A NEW TAKE. '
  + 'THE ONLY WAY OUT IS TO STOP BEING WATCHED — WHICH IS TO STOP MOVING. WHICH IS TO STOP.';

export function loreFor(level) {
  return LORE[level] || LORE[0];
}

// The clue line delivered by a story beat, hinting at the level's hidden room.
export const CACHE_HINTS = {
  0: 'A NODE FLICKERS A DIFFERENT PATTERN: SOMETHING ELSE ON THIS FLOOR IS STILL RUNNING.',
  1: 'THE HUM DROPS FOR A SECOND — FROM A VENT NO MAP SHOWS.',
  2: 'A MONITOR YOU DID NOT TURN ON SHOWS A ROOM YOU HAVE NOT FOUND.',
  3: 'THE WATER PULLS, ONCE, TOWARD A DOOR BENEATH IT.',
  4: 'A PRINTER IN AN EMPTY OFFICE SPITS ONE LINE: "ROOM WITH NO NUMBER."',
  5: 'A KEY ON A RED RIBBON, WARM, WITH NO NUMBER CUT INTO IT YET.',
  6: 'THE PROJECTOR BEAM BENDS — SOMEWHERE, A DARK ROOM IS STILL IN FOCUS.',
};

export function cacheHintFor(level) {
  return CACHE_HINTS[level] || CACHE_HINTS[0];
}

// ---------------------------------------------------------------------------
// LEVEL HAZARDS — a bespoke, deterministic environmental hazard per level.
//
// Layered on top of the shared site loop so every level has a signature threat
// the party must manage, not just nodes to touch. The hazard is *positional*:
// each client derives the same active/inactive cell windows from (seed, level)
// and evaluates them locally, so it needs no server state. Attacks are purely
// local (the world hurt you); monsters remain host-authoritative.
//
// Placement rule: an active cell must never coincide with an objective site,
// the exit, or the hidden cache, so the game can never become unwinnable. We
// scan outward from the origin and reject reserved cells, which keeps the RNG
// consumption order fixed across clients.
export const HAZARDS = {
  0: { kind: 'none' },
  1: { kind: 'steam', label: 'LIVE STEAM', period: 6.0, warn: 2.2, onFor: 2.6, radius: 3, rings: 6 },
  2: { kind: 'current', label: 'LIVE RAIL', period: 5.2, warn: 1.8, onFor: 1.8, radius: 4, rings: 6 },
  3: { kind: 'flood', label: 'SURGE', period: 9.5, warn: 3.0, onFor: 3.0, radius: 3, rings: 5 },
  4: { kind: 'malfunction', label: 'MALFUNCTION', period: 7.0, warn: 2.0, onFor: 2.4, radius: 3, rings: 5 },
  5: { kind: 'lightsout', label: 'BLACKOUT', period: 16.0, warn: 3.0, onFor: 6.0, radius: 0, rings: 0 },
  6: { kind: 'surge2', label: 'CASCADE', period: 5.6, warn: 1.6, onFor: 2.0, radius: 3, rings: 7 },
};

export function hazardFor(level) { return HAZARDS[level] || HAZARDS[0]; }

// Deterministic active-hazard cells for a level. The candidate stream is
// independent of site/exit/cache generation, so nothing here disturbs the
// shared PRNG indices those rely on.
export function hazardCells(world, level) {
  const h = hazardFor(level);
  if (!h.radius) return [];
  const seed = world.seed >>> 0;
  const rng = rngFrom(hashStr(seed, `haz:${level}`));
  const reserved = new Set();
  for (const s of objectiveSites(world, level)) reserved.add(`${s.cx},${s.cz}`);
  const [ecx, ecz] = exitCellFor(world, level);
  reserved.add(`${ecx},${ecz}`);
  const cache = loreCacheFor(world, level);
  reserved.add(`${cache.cx},${cache.cz}`);

  const out = [];
  const used = new Set();
  const want = Math.max(1, h.rings);
  for (let i = 0; i < want * 10 && out.length < want; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 8 + rng() * 22;
    const cx = Math.round(Math.cos(ang) * rad);
    const cz = Math.round(Math.sin(ang) * rad);
    const key = `${cx},${cz}`;
    if (used.has(key)) continue;
    used.add(key);
    if (reserved.has(key)) continue;
    const cell = world.cellAt(cx, cz);
    if (cell.special || cell.water) continue;
    out.push([cx, cz]);
  }
  return out;
}

export function hazardKey(level, cx, cz) { return `haz:${level}:${cx},${cz}`; }

// Pure function of (world, level, time): is the hazard active right now, and is
// it in its warning window? The same clock (shared elapsed time) drives every
// client, so a co-op party experiences the surge together.
export function hazardPhase(world, level, t) {
  const h = hazardFor(level);
  if (h.kind === 'none') return { active: false, warn: false, label: null };
  const p = h.period || 6;
  const local = ((t % p) + p) % p;
  const onFor = h.onFor || 2;
  const activeStart = p - onFor;
  const warnAt = Math.max(0, activeStart - (h.warn || 2));
  return {
    active: local >= activeStart,
    warn: local >= warnAt && local < activeStart,
    label: h.label,
    remain: Math.max(0, activeStart - local),
  };
}

// The hazard's damage: how much "exposure" per second an active cell deals.
export const HAZARD_DPS = { steam: 0.34, current: 0.55, flood: 0.30, malfunction: 0.28, lightsout: 0, surge2: 0.5 };

export function hazardDps(level) {
  return HAZARD_DPS[hazardFor(level).kind] || 0;
}

// ---- loot: risk/reward pickups surfaced by the hazard ---------------------
// Each hazard cell can hold a loot item. Its "kind" is a pure function of the
// cell, and the lore/effect is chosen per level so the reward is story-flavoured.
export function lootKindFor(level, cx, cz) {
  const rng = rngFrom(hashStr((level + 1) >>> 0, `loot:${cx},${cz}`));
  return rng() < 0.5 ? 'battery' : 'recorder';
}

export const LOOT = {
  battery: {
    label: 'SPARE CELL',
    effect: 'battery',
    body: 'A cold cell, still charged. The beam will hold a little longer.',
  },
  recorder: {
    label: 'FIELD RECORDER',
    effect: 'clue',
    body: 'A palm recorder, running. It is a voice you know — yours — calmly describing a room '
      + 'you have not reached yet. It knows what happens next. It will not say how it ends.',
  },
};

export function lootFor(kind) { return LOOT[kind] || LOOT.battery; }

// ---------------------------------------------------------------------------
// PUZZLES — a deterministic "lock" that seals the exit on every level.
//
// Completing the objective sites is no longer enough on its own: the way down
// is a sealed door that needs `steps` puzzle keys. Each key sits on an ordinary
// cell laid out as a chain from near spawn outward, so the party has to sweep
// the level (often against the signature hazard) rather than beeline for the
// exit. This is deliberately simple and reliable — a keyed lock, not a riddle —
// because it has to work identically for every client and for late joiners, and
// it must never be possible to soft-lock the run.
//
// Everything is a pure function of (seed, level) using its OWN rng stream, so
// the shared site/exit/cache/hazard streams are untouched. Positions are the
// exact same integers on every client; "which keys are collected" is relayed
// via the `puzzle` event.
//
// Every level is guaranteed solvable by construction: we only reject candidate
// cells that collide with an objective site, the exit or a hazard cell (none of
// which we would otherwise be missing a key for), and falling back to the exit
// cell itself guarantees at least `want` cells exist.
export const PUZZLES = {
  0: { steps: 3, label: 'INTAKE SEALS' },
  1: { steps: 3, label: 'PRESSURE VALVES' },
  2: { steps: 3, label: 'CAPSTAN LOCKS' },
  3: { steps: 4, label: 'PUMP BREAKERS' },
  4: { steps: 4, label: 'ACCESS BADGES' },
  5: { steps: 4, label: 'GUEST KEYS' },
  6: { steps: 4, label: 'RELAY FUSES' },
};

export function puzzlePlanFor(level) { return PUZZLES[level] || PUZZLES[0]; }
export function puzzleFor(level) { return puzzlePlanFor(level); }
export function puzzleGoal(level) { return puzzlePlanFor(level).steps; }

export function puzzleKey(level, cx, cz) { return `pz:${level}:${cx},${cz}`; }

const _puzzleMemo = new Map();
export function puzzleCells(world, level) {
  const memoKey = `${world.seed >>> 0}:${level}`;
  if (_puzzleMemo.has(memoKey)) return _puzzleMemo.get(memoKey);
  const want = puzzleGoal(level);
  const seed = world.seed >>> 0;
  const rng = rngFrom(hashStr(seed, `pz:${level}`));

  // Don't bury a key where a required objective already lives (nothing to find
  // there), and never inside the exit cell. Hazard cells are avoided so the
  // critical path is not forced through guaranteed damage, but are NOT required
  // to be avoided for solvability.
  const reserved = new Set();
  for (const s of objectiveSites(world, level)) reserved.add(`${s.cx},${s.cz}`);
  const [ecx, ecz] = exitCellFor(world, level);
  reserved.add(`${ecx},${ecz}`);
  for (const [cx, cz] of hazardCells(world, level)) reserved.add(`${cx},${cz}`);

  const out = [];
  const used = new Set();
  for (let i = 0; i < want * 14 && out.length < want; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 5 + i * 1.6 + rng() * 7;
    const cx = Math.round(Math.cos(ang) * rad);
    const cz = Math.round(Math.sin(ang) * rad);
    const key = `${cx},${cz}`;
    if (used.has(key) || reserved.has(key)) continue;
    const cell = world.cellAt(cx, cz);
    if (cell.special || cell.water) continue;
    used.add(key);
    out.push([cx, cz]);
  }
  // guaranteed floor: the exit cell is always ordinary and reachable
  let guard = 0;
  while (out.length < want && guard++ < want) out.push([ecx, ecz]);
  _puzzleMemo.set(memoKey, out);
  return out;
}

export function puzzleSites(world, level) {
  return puzzleCells(world, level).map(([cx, cz], i) => {
    const [x, z] = siteCenter(cx, cz);
    return {
      key: puzzleKey(level, cx, cz),
      index: i,
      cx, cz, x, z,
      label: puzzlePlanFor(level).label,
    };
  });
}

// Co-op objective tracker. Holds only serializable state so it can be snapshotted
// into the `obj` event and replayed for late joiners / reconnects.
export class ObjectiveTracker {
  constructor(level) {
    this.setLevel(level);
  }

  setLevel(level) {
    this.level = level | 0;
    this.plan = planFor(this.level);
    this.activated = new Set();   // site keys activated
    this.puzzleKeys = new Set();  // puzzle keys collected
    this.holdT = 0;               // seconds held on a survive objective
    this.lastBeat = -1;           // index of last revealed story fragment
  }

  countFor(kind) {
    return this.plan.filter((o) => o.kind === kind).reduce((n, o) => n + o.count, 0);
  }

  siteCount() { return this.activated.size; }
  siteGoalN() { return this.countFor('site'); }

  // ---- puzzle lock: a level-specific set of keys that seal the exit --------
  puzzleCount() { return this.puzzleKeys.size; }
  puzzleGoalN() { return puzzleGoal(this.level); }
  puzzleDone() { return this.puzzleKeys.size >= this.puzzleGoalN(); }

  collectPuzzle(key) {
    if (typeof key === 'string' && key.startsWith('pz:') && !key.startsWith(`pz:${this.level}:`)) return false;
    if (this.puzzleKeys.has(key)) return false;
    this.puzzleKeys.add(key);
    return true;
  }

  objectiveDone(o) {
    if (o.kind === 'site') {
      // site objectives are filled in order; each consumes its share of sites
      return this.activated.size >= this.siteGoalN();
    }
    if (o.kind === 'survive') return this.holdT >= (o.seconds || 0);
    return false;
  }

  // a site was activated by this client (or a peer). returns the beat index to
  // reveal, or -1 if it was already known.
  activateSite(key) {
    // a replayed event from an earlier chapter must not count toward this
    // level's goal — keys are namespaced `site:<level>:<cx>,<cz>`
    if (typeof key === 'string' && key.startsWith('site:') && !key.startsWith(`site:${this.level}:`)) return -1;
    if (this.activated.has(key)) return -1;
    this.activated.add(key);
    this.lastBeat = this.activated.size - 1;
    return this.lastBeat;
  }

  isComplete() {
    return this.plan.every((o) => this.objectiveDone(o)) && this.puzzleDone();
  }

  // call each frame. `dt` seconds. The survive objective only ticks once every
  // other objective is satisfied (the level is "on hold" until then).
  update(dt) {
    const hold = this.plan.find((o) => o.kind === 'survive');
    if (!hold) return;
    const othersDone = this.plan.filter((o) => o.kind !== 'survive').every((o) => this.objectiveDone(o));
    if (othersDone && !this.isComplete()) this.holdT += dt;
  }

  // 0..1 overall progress for the HUD ring
  progress() {
    let done = 0, total = 0;
    for (const o of this.plan) {
      total++;
      if (this.objectiveDone(o)) done++;
    }
    // partial credit for site objectives so the bar moves as you explore
    const sg = this.siteGoalN();
    if (sg > 0) {
      const siteObjs = this.plan.filter((o) => o.kind === 'site').length;
      done -= siteObjs;
      total -= siteObjs;
      total += sg;
      done += Math.min(sg, this.activated.size);
    }
    // and the puzzle lock is its own slice of the ring
    total += this.puzzleGoalN();
    done += Math.min(this.puzzleGoalN(), this.puzzleKeys.size);
    return total > 0 ? Math.min(1, done / total) : 1;
  }

  snapshot() {
    return { level: this.level, site: [...this.activated], pz: [...this.puzzleKeys], t: +this.holdT.toFixed(2) };
  }

  apply(snap) {
    if (!snap) return;
    if (Array.isArray(snap.site)) for (const k of snap.site) this.activated.add(k);
    if (Array.isArray(snap.pz)) for (const k of snap.pz) this.puzzleKeys.add(k);
    if (typeof snap.t === 'number' && snap.t > this.holdT) this.holdT = snap.t;
  }

  // HUD line: e.g. "INTAKE NODES 1/3" or "SURVIVE THE READ 42s"
  hudLines() {
    const lines = [];
    for (const o of this.plan) {
      if (o.kind === 'site') {
        lines.push({ label: o.label, value: `${Math.min(this.activated.size, this.siteGoalN())}/${this.siteGoalN()}`, done: this.objectiveDone(o) });
      } else if (o.kind === 'survive') {
        const secs = Math.max(0, Math.ceil((o.seconds || 0) - this.holdT));
        lines.push({ label: o.label, value: this.objectiveDone(o) ? 'DONE' : `${secs}s`, done: this.objectiveDone(o) });
      }
    }
    // the lock always shows once the objectives themselves are satisfied
    const sitesDone = this.plan.filter((o) => o.kind === 'site').every((o) => this.objectiveDone(o));
    if (sitesDone || this.puzzleKeys.size > 0) {
      lines.push({
        label: puzzlePlanFor(this.level).label,
        value: `${Math.min(this.puzzleGoalN(), this.puzzleKeys.size)}/${this.puzzleGoalN()}`,
        done: this.puzzleDone(),
      });
    }
    return lines;
  }
}
