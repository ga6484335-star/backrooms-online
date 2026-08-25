// ============================================================================
// WORLDGEN — the deterministic infinite Backrooms world model.
// Pure functions of (seed, level, cell coords). No meshes here.
// Every client in a room computes identical results from the shared seed.
// ============================================================================
import { hashStr, rngFrom, pick, chance, range, intRange } from './rng.js';
import { getLevel } from './levels.js';

export const CELL = 4;            // meters per cell
export const CHUNK = 16;          // meters per chunk (4 cells)
export const CELLS_PER_CHUNK = 4;
export const REGION_CELLS = 16;   // special-room regions are 16x16 cells

// ---- special room archetypes with rarity tiers ----
export const SPECIALS = {
  // common
  darkroom:    { tier: 'common', min: 3, max: 5, w: 0.22 },
  highceiling: { tier: 'common', min: 3, max: 5, w: 0.18 },
  pillarmaze:  { tier: 'common', min: 4, max: 6, w: 0.14 },
  flooded:     { tier: 'common', min: 3, max: 5, w: 0.12 },
  // rare
  massivehall: { tier: 'rare',   min: 6, max: 10, w: 0.07 },
  loopcorridor:{ tier: 'rare',   min: 5, max: 7,  w: 0.06 },
  staircase:   { tier: 'rare',   min: 3, max: 4,  w: 0.05 },
  lightsdie:   { tier: 'rare',   min: 4, max: 6,  w: 0.05 },
  // extremely rare
  impossible:  { tier: 'ultra',  min: 5, max: 8,  w: 0.025 },
  noclipdoor:  { tier: 'ultra',  min: 1, max: 1,  w: 0.018 },
  deadend:     { tier: 'common', min: 2, max: 3,  w: 0.10 },
};

const REGION_SPECIAL_PROB = 0.34;

export class WorldModel {
  constructor(seed, level) {
    this.seed = seed >>> 0;
    this.level = level | 0;
    this.def = getLevel(level);
    this.cellCache = new Map();
    this.regionCache = new Map();
    this.morphs = new Map(); // "cx,cz" -> variant int (corridor-changed events)
  }

  setLevel(level) {
    this.level = level | 0;
    this.def = getLevel(level);
    this.cellCache.clear();
  }

  morph(cx, cz, variant) { this.morphs.set(`${cx},${cz}`, variant | 0); }
  morphVariant(cx, cz) { return this.morphs.get(`${cx},${cz}`) || 0; }

  // ---------- regions & special rooms ----------
  regionAt(rx, rz) {
    const key = `${rx},${rz}`;
    if (this.regionCache.has(key)) return this.regionCache.get(key);
    const rng = rngFrom(hashStr(this.seed, `l${this.level}:region:${rx},${rz}`));
    let special = null;
    if (chance(rng, REGION_SPECIAL_PROB * this.def.specialBias)) {
      const roll = rng();
      let acc = 0;
      let chosen = null;
      for (const [name, s] of Object.entries(SPECIALS)) {
        acc += s.w;
        if (roll < acc && !chosen) chosen = name;
      }
      if (chosen) {
        const s = SPECIALS[chosen];
        const w = intRange(rng, s.min, s.max);
        const h = intRange(rng, s.min, s.max);
        // anchor fully inside the region (never touching boundary cells)
        const maxOff = REGION_CELLS - Math.max(w, h) - 1;
        const ox = 1 + intRange(rng, 0, Math.max(1, maxOff - 1));
        const oz = 1 + intRange(rng, 0, Math.max(1, maxOff - 1));
        const doorSide = (rng() * 4) | 0;
        special = {
          type: chosen, tier: s.tier,
          x: rx * REGION_CELLS + ox, z: rz * REGION_CELLS + oz,
          w: chosen === 'noclipdoor' ? 1 : w, h: chosen === 'noclipdoor' ? 1 : h,
          doorSide, seed: rngFrom(hashStr(this.seed, `l${this.level}:sp:${rx},${rz}:${chosen}`)),
        };
      }
    }
    // open halls: whole region mostly wall-free (iconic Level 0 open spaces)
    const openHall = special ? (special.type === 'massivehall') : chance(rng, this.def.openHall);
    const out = { special, openHall };
    this.regionCache.set(key, out);
    return out;
  }

  specialAt(cx, cz) {
    const rx = Math.floor(cx / REGION_CELLS), rz = Math.floor(cz / REGION_CELLS);
    const region = this.regionAt(rx, rz);
    const s = region.special;
    if (!s) return null;
    if (cx >= s.x && cx < s.x + s.w && cz >= s.z && cz < s.z + s.h) return s;
    return null;
  }

