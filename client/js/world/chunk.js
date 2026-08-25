// ============================================================================
// CHUNK BUILDER — turns the deterministic world model into real THREE.js
// geometry. Chunks are rebuilt on demand so morph events can swap materials.
// ============================================================================
import * as THREE from 'three';
import { CELL, CHUNK, CELLS_PER_CHUNK } from '../worldgen.js';
import { GeoBuilder, PROP_BUILDERS } from '../props.js';
import { hashStr, rngFrom, chance, range, intRange } from '../rng.js';
import { getLevel } from '../levels.js';
import { materialsFor } from '../materials.js';

export function buildChunk(world, chunkX, chunkZ, opts) {
  const seed = world.seed;
  const level = world.level;
  const levelDef = getLevel(level);
  const mats = opts.materials;
  const quality = opts.quality || 'high';

  const group = new THREE.Group();
  group.name = `chunk:${chunkX},${chunkZ}`;
  const baseCellX = chunkX * CELLS_PER_CHUNK;
  const baseCellZ = chunkZ * CELLS_PER_CHUNK;

  const gb = new GeoBuilder();      // merged level geometry
  const gbWater = new GeoBuilder(); // transparent water surface
  const gbEmiss = new GeoBuilder(); // unlit fluorescent panels
  const colliders = [];
  const doors = [];
  const lights = [];
  const specials = [];
  const notes = [];

  for (let cc = 0; cc < CELLS_PER_CHUNK; cc++) {
    for (let cr = 0; cr < CELLS_PER_CHUNK; cr++) {
      const cx = baseCellX + cc;
      const cz = baseCellZ + cr;
      const cell = world.cellAt(cx, cz);
      const wx = cx * CELL;
      const wz = cz * CELL;
      const tint = cell.tint * (1 - (cell.damage || 0) * 0.35);

      // floor — patterned variants (checker / border inlay) break repetition
      const floorCol = cell.water ? [20, 40, 38] : levelDef.palette.floor;
      if (cell.floorPattern === 1) {
        // 2x2 checkerboard with alternating wear
        const h = CELL / 2;
        for (let fx = 0; fx < 2; fx++) {
          for (let fz = 0; fz < 2; fz++) {
            const alt = (fx + fz) % 2 === 0 ? 0.82 : 1.0;
            gb.quad(
              [[wx + fx * h, 0, wz + fz * h], [wx + (fx + 1) * h, 0, wz + fz * h],
               [wx + (fx + 1) * h, 0, wz + (fz + 1) * h], [wx + fx * h, 0, wz + (fz + 1) * h]],
              [0, 1, 0], scaleColor(floorCol, tint * alt), [[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]]);
          }
        }
      } else if (cell.floorPattern === 2) {
        // border inlay: darker frame around a lighter centre
        const b = CELL * 0.18;
        gb.quad(
          [[wx, 0, wz], [wx + CELL, 0, wz], [wx + CELL, 0, wz + CELL], [wx, 0, wz + CELL]],
          [0, 1, 0], scaleColor(floorCol, tint * 0.78), [[0, 0], [1, 0], [1, 1], [0, 1]]);
        gb.quad(
          [[wx + b, 0.005, wz + b], [wx + CELL - b, 0.005, wz + b],
           [wx + CELL - b, 0.005, wz + CELL - b], [wx + b, 0.005, wz + CELL - b]],
          [0, 1, 0], scaleColor(floorCol, tint), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      } else {
        gb.quad(
          [[wx, 0, wz], [wx + CELL, 0, wz], [wx + CELL, 0, wz + CELL], [wx, 0, wz + CELL]],
          [0, 1, 0], scaleColor(floorCol, tint), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }

      // ceiling (damaged cells sometimes get a missing/darker ceiling patch)
      const ceilY = cell.ceilH;
      const ceilCol = scaleColor(levelDef.palette.ceil, tint * (cell.light ? 1 : 0.55));
      gb.quad(
        [[wx, ceilY, wz], [wx + CELL, ceilY, wz], [wx + CELL, ceilY, wz + CELL], [wx, ceilY, wz + CELL]],
        [0, -1, 0], ceilCol, [[0, 0], [1, 0], [1, 1], [0, 1]]);

      // lowered soffit beam across the cell (dropped ceiling section)
      if (cell.ceilDrop > 0) {
        const sy = ceilY - cell.ceilDrop;
        const scol = scaleColor(levelDef.palette.ceil, tint * 0.8);
        const alongX = chance(cell.propRng, 0.5);
        if (alongX) gb.box(CELL, cell.ceilDrop, 1.1, wx + CELL / 2, sy, wz + CELL / 2, scol);
        else gb.box(1.1, cell.ceilDrop, CELL, wx + CELL / 2, sy, wz + CELL / 2, scol);
      }

      // hanging wires in damaged cells — torn cables drooping from the ceiling
      if (cell.damage > 0.45 && chance(cell.propRng, 0.6)) {
        const nWires = 1 + ((cell.surfaceVariant * 3) | 0);
        for (let w = 0; w < nWires; w++) {
          const wr = rngFrom(hashStr(world.seed, `wire:${cx},${cz}:${w}`));
          const x0 = wx + 0.5 + wr() * (CELL - 1), z0 = wz + 0.5 + wr() * (CELL - 1);
          const len = 0.4 + wr() * 0.9;
          const sag = 0.15 + wr() * 0.25;
          const col = [30, 26, 24];
          // two segments per wire (hanging V shape)
          gb.quad([[x0, ceilY, z0], [x0 + 0.03, ceilY, z0], [x0 + sag + 0.03, ceilY - len, z0 + sag], [x0 + sag, ceilY - len, z0 + sag]],
            [0, 0, 1], col, [[0, 0], [1, 0], [1, 1], [0, 1]]);
          gb.quad([[x0 + sag, ceilY - len, z0 + sag], [x0 + sag + 0.03, ceilY - len, z0 + sag], [x0 + sag * 2 + 0.03, ceilY - len + sag * 0.5, z0 + sag * 2], [x0 + sag * 2, ceilY - len + sag * 0.5, z0 + sag * 2]],
            [0, 0, 1], col, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        }
      }

      // walls (dirs 0 and 1 only to avoid duplicates)
      for (let dir = 0; dir < 2; dir++) {
        const info = world.wallInfo(cx, cz, dir);
        if (!info.wall) continue;
        const nx = cx + (dir === 0 ? 1 : 0);
        const nz = cz + (dir === 1 ? 1 : 0);
        const wallH = Math.max(world.cellAt(cx, cz).ceilH, world.cellAt(nx, nz).ceilH);
        const wcol = scaleColor(levelDef.palette.wall, tint);
        if (info.door) {
          pushDoorWall(gb, dir, wx, wz, CELL, wallH, wcol);
          doors.push({
            cx, cz, dir,
            x: dir === 0 ? wx + CELL : wx + CELL / 2,
            z: dir === 1 ? wz + CELL : wz + CELL / 2,
          });
          // door jambs become colliders (player can't clip through sides)
          const half = (CELL - 1.6) / 2;
          if (dir === 0) {
            colliders.push({ x: wx + CELL, z: wz + half / 2, hw: 0.13, hd: half / 2 });
            colliders.push({ x: wx + CELL, z: wz + CELL - half / 2, hw: 0.13, hd: half / 2 });
          } else {
            colliders.push({ x: wx + half / 2, z: wz + CELL, hw: half / 2, hd: 0.13 });
            colliders.push({ x: wx + CELL - half / 2, z: wz + CELL, hw: half / 2, hd: 0.13 });
          }
        } else {
          pushWall(gb, dir, wx, wz, CELL, wallH, wcol);
          colliders.push({
            x: dir === 0 ? wx + CELL : wx + CELL / 2,
            z: dir === 1 ? wz + CELL : wz + CELL / 2,
            hw: dir === 0 ? 0.13 : CELL / 2,
            hd: dir === 1 ? 0.13 : CELL / 2,
          });
          // alcove: a shallow recessed niche in some solid walls
          if (cell.alcove && chance(cell.propRng, 0.5)) {
            const aw = 1.1, ah = 1.6, ay = 0.55;
            const acol = scaleColor(levelDef.palette.wall, tint * 0.35);
            if (dir === 0) {
              gb.box(0.1, ah, aw, wx + CELL - 0.1, ay, wz + CELL / 2, acol);
              gb.box(0.16, 0.08, aw + 0.2, wx + CELL - 0.05, ay + ah, wz + CELL / 2, wcol); // lintel
            } else {
              gb.box(aw, ah, 0.1, wx + CELL / 2, ay, wz + CELL - 0.1, acol);
              gb.box(aw + 0.2, 0.08, 0.16, wx + CELL / 2, ay + ah, wz + CELL - 0.05, wcol);
            }
          }
        }
      }

      // narrow corridor squeeze: thicken existing wall edges inward
      if (cell.narrow > 0) {
        const inset = Math.min(1.0, cell.narrow);
        const ncol = scaleColor(levelDef.palette.wall, tint * 0.9);
        const w0 = world.wallInfo(cx, cz, 0), w2 = world.wallInfo(cx, cz, 2);
        const w1 = world.wallInfo(cx, cz, 1), w3 = world.wallInfo(cx, cz, 3);
        const anyWall = w0.wall || w1.wall || w2.wall || w3.wall;
        const squeeze = (dir) => { // only squeeze solid non-door walls
          const w = [w0, w1, w2, w3][dir];
          return w.wall && !w.door;
        };
        if (anyWall) {
          if (squeeze(0)) { gb.box(inset, ceilY, CELL, wx + CELL - inset / 2, 0, wz + CELL / 2, ncol); colliders.push({ x: wx + CELL - inset / 2, z: wz + CELL / 2, hw: inset / 2, hd: CELL / 2 }); }
          if (squeeze(2)) { gb.box(inset, ceilY, CELL, wx + inset / 2, 0, wz + CELL / 2, ncol); colliders.push({ x: wx + inset / 2, z: wz + CELL / 2, hw: inset / 2, hd: CELL / 2 }); }
          if (squeeze(1)) { gb.box(CELL, ceilY, inset, wx + CELL / 2, 0, wz + CELL - inset / 2, ncol); colliders.push({ x: wx + CELL / 2, z: wz + CELL - inset / 2, hw: CELL / 2, hd: inset / 2 }); }
          if (squeeze(3)) { gb.box(CELL, ceilY, inset, wx + CELL / 2, 0, wz + inset / 2, ncol); colliders.push({ x: wx + CELL / 2, z: wz + inset / 2, hw: CELL / 2, hd: inset / 2 }); }
        } else {
          // open area squeezed into a slot anyway — claustrophobic pinch
          const alongX = chance(cell.propRng, 0.5);
          if (alongX) {
            gb.box(CELL, ceilY, inset, wx + CELL / 2, 0, wz + inset / 2, ncol);
            gb.box(CELL, ceilY, inset, wx + CELL / 2, 0, wz + CELL - inset / 2, ncol);
            colliders.push({ x: wx + CELL / 2, z: wz + inset / 2, hw: CELL / 2, hd: inset / 2 });
            colliders.push({ x: wx + CELL / 2, z: wz + CELL - inset / 2, hw: CELL / 2, hd: inset / 2 });
          } else {
            gb.box(inset, ceilY, CELL, wx + inset / 2, 0, wz + CELL / 2, ncol);
            gb.box(inset, ceilY, CELL, wx + CELL - inset / 2, 0, wz + CELL / 2, ncol);
            colliders.push({ x: wx + inset / 2, z: wz + CELL / 2, hw: inset / 2, hd: CELL / 2 });
            colliders.push({ x: wx + CELL - inset / 2, z: wz + CELL / 2, hw: inset / 2, hd: CELL / 2 });
          }
        }
      }

      // pillars
      if (cell.pillar) {
        const px = wx + 2, pz = wz + 2;
        const prng = rngFrom(hashStr(seed, `l${level}:pillar:${cx},${cz}`));
        const psize = range(prng, 0.4, 0.9);
        const pcol = scaleColor(levelDef.palette.wall, tint * 0.75);
        if (cell.pillarShape === 1) {
          gb.cylinder(psize * 0.55, ceilY, px, 0, pz, pcol);
        } else if (cell.pillarShape === 2) {
          gb.box(psize, ceilY, psize * 0.4, px, 0, pz, pcol);
          gb.box(psize * 0.4, ceilY, psize, px, 0, pz, pcol);
        } else {
          gb.box(psize, ceilY, psize, px, 0, pz, pcol);
        }
        colliders.push({ x: px, z: pz, r: psize * 0.7 });
      }

      // light fixtures — panel / tube / hanging bulb styles
      if (cell.light) {
        const lr = rngFrom(hashStr(seed, `l${level}:light:${cx},${cz}`));
        const lx = wx + 2 + (lr() - 0.5) * 1.4;
        const lz = wz + 2 + (lr() - 0.5) * 1.4;
        const ly = ceilY - (cell.ceilDrop > 0 ? cell.ceilDrop : 0) - 0.02;
        if (cell.lightStyle === 'tube') {
          gbEmiss.box(1.9, 0.06, 0.14, lx, ly, lz, [255, 250, 226], chance(lr, 0.5) ? Math.PI / 2 : 0);
        } else if (cell.lightStyle === 'bulb') {
          gb.box(0.03, 0.35, 0.03, lx, ly - 0.35, lz, [30, 30, 32]);
          gbEmiss.box(0.16, 0.16, 0.16, lx, ly - 0.45, lz, [255, 244, 214]);
        } else {
          gbEmiss.box(1.2, 0.08, 0.4, lx, ly, lz, [255, 250, 226]);
        }
        lights.push({
          cx, cz, x: lx, z: lz, y: (cell.lightStyle === 'bulb' ? ly - 0.5 : ly) - 0.04,
          color: levelDef.palette.lightColor,
          intensity: levelDef.palette.lightI * (cell.lightStyle === 'bulb' ? 0.55 : 1),
          distance: levelDef.palette.lightDist * (cell.lightStyle === 'bulb' ? 0.8 : 1),
          flickerSeed: hashStr(seed, `l${level}:flicker:${cx},${cz}`),
          special: cell.special,
        });
      }

      // damage debris: fallen panels, rubble
      if (cell.damage > 0.45 && chance(cell.propRng, 0.5)) {
        const drng = cell.propRng;
        const dx = wx + range(drng, 0.8, CELL - 0.8), dz = wz + range(drng, 0.8, CELL - 0.8);
        PROP_BUILDERS.rubble(makeShiftBuilder(gb, dx, dz, drng() * 3), drng);
        if (chance(drng, 0.4)) PROP_BUILDERS.tippedchair(makeShiftBuilder(gb, wx + range(drng, 1, 3), wz + range(drng, 1, 3), drng() * 3), drng);
      }

      // battery pickup
      if (cell.batterySpawn) {
        const bx = wx + 2 + (cell.propRng() - 0.5) * 2;
        const bz = wz + 2 + (cell.propRng() - 0.5) * 2;
        PROP_BUILDERS.battery(makeShiftBuilder(gb, bx, bz, 0), cell.propRng);
        notes.push({ x: bx, z: bz, id: `batt:${cx},${cz}`, battery: true });
      }

      // water surface
      if (cell.water) {
        gbWater.quad(
          [[wx, 0.06, wz], [wx + CELL, 0.06, wz], [wx + CELL, 0.06, wz + CELL], [wx, 0.06, wz + CELL]],
          [0, 1, 0], scaleColor([20, 40, 38], 0.9), [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }

      // props
      if (quality !== 'low' || chance(cell.propRng, 0.6)) {
        pushProps(world, cell, gb, colliders, notes, quality);
      }

      // special room extras
      if (cell.special) {
        pushSpecial(world, cell, gb, colliders, specials);
      }
    }
  }

  const chunkMesh = new THREE.Mesh(gb.build(), mats.wall);
  chunkMesh.castShadow = quality === 'high' || quality === 'ultra';
  chunkMesh.receiveShadow = quality !== 'low';
  group.add(chunkMesh);

  const waterGeo = gbWater.build();
  if (waterGeo.getAttribute('position').count) {
    const wm = new THREE.Mesh(waterGeo, mats.water);
    wm.receiveShadow = quality !== 'low';
    group.add(wm);
  }

  const emissGeo = gbEmiss.build();
  if (emissGeo.getAttribute('position').count) {
    const em = new THREE.Mesh(emissGeo, mats.lightPanel);
    em.name = 'lightpanels';
    group.add(em);
  }

  group.userData = { colliders, lights, doors, specials, notes, chunkX, chunkZ };
  return group;
}

function pushWall(gb, dir, wx, wz, cell, h, col) {
  const t = 0.12;
  if (dir === 0) gb.box(t, h, cell, wx + cell, 0, wz + cell / 2, col);
  else gb.box(cell, h, t, wx + cell / 2, 0, wz + cell, col);
}

// wall with a 1.6m x 2.1m doorway hole
function pushDoorWall(gb, dir, wx, wz, cell, h, col) {
  const doorW = 1.6, doorH = 2.1, t = 0.12;
  const sideW = (cell - doorW) / 2;
  const lintelH = h - doorH;
  if (dir === 0) {
    gb.box(t, h, sideW, wx + cell, 0, wz + sideW / 2, col);
    gb.box(t, h, sideW, wx + cell, 0, wz + cell - sideW / 2, col);
    if (lintelH > 0) gb.box(t, lintelH, doorW, wx + cell, doorH, wz + cell / 2, col);
  } else {
    gb.box(sideW, h, t, wx + sideW / 2, 0, wz + cell, col);
    gb.box(sideW, h, t, wx + cell - sideW / 2, 0, wz + cell, col);
    if (lintelH > 0) gb.box(doorW, lintelH, t, wx + cell / 2, doorH, wz + cell, col);
  }
}

// Prop builders work in local space; this wrapper rotates + translates them.
function makeShiftBuilder(gb, px, pz, ry) {
  const cos = Math.cos(ry), sin = Math.sin(ry);
  return {
    box: (w, h, d, x, y, z, color, boxRy = 0) => {
      gb.box(w, h, d, px + x * cos - z * sin, y, pz + x * sin + z * cos, color, boxRy + ry);
    },
    cylinder: (r, h, x, y, z, color) => {
      gb.cylinder(r, h, px + x * cos - z * sin, y, pz + x * sin + z * cos, color);
    },
    col: (r) => { gb.lastCol = r; },
  };
}

function pushProps(world, cell, gb, colliders, notes, quality) {
  const rng = cell.propRng;
  const levelDef = world.def;
  if (!levelDef.props.length) return;
  let count = ((quality === 'low' ? 1 : 2) + intRange(rng, 0, 2)) * (cell.propBoost || 1);
  count = Math.min(9, Math.round(count));
  for (let i = 0; i < count; i++) {
    const k = levelDef.props[intRange(rng, 0, levelDef.props.length - 1)];
    const builder = PROP_BUILDERS[k];
    if (!builder) continue;
    const px = cell.cx * CELL + range(rng, 0.7, CELL - 0.7);
    const pz = cell.cz * CELL + range(rng, 0.7, CELL - 0.7);
    const ry = rng() * Math.PI * 2;
    builder(makeShiftBuilder(gb, px, pz, ry), rng);
    const r = gb.lastCol || 0;
    if (r > 0) colliders.push({ x: px, z: pz, r });
    gb.lastCol = 0;
    if ((k === 'papers' || k === 'desk') && chance(rng, 0.1)) {
      notes.push({ x: px, z: pz, id: `${cell.cx},${cell.cz}:${i}` });
    }
  }
}

function pushSpecial(world, cell, gb, colliders, specials) {
  const s = cell.special;
  if (!s) return;
  const sr = s.seed;
  switch (s.type) {
    case 'staircase': {
      const cx = cell.cx * CELL + 2, cz = cell.cz * CELL + 2;
      const steps = 6, stepH = 0.25, stepW = 1.2;
      for (let i = 0; i < steps; i++) {
        gb.box(1.4, stepH, stepW * 0.4, cx - (steps - i) * stepW * 0.4, i * stepH, cz, [110, 108, 102]);
      }
      gb.box(0.08, 0.8, 3, cx - 2.45, 0.2, cz, [80, 82, 84]);
      colliders.push({ x: cx - (steps - 1) * 0.48, z: cz, r: 1.4 });
      break;
    }
    case 'flooded': {
      if (chance(sr, 0.4)) {
        const px = cell.cx * CELL + 2 + (sr() - 0.5) * 1.4;
        const pz = cell.cz * CELL + 2 + (sr() - 0.5) * 1.4;
        gb.box(0.3, 0.3, 0.3, px, 0.05, pz, [60, 54, 44], sr() * 2);
      }
      break;
    }
    case 'highceiling': {
      if (chance(sr, 0.5)) {
        gb.box(CELL * 0.95, 0.25, 0.35, cell.cx * CELL + 2, cell.ceilH - 0.4, cell.cz * CELL + 2, [50, 52, 58]);
      }
      break;
    }
    case 'impossible': {
      if (chance(sr, 0.6)) {
        gb.box(2.5, 0.15, 0.9, cell.cx * CELL + 2, cell.ceilH * 0.55, cell.cz * CELL + 2 + (sr() - 0.5) * 1.5, [110, 110, 118], (sr() - 0.5) * 0.8);
      }
      if (chance(sr, 0.4)) {
        gb.box(0.9, 0.15, 2.4, cell.cx * CELL + 2 + (sr() - 0.5) * 1.4, cell.ceilH * 0.35, cell.cz * CELL + 2, [90, 92, 96], (sr() - 0.5) * 1.6);
      }
      break;
    }
    case 'lightsdie': {
      if (chance(sr, 0.35)) {
        gb.box(0.8, 0.06, 0.3, cell.cx * CELL + 2, cell.ceilH - 0.05, cell.cz * CELL + 2, [140, 140, 146]);
      }
      break;
    }
    case 'circularroom': {
      // circular floor inlay + central column
      const cxm = (s.x + s.w / 2) * CELL, czm = (s.z + s.h / 2) * CELL;
      const r = Math.min(s.w, s.h) * CELL * 0.5;
      if (Math.hypot(cell.cx * CELL + 2 - cxm, cell.cz * CELL + 2 - czm) < 2.2) {
        gb.cylinder(0.55, cell.ceilH, cxm, 0, czm, scaleColor(world.def.palette.wall, cell.tint * 0.8));
        colliders.push({ x: cxm, z: czm, r: 0.75 });
      }
      if (chance(sr, 0.5)) {
        gb.cylinder(r * 0.55, 0.02, cxm, 0.005, czm, scaleColor(world.def.palette.floor, 0.6));
      }
      break;
    }
    case 'longcorridor': {
      // overhead pipes running the length of the corridor
      const horiz = s.w >= s.h;
      const cy = cell.ceilH - 0.35;
      if (horiz) gb.box(CELL, 0.12, 0.12, cell.cx * CELL + 2, cy, cell.cz * CELL + 2, [70, 74, 78]);
      else gb.box(0.12, 0.12, CELL, cell.cx * CELL + 2, cy, cell.cz * CELL + 2, [70, 74, 78]);
      break;
    }
    case 'furniturepile': {
      // stacked abandoned furniture
      if (chance(sr, 0.8)) {
        const px = cell.cx * CELL + range(sr, 1, CELL - 1), pz = cell.cz * CELL + range(sr, 1, CELL - 1);
        const b = makeShiftBuilder(gb, px, pz, sr() * 3);
        PROP_BUILDERS.chair(b, sr);
        if (chance(sr, 0.6)) PROP_BUILDERS.tippedchair(makeShiftBuilder(gb, px + (sr() - 0.5), pz + (sr() - 0.5), sr() * 3), sr);
        colliders.push({ x: px, z: pz, r: 0.45 });
      }
      break;
    }
    case 'monitorroom': {
      if (chance(sr, 0.75)) {
        const px = cell.cx * CELL + range(sr, 0.8, CELL - 0.8), pz = cell.cz * CELL + range(sr, 0.8, CELL - 0.8);
        PROP_BUILDERS.monitorstack(makeShiftBuilder(gb, px, pz, sr() * 3), sr);
        colliders.push({ x: px, z: pz, r: 0.42 });
      }
      break;
    }
    case 'ventroom': {
      if (chance(sr, 0.7)) {
        PROP_BUILDERS.ventduct(makeShiftBuilder(gb, cell.cx * CELL + 2, cell.cz * CELL + 2, sr() * 1.6), sr);
      }
      break;
    }
    case 'elevator': {
      // broken elevator on the room's far wall, once per special
      const isAnchor = cell.cx === s.x + (s.w >> 1) && cell.cz === s.z + (s.h >> 1);
      if (isAnchor) {
        const bx = (s.x + s.w / 2) * CELL, bz = (s.z + s.h / 2) * CELL;
        const off = (Math.min(s.w, s.h) * CELL) / 2 - 1.0;
        const dx = [0, 1, 0, -1][s.doorSide], dz = [1, 0, -1, 0][s.doorSide];
        PROP_BUILDERS.elevatorframe(makeShiftBuilder(gb, bx - dx * off, bz - dz * off, Math.atan2(dx, dz)), sr);
        colliders.push({ x: bx - dx * off, z: bz - dz * off, hw: 0.9, hd: 0.9 });
      }
      break;
    }
    case 'clockroom': {
      const isAnchor = cell.cx === s.x + (s.w >> 1) && cell.cz === s.z + (s.h >> 1);
      if (isAnchor) {
        const bx = (s.x + s.w / 2) * CELL, bz = (s.z + s.h / 2) * CELL;
        const off = (Math.min(s.w, s.h) * CELL) / 2 - 0.8;
        const dx = [0, 1, 0, -1][s.doorSide], dz = [1, 0, -1, 0][s.doorSide];
        PROP_BUILDERS.bigclock(makeShiftBuilder(gb, bx - dx * off, bz - dz * off, Math.atan2(dx, dz) + Math.PI), sr);
      }
      break;
    }
    case 'statue': {
      const isAnchor = cell.cx === s.x + (s.w >> 1) && cell.cz === s.z + (s.h >> 1);
      if (isAnchor) {
        const bx = (s.x + s.w / 2) * CELL, bz = (s.z + s.h / 2) * CELL;
        PROP_BUILDERS.statue(makeShiftBuilder(gb, bx, bz, sr() * 3), sr);
        colliders.push({ x: bx, z: bz, r: 0.65 });
      }
      break;
    }
    case 'reddoor': {
      const isAnchor = cell.cx === s.x + (s.w >> 1) && cell.cz === s.z + (s.h >> 1);
      if (isAnchor) {
        const bx = (s.x + s.w / 2) * CELL, bz = (s.z + s.h / 2) * CELL;
        const off = (Math.min(s.w, s.h) * CELL) / 2 - 0.7;
        const dx = [0, 1, 0, -1][s.doorSide], dz = [1, 0, -1, 0][s.doorSide];
        const b = makeShiftBuilder(gb, bx - dx * off, bz - dz * off, Math.atan2(dx, dz));
        b.box(1.0, 2.1, 0.08, 0, 1.05, 0, [150, 30, 26]);
        b.box(0.12, 0.05, 0.12, 0.32, 1.0, 0.08, [180, 170, 150]);
        colliders.push({ x: bx - dx * off, z: bz - dz * off, hw: 0.7, hd: 0.7 });
      }
      break;
    }
    case 'officefloor': {
      if (chance(sr, 0.55)) {
        const px = cell.cx * CELL + range(sr, 1, CELL - 1), pz = cell.cz * CELL + range(sr, 1, CELL - 1);
        PROP_BUILDERS.cubicle(makeShiftBuilder(gb, px, pz, (sr() * 4 | 0) * Math.PI / 2), sr);
        colliders.push({ x: px, z: pz, r: 1.0 });
      }
      break;
    }
  }
  specials.push(s);
}

// ---------------------------------------------------------------------------
// World streaming manager
// ---------------------------------------------------------------------------
export class WorldManager {
  constructor(scene, world, quality) {
    this.scene = scene;
    this.world = world;
    this.quality = quality;
    this.chunks = new Map();
    this.morphBuf = [];
    this.setQuality(quality);
    this._colliderBuf = [];
  }

  setQuality(q) {
    this.quality = q;
    this.radius = (q === 'low' || q === 'medium') ? 1 : 2;
  }

  chunkKey(cx, cz) { return `${cx},${cz}`; }

  ensure(px, pz) {
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    for (const [key, entry] of this.chunks) {
      const dx = Math.abs(entry.chunkX - pcx), dz = Math.abs(entry.chunkZ - pcz);
      if (dx > this.radius + 1 || dz > this.radius + 1) this.unload(key);
    }
    const needed = [];
    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        const key = this.chunkKey(pcx + dx, pcz + dz);
        if (!this.chunks.has(key)) needed.push([Math.abs(dx) + Math.abs(dz), pcx + dx, pcz + dz]);
      }
    }
    needed.sort((a, b) => a[0] - b[0]);
    // build up to 2 chunks per frame to avoid stalls
    for (let i = 0; i < Math.min(2, needed.length); i++) {
      this.build(needed[i][1], needed[i][2]);
    }
  }

  build(cx, cz) {
    const key = this.chunkKey(cx, cz);
    if (this.chunks.has(key)) return;
    const mats = materialsFor(getLevel(this.world.level), this.world.seed, 1);
    const group = buildChunk(this.world, cx, cz, { materials: mats, quality: this.quality });
    this.scene.add(group);
    this.chunks.set(key, {
      group, chunkX: cx, chunkZ: cz,
      colliders: group.userData.colliders,
      lights: group.userData.lights,
      doors: group.userData.doors,
      specials: group.userData.specials,
      notes: group.userData.notes,
      lightMesh: group.getObjectByName('lightpanels'),
    });
    // flush queued morphs for this chunk
    for (let i = this.morphBuf.length - 1; i >= 0; i--) {
      const m = this.morphBuf[i];
      if (m.cx === cx && m.cz === cz) {
        this.morphBuf.splice(i, 1);
        if (m.variant !== undefined) this.world.morph(cx, cz, m.variant);
        this.unload(key);
        this.build(cx, cz);
        break;
      }
    }
  }

  unload(key) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.scene.remove(chunk.group);
    chunk.group.traverse((obj) => { if (obj.isMesh) obj.geometry.dispose(); });
    this.chunks.delete(key);
  }

  applyMorph(m) {
    if (m.variant !== undefined) this.world.morph(m.cx, m.cz, m.variant);
    const key = this.chunkKey(m.cx, m.cz);
    if (this.chunks.has(key)) {
      this.unload(key);
      this.build(m.cx, m.cz);
    } else {
      this.morphBuf.push(m);
    }
  }

  nearbyColliders(px, pz) {
    const out = this._colliderBuf;
    out.length = 0;
    const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(this.chunkKey(pcx + dx, pcz + dz));
        if (chunk) for (const c of chunk.colliders) out.push(c);
      }
    }
    return out;
  }

  nearestInteractable(px, pz) {
    let best = null, bestD = 3.2;
    for (const chunk of this.chunks.values()) {
      for (const n of chunk.notes) {
        const d = Math.hypot(n.x - px, n.z - pz);
        if (d < bestD) { best = { type: n.battery ? 'battery' : 'note', data: n, dist: d }; bestD = d; }
      }
      for (const d of chunk.doors) {
        const dd = Math.hypot(d.x - px, d.z - pz);
        if (dd < bestD) { best = { type: 'door', data: d, dist: dd }; bestD = dd; }
      }
    }
    return best;
  }

  removeInteractable(id) {
    for (const chunk of this.chunks.values()) {
      const i = chunk.notes.findIndex((n) => n.id === id);
      if (i >= 0) { chunk.notes.splice(i, 1); return true; }
    }
    return false;
  }

  monstersSpawnCell(px, pz) {
    const pcx = Math.floor(px / CELL), pcz = Math.floor(pz / CELL);
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 20;
      const cx = Math.floor((px + Math.cos(a) * r) / CELL);
      const cz = Math.floor((pz + Math.sin(a) * r) / CELL);
      if (!this.world.cellAt(cx, cz).special) return [cx, cz];
    }
    return [pcx - 5, pcz - 5];
  }
}

function scaleColor(c, k) {
  return [clamp255(c[0] * k), clamp255(c[1] * k), clamp255(c[2] * k)];
}
function clamp255(v) { return Math.max(0, Math.min(255, v | 0)); }
