// Material factory — builds the PBR material set for a level from
// procedural textures. Materials are cached per level id.
import * as THREE from 'three';
import { rngFrom, hashStr } from './rng.js';
import * as TEX from './textures.js';

const cache = new Map();

export function materialsFor(level, seed, texScale = 1) {
  const key = `${seed}:${level.id}:${texScale}`;
  if (cache.has(key)) return cache.get(key);

  const rng = rngFrom(hashStr(seed, 'materials:' + level.id));
  const pal = level.palette;

  const wallCanvas = makeWallCanvas(level, rng);
  const floorCanvas = makeFloorCanvas(level, rng);
  const ceilCanvas = makeCeilCanvas(level, rng);

  const wallMap = TEX.toTexture(wallCanvas);
  const floorMap = TEX.toTexture(floorCanvas);
  const ceilMap = TEX.toTexture(ceilCanvas);

  const wallRough = TEX.toTexture(roughnessFrom(wallCanvas, rng), false);
  const floorRough = TEX.toTexture(roughnessFrom(floorCanvas, rng), false);
  const ceilRough = TEX.toTexture(roughnessFrom(ceilCanvas, rng), false);

  const wallNormal = TEX.makeNormalPair(rng, level.wallMat === 'concrete' ? 7 : 4, 1.4);
  const floorNormal = TEX.makeNormalPair(rng, level.floorMat === 'tile' ? 3 : 6, 1.2);

  const mats = {
    wall: new THREE.MeshStandardMaterial({
      map: wallMap, roughnessMap: wallRough, roughness: 1, metalness: level.wallMat === 'metal' ? 0.35 : 0.02,
      normalMap: wallNormal, normalScale: new THREE.Vector2(0.6, 0.6),
      vertexColors: true,
    }),
    floor: new THREE.MeshStandardMaterial({
      map: floorMap, roughnessMap: floorRough, roughness: 1, metalness: level.floorMat === 'metal' ? 0.4 : 0.02,
      normalMap: floorNormal, normalScale: new THREE.Vector2(0.8, 0.8),
      vertexColors: true,
    }),
    ceil: new THREE.MeshStandardMaterial({
      map: ceilMap, roughnessMap: ceilRough, roughness: 1, metalness: 0.0,
      vertexColors: true,
    }),
    door: new THREE.MeshStandardMaterial({
      map: TEX.toTexture(TEX.woodDoor(rng)), roughness: 0.75, metalness: 0.05, color: 0xbdb6ac,
    }),
    metalDoor: new THREE.MeshStandardMaterial({
      map: TEX.toTexture(TEX.metalPanel(rng)), roughness: 0.55, metalness: 0.6, color: 0x9aa0a8,
    }),
    prop: new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.15, vertexColors: true }),
    lightPanel: new THREE.MeshBasicMaterial({ color: 0xfff4d6 }),
    water: new THREE.MeshStandardMaterial({
      color: 0x14201e, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82,
    }),
    paper: new THREE.MeshStandardMaterial({ map: TEX.toTexture(TEX.paperNote(rng), true, false), roughness: 0.9, side: THREE.DoubleSide }),
  };

  // light panel emissive varies with level
  mats.lightPanel.color = new THREE.Color(pal.lightColor).multiplyScalar(1.0);
  mats.lightPanel.toneMapped = false;

  cache.set(key, mats);
  return mats;
}

function makeWallCanvas(level, rng) {
  switch (level.wallMat) {
    case 'wallpaper': return TEX.wallpaper(rng, level.palette.wall, true);
    case 'concrete': return TEX.concrete(rng, level.palette.wall);
    case 'metal': return TEX.metalPanel(rng, level.palette.wall);
    case 'tile': return TEX.tileFloor(rng, level.palette.wall);
    case 'officeWall': return TEX.wallpaper(rng, level.palette.wall, false);
    case 'hotelWall': return TEX.wallpaper(rng, level.palette.wall, true);
    default: return TEX.wallpaper(rng, level.palette.wall, true);
  }
}
function makeFloorCanvas(level, rng) {
  switch (level.floorMat) {
    case 'carpet': return TEX.carpet(rng, level.palette.floor, 0);
    case 'concrete': return TEX.concrete(rng, level.palette.floor);
    case 'metal': return TEX.metalPanel(rng, level.palette.floor);
    case 'tile': return TEX.tileFloor(rng, level.palette.floor);
    case 'officeCarpet': return TEX.carpet(rng, level.palette.floor, 2);
    case 'hotelCarpet': return TEX.carpet(rng, level.palette.floor, 1);
    default: return TEX.carpet(rng, level.palette.floor, 0);
  }
}
function makeCeilCanvas(level, rng) {
  switch (level.ceilMat) {
    case 'ceilingTile': return TEX.ceilingTile(rng, level.palette.ceil);
    case 'concrete': return TEX.concrete(rng, level.palette.ceil);
    case 'metal': return TEX.metalPanel(rng, level.palette.ceil);
    default: return TEX.ceilingTile(rng, level.palette.ceil);
  }
}

// roughness map: darker albedo -> slightly less rough, stains get shinier
function roughnessFrom(srcCanvas, rng) {
  const s = srcCanvas.width;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c8c8c8';
  ctx.fillRect(0, 0, s, s);
  ctx.globalAlpha = 0.35;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(srcCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return c;
}

export function disposeCache() {
  for (const mats of cache.values()) {
    for (const m of Object.values(mats)) {
      if (m && m.dispose) m.dispose();
    }
  }
  cache.clear();
}