  isOpenHallCell(cx, cz) {
    const rx = Math.floor(cx / REGION_CELLS), rz = Math.floor(cz / REGION_CELLS);
    return this.regionAt(rx, rz).openHall;
  }

  // ---------- cells ----------
  cellAt(cx, cz) {
    const key = `${cx},${cz}`;
    const cached = this.cellCache.get(key);
    if (cached) return cached;

    const def = this.def;
    const special = this.specialAt(cx, cz);
    const rng = rngFrom(hashStr(this.seed, `l${this.level}:cell:${cx},${cz}`));
    const openHall = this.isOpenHallCell(cx, cz);

    let ceilH = def.baseCeil + (range(rng, 0, 1) - 0.5) * 2 * def.ceilJitter;
    let tint = 0.78 + rng() * 0.26;
    let pillar = chance(rng, def.pillarProb);
    let light = chance(rng, def.lightChance);
    let water = !!def.water;
    let weird = 0; // visual distortion amount for impossible rooms
    let propBoost = 1;

    if (special) {
      const sr = special.seed;
      switch (special.type) {
        case 'darkroom':
          light = chance(sr, 0.06); tint *= 0.55; break;
        case 'highceiling':
          ceilH = 7 + sr() * 5; light = chance(sr, 0.5); break;
        case 'pillarmaze':
          pillar = chance(sr, 0.55); break;
        case 'flooded':
          water = true; break;
        case 'massivehall':
          ceilH = 6 + sr() * 4; light = chance(sr, 0.85); pillar = false; propBoost = 0.25; break;
        case 'loopcorridor':
          pillar = false; light = chance(sr, 0.6); break;
        case 'staircase':
          pillar = false; light = chance(sr, 0.7); break;
        case 'lightsdie':
          light = chance(sr, 0.9); break;
        case 'impossible':
          ceilH = 9 + sr() * 6; weird = 1; light = chance(sr, 0.45); pillar = chance(sr, 0.3); break;
        case 'deadend':
          tint *= 0.8; light = chance(sr, 0.35); break;
        case 'noclipdoor':
          pillar = false; light = true; break;
      }
    }
    // highway corridors stay lit a bit more often for orientation
    if (cx % 4 === 0 || cz % 4 === 0) light = light || chance(rng, 0.35);

    const cell = {
      cx, cz, special, openHall,
      ceilH: Math.max(2.15, ceilH),
      tint, pillar, light, water, weird, propBoost,
      propRng: rngFrom(hashStr(this.seed, `l${this.level}:prop:${cx},${cz}`)),
      noteSpawn: chance(rng, 0.006),       // rare readable notes
      surfaceVariant: rng(),
    };
    this.cellCache.set(key, cell);
    return cell;
  }

  // ---------- walls ----------
  // dir: 0=+x, 1=+z, 2=-x, 3=-z  (edge between cell and that neighbor)
  edgeKey(cx, cz, dir) {
    if (dir === 0) return `x:${cx + 1},${cz}`;
    if (dir === 1) return `z:${cx},${cz + 1}`;
    if (dir === 2) return `x:${cx},${cz}`;
    return `z:${cx},${cz}`;
  }

  baseWall(cx, cz, dir) {
    // guaranteed-open highway corridors every 4 cells
    if ((dir === 0 || dir === 2) && cz % 4 === 0) return false;
    if ((dir === 1 || dir === 3) && cx % 4 === 0) return false;
    if (this.isOpenHallCell(cx, cz) && this.isOpenHallCell(
      cx + (dir === 0 ? 1 : dir === 2 ? -1 : 0), cz + (dir === 1 ? 1 : dir === 3 ? -1 : 0))) return false;
    const rng = rngFrom(hashStr(this.seed, `l${this.level}:edge:${this.edgeKey(cx, cz, dir)}`));
    return chance(rng, this.def.wallProb);
  }

