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
  darkroom:    { tier: 'common', min: 3, max: 5, w: 0.16 },
  highceiling: { tier: 'common', min: 3, max: 5, w: 0.13 },
  pillarmaze:  { tier: 'common', min: 4, max: 6, w: 0.10 },
  flooded:     { tier: 'common', min: 3, max: 5, w: 0.09 },
  deadend:     { tier: 'common', min: 2, max: 3,  w: 0.08 },
  officefloor: { tier: 'common', min: 4, max: 6, w: 0.10 },
  // rare
  massivehall: { tier: 'rare',   min: 6, max: 10, w: 0.045 },
  loopcorridor:{ tier: 'rare',   min: 5, max: 7,  w: 0.04 },
  staircase:   { tier: 'rare',   min: 3, max: 4,  w: 0.035 },
  lightsdie:   { tier: 'rare',   min: 4, max: 6,  w: 0.035 },
  circularroom:{ tier: 'rare',   min: 5, max: 8,  w: 0.03 },
  longcorridor:{ tier: 'rare',   min: 8, max: 13, w: 0.03 },
  furniturepile:{ tier: 'rare',  min: 4, max: 6,  w: 0.03 },
  monolith:    { tier: 'rare',   min: 5, max: 7,  w: 0.025 },
  monitorroom: { tier: 'rare',   min: 4, max: 6,  w: 0.025 },
  ventroom:    { tier: 'rare',   min: 4, max: 6,  w: 0.02 },
  doormaze:    { tier: 'rare',   min: 4, max: 6,  w: 0.02 },
  // extremely rare landmarks — players should feel lucky to find these
  whiteroom:   { tier: 'ultra',  min: 4, max: 6,  w: 0.012 },
  impossible:  { tier: 'ultra',  min: 5, max: 8,  w: 0.014 },
  elevator:    { tier: 'ultra',  min: 3, max: 4,  w: 0.010 },
  clockroom:   { tier: 'ultra',  min: 4, max: 5,  w: 0.008 },
  statue:      { tier: 'ultra',  min: 3, max: 4,  w: 0.007 },
  reddoor:     { tier: 'ultra',  min: 2, max: 3,  w: 0.007 },
  noclipdoor:  { tier: 'ultra',  min: 1, max: 1,  w: 0.012 },
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
    const openHall = special ? (special.type === 'massivehall' || special.type === 'circularroom') : chance(rng, this.def.openHall);

    // ---- district: a sub-theme for this whole region so distant areas feel
    // genuinely different (palette shift, wall density, props, damage, light)
    const drng = rngFrom(hashStr(this.seed, `l${this.level}:district:${rx},${rz}`));
    const dtable = this.def.districts || [];
    let district = null;
    if (dtable.length) {
      const roll = drng();
      let acc = 0;
      for (const d of dtable) {
        acc += d.w;
        if (roll < acc) { district = d; break; }
      }
      if (!district) district = dtable[dtable.length - 1];
    }

    const out = { special, openHall, district };
    this.regionCache.set(key, out);
    return out;
  }

  districtAt(cx, cz) {
    const rx = Math.floor(cx / REGION_CELLS), rz = Math.floor(cz / REGION_CELLS);
    return this.regionAt(rx, rz).district;
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
    const district = this.districtAt(cx, cz);

    let ceilH = def.baseCeil + (range(rng, 0, 1) - 0.5) * 2 * def.ceilJitter;
    let tint = 0.78 + rng() * 0.26;
    let pillar = chance(rng, def.pillarProb);
    let light = chance(rng, def.lightChance);
    let water = !!def.water && chance(rng, 0.85);
    let weird = 0; // visual distortion amount for impossible rooms
    let propBoost = 1;
    // per-cell architectural variation
    let narrow = 0;          // 0..1 corridor squeeze (walls pushed inward)
    let ceilDrop = 0;        // lowered soffit height below ceilH (0 = none)
    let damage = 0;          // 0..1 — stains, rubble, broken panels
    let pillarShape = 0;     // 0 square, 1 round, 2 cross
    let lightStyle = 'panel';// panel | tube | bulb | none

    // ---- district modulation: whole regions drift in character ----
    if (district) {
      const d = district;
      tint *= d.tint !== undefined ? d.tint : 1;
      ceilH += d.ceilAdd || 0;
      if (d.pillarProb !== undefined) pillar = chance(rng, d.pillarProb);
      light = light && chance(rng, d.lightKeep !== undefined ? d.lightKeep : 1);
      if (d.lightBonus && chance(rng, d.lightBonus)) light = true;
      propBoost *= d.propBoost !== undefined ? d.propBoost : 1;
      if (d.narrow && chance(rng, d.narrow)) narrow = 0.3 + rng() * 0.55;
      if (d.damage && chance(rng, d.damage)) damage = 0.4 + rng() * 0.6;
      if (d.ceilDrop && chance(rng, d.ceilDrop)) ceilDrop = 0.5 + rng() * 0.8;
      if (d.pillarShape !== undefined) pillarShape = d.pillarShape;
      if (d.lightStyle && chance(rng, 0.8)) lightStyle = d.lightStyle;
      if (d.water && chance(rng, d.water)) water = true;
    }
    // cell-level organic damage/variation everywhere (not just districts)
    if (chance(rng, 0.06)) damage = Math.max(damage, 0.3 + rng() * 0.5);
    if (!narrow && chance(rng, 0.05)) narrow = 0.25 + rng() * 0.4;
    if (!pillarShape && chance(rng, 0.35)) pillarShape = (rng() * 3) | 0;
    if (lightStyle === 'panel' && chance(rng, 0.3)) lightStyle = rng() < 0.5 ? 'tube' : 'bulb';

    if (special) {
      const sr = special.seed;
      switch (special.type) {
        case 'darkroom':
          light = chance(sr, 0.06); tint *= 0.55; break;
        case 'highceiling':
          ceilH = 7 + sr() * 5; light = chance(sr, 0.5); break;
        case 'pillarmaze':
          pillar = chance(sr, 0.55); pillarShape = (sr() * 3) | 0; break;
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
        case 'circularroom':
          ceilH = 5.5 + sr() * 3; light = chance(sr, 0.75); pillar = false; propBoost = 0.4; break;
        case 'longcorridor':
          narrow = 0.35 + sr() * 0.3; light = chance(sr, 0.4); lightStyle = 'tube'; pillar = false; propBoost = 0.2; break;
        case 'furniturepile':
          propBoost = 6; light = chance(sr, 0.4); tint *= 0.85; break;
        case 'monolith':
          ceilH = 8 + sr() * 5; light = chance(sr, 0.5); pillar = false; propBoost = 0.1; break;
        case 'monitorroom':
          propBoost = 4; light = chance(sr, 0.15); tint *= 0.8; break;
        case 'ventroom':
          ceilH = 4.5 + sr() * 2; light = chance(sr, 0.3); tint *= 0.75; propBoost = 0.3; break;
        case 'doormaze':
          light = chance(sr, 0.55); propBoost = 0.1; break;
        case 'whiteroom':
          tint = 1.35; light = true; propBoost = 0; pillar = false; water = false;
          ceilH = 3.4 + sr(); damage = 0; break;
        case 'elevator':
          pillar = false; light = chance(sr, 0.5); propBoost = 0.2; break;
        case 'clockroom':
          light = true; propBoost = 0.15; pillar = false; break;
        case 'statue':
          light = chance(sr, 0.4); propBoost = 0.1; tint *= 0.7; pillar = false; break;
        case 'reddoor':
          light = chance(sr, 0.5); propBoost = 0.3; break;
        case 'officefloor':
          propBoost = 2.4; light = chance(sr, 0.7); pillar = false; break;
      }
    }
    // highway corridors stay lit a bit more often for orientation
    if (cx % 4 === 0 || cz % 4 === 0) light = light || chance(rng, 0.35);

    const cell = {
      cx, cz, special, openHall, district,
      ceilH: Math.max(2.15, ceilH),
      tint, pillar, light, water, weird, propBoost,
      narrow, ceilDrop, damage, pillarShape, lightStyle,
      propRng: rngFrom(hashStr(this.seed, `l${this.level}:prop:${cx},${cz}`)),
      noteSpawn: chance(rng, 0.006),       // rare readable notes
      batterySpawn: chance(rng, 0.011),    // flashlight batteries lying around
      surfaceVariant: rng(),
      floorPattern: chance(rng, 0.4) ? (rng() * 3) | 0 : 0, // 0 plain, 1 checker, 2 inlay
      alcove: chance(rng, 0.09),           // recessed niche in a solid wall
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
      if (sa.type === 'circularroom') {
        // solid corner filler + curved boundary: membership by distance to center
        const inA = circleHas(sa, cx, cz), inB = circleHas(sa, nx, nz);
        if (!inA && !inB) return { wall: true, door: false };
        if (inA !== inB) return { wall: true, door: false };
        return { wall: false, door: false };
      }
      if (sa.type === 'monolith') {
        // huge central structure occupying the middle cells
        const mx = sa.x + (sa.w >> 1), mz = sa.z + (sa.h >> 1);
        const inner = { x: mx - 1, z: mz - 1, w: 3, h: 3 };
        const aIn = inRect2(cx, cz, inner), bIn = inRect2(nx, nz, inner);
        if (aIn || bIn) return { wall: true, door: false };
        return { wall: false, door: false };
      }
      return { wall: false, door: false };
    }

    // special <-> outside boundary: solid wall except door edges
    if (sa && !sb) {
      if (sa.type === 'circularroom' && !circleHas(sa, cx, cz)) return { wall: true, door: false };
      const isDoor = this.isSpecialDoorEdge(sa, cx, cz, dir);
      if (isDoor) return { wall: true, door: true, specialDoor: true };
      return { wall: true, door: false };
    }
    if (!sa && sb) {
      if (sb.type === 'circularroom' && !circleHas(sb, nx, nz)) return { wall: true, door: false };
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
    if (s.type === 'doormaze') {
      // many doors: every other cell on every boundary side
      const onN = dir === 3 && cz === s.z && cx >= s.x && cx < s.x + s.w;
      const onS = dir === 1 && cz === s.z + s.h - 1 && cx >= s.x && cx < s.x + s.w;
      const onW = dir === 2 && cx === s.x && cz >= s.z && cz < s.z + s.h;
      const onE = dir === 0 && cx === s.x + s.w - 1 && cz >= s.z && cz < s.z + s.h;
      return (onN || onS) && cx % 2 === 0 || (onW || onE) && cz % 2 === 0;
    }
    if (s.type === 'longcorridor') {
      // entrances at both short ends of the strip
      const along = s.w >= s.h ? 'x' : 'z';
      if (along === 'x') {
        return (dir === 2 && cx === s.x && cz === mz) || (dir === 0 && cx === s.x + s.w - 1 && cz === mz);
      }
      return (dir === 3 && cz === s.z && cx === mx) || (dir === 1 && cz === s.z + s.h - 1 && cx === mx);
    }
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
function circleHas(s, cx, cz) {
  // cell membership in the circle inscribed in the special's rect
  const cxm = s.x + s.w / 2, czm = s.z + s.h / 2;
  const r = Math.min(s.w, s.h) / 2 - 0.05;
  const dx = cx + 0.5 - cxm, dz = cz + 0.5 - czm;
  return dx * dx + dz * dz <= r * r;
}

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