  wallInfo(cx, cz, dir) {
    const nx = cx + (dir === 0 ? 1 : dir === 2 ? -1 : 0);
    const nz = cz + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
    const sa = this.specialAt(cx, cz);
    const sb = this.specialAt(nx, nz);

    // inside the same special: interior layout
    if (sa && sb && sa === sb) {
      if (sa.type === 'loopcorridor') {
        // inner 2x2 solid block in the middle -> corridor loops around it
        const mx = sa.x + (sa.w >> 1), mz = sa.z + (sa.h >> 1);
        const inner = { x: mx - 1, z: mz - 1, w: 2, h: 2 };
        const aIn = inRect2(cx, cz, inner), bIn = inRect2(nx, nz, inner);
        if (aIn || bIn) return { wall: true, door: false }; // block surfaces
        return { wall: false, door: false };
      }
      return { wall: false, door: false };
    }

    // special <-> outside boundary: solid wall except the door side
    if (sa && !sb) {
      const isDoor = this.isSpecialDoorEdge(sa, cx, cz, dir);
      if (isDoor) return { wall: true, door: true, specialDoor: true };
      return { wall: true, door: false };
    }
    if (!sa && sb) {
      const isDoor = this.isSpecialDoorEdge(sb, nx, nz, reverse(dir));
      if (isDoor) return { wall: true, door: true, specialDoor: true };
      return { wall: true, door: false };
    }

    let wall = this.baseWall(cx, cz, dir);
    // never seal a cell completely
    if (wall) {
      const a = this, allWalls = [0, 1, 2, 3].every((d) => a.baseWall(cx, cz, d));
      if (allWalls) {
        const fr = rngFrom(hashStr(this.seed, `l${this.level}:free:${cx},${cz}`));
        const forced = (fr() * 4) | 0;
        if (forced === dir) wall = false;
      }
    }
    if (!wall) return { wall: false, door: false };
    const rng = rngFrom(hashStr(this.seed, `l${this.level}:door:${this.edgeKey(cx, cz, dir)}`));
    const door = chance(rng, this.def.doorProb);
    return { wall: true, door };
  }

  isSpecialDoorEdge(s, cx, cz, dir) {
    // one doorway, on the side chosen deterministically, middle of that side
    if (s.type === 'noclipdoor') return false;
    const mx = s.x + (s.w >> 1), mz = s.z + (s.h >> 1);
    switch (s.doorSide) {
      case 0: return dir === 3 && cx === mx && cz === s.z;      // north edge
      case 1: return dir === 0 && cx === s.x + s.w - 1 && cz === mz; // east edge
      case 2: return dir === 1 && cx === mx && cz === s.z + s.h - 1; // south edge
      default: return dir === 2 && cx === s.x && cz === mz;      // west edge
    }
  }

  inRect(cx, cz, r) { return cx >= r.x1 && cx <= r.x2 && cz >= r.z1 && cz <= r.z2; }

  // ---------- movement / collision queries ----------
  // can an agent cross from cell (cx,cz) in direction dir when doors closed/open?
  canPass(cx, cz, dir, doorOpen = false) {
    const w = this.wallInfo(cx, cz, dir);
    if (!w.wall) return true;
    if (w.door && doorOpen) return true;
    return false;
  }

  // door aperture crossing test for physics: given world coords crossing an edge
  doorGap(cx, cz, dir) {
    // returns [center, halfWidth] along the edge, or null if no door
    const w = this.wallInfo(cx, cz, dir);
    if (!w.wall || !w.door) return null;
    const rng = rngFrom(hashStr(this.seed, `l${this.level}:gap:${this.edgeKey(cx, cz, dir)}`));
    const center = (CELL / 2) + (rng() - 0.5) * 1.2; // offset within the 4m edge
    return [center, 0.75]; // 1.5m wide
  }

  surfaceAt(cx, cz) {
    const cell = this.cellAt(cx, cz);
    if (cell.water) return 'water';
    const def = this.def;
    const map = {
      carpet: 'carpet', officeCarpet: 'carpet', hotelCarpet: 'carpet',
      concrete: 'concrete', metal: 'metal', tile: 'tile',
    };
    return map[def.floorMat] || 'carpet';
  }

  // nearest walkable spawn cells near origin (corridor intersection 0,0)
  spawnPoint(index) {
    const ring = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, -1], [1, -1]];
    const [cx, cz] = ring[index % ring.length];
    return [(cx + 0.5) * CELL, (cz + 0.5) * CELL];
  }
}

function reverse(dir) { return (dir + 2) % 4; }
function inRect2(cx, cz, r) { return cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.h; }

// ---------------------------------------------------------------------------
// BFS pathfinding on the cell grid (monsters treat doors as passable)
export function bfsPath(world, from, to, maxExpand = 1500) {
  const key = (x, z) => `${x},${z}`;
  const prev = new Map();
  const q = [from];
  prev.set(key(from[0], from[1]), null);
  let head = 0;
  let found = false;
  while (head < q.length) {
    if (q.length > maxExpand) break;
    const [cx, cz] = q[head++];
    if (cx === to[0] && cz === to[1]) { found = true; break; }
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 2 ? -1 : 0);
      const nz = cz + (d === 1 ? 1 : d === 3 ? -1 : 0);
      const k = key(nx, nz);
      if (prev.has(k)) continue;
      const w = world.wallInfo(cx, cz, d);
      if (w.wall && !w.door) continue;
      prev.set(k, [cx, cz]);
      q.push([nx, nz]);
    }
  }
  if (!found) return null;
  const out = [];
  let node = to;
  while (node) {
    out.push(node);
    node = prev.get(key(node[0], node[1]));
  }
  out.reverse();
  return out;
}
