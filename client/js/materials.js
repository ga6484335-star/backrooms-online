// Material factory — builds the PBR material set for a level.
//
// Each surface gets its OWN material with matched albedo / roughness / normal
// maps produced from a single height field (see textures.js). Vertex colours on
// the merged chunk geometry multiply the albedo, so the district tinting and
// damage darkening that worldgen already computes still apply on top.
//
// Materials are cached per (seed, level, quality): building the 512px maps is
// not free, but it happens once per level.
import * as THREE from 'three';
import { rngFrom, hashStr } from './rng.js';
import * as TEX from './textures.js';

const cache = new Map();

// turn a *Surface() result into the three textures a MeshStandardMaterial wants
function surfaceMaps(surf) {
  const map = TEX.toTexture(surf.albedo, true);
  const rough = TEX.toTexture(surf.roughness, false);
  const normal = surf.normal ? TEX.toTexture(surf.normal, false) : null;
  return { map, rough, normal };
}

export function materialsFor(level, seed, texScale = 1) {
  const key = `${seed}:${level.id}:${texScale}`;
  if (cache.has(key)) return cache.get(key);

  const rng = rngFrom(hashStr(seed, 'materials:' + level.id));
  const pal = level.palette;

  const wallSurf = makeWallSurface(level, rng);
  const floorSurf = makeFloorSurface(level, rng);
  const ceilSurf = makeCeilSurface(level, rng);

  const wallM = surfaceMaps(wallSurf);
  const floorM = surfaceMaps(floorSurf);
  const ceilM = surfaceMaps(ceilSurf);

  const isMetal = level.wallMat === 'metal';
  const isGlaze = level.floorMat === 'tile';

  const mats = {
    wall: new THREE.MeshStandardMaterial({
      map: wallM.map, roughnessMap: wallM.rough, roughness: 1,
      normalMap: wallM.normal, normalScale: new THREE.Vector2(1.4, 1.4),
      metalness: isMetal ? 0.42 : 0.02,
      vertexColors: true,
      envMapIntensity: isMetal ? 0.9 : 0.35,
    }),
    floor: new THREE.MeshStandardMaterial({
      map: floorM.map, roughnessMap: floorM.rough, roughness: 1,
      normalMap: floorM.normal, normalScale: new THREE.Vector2(1.6, 1.6),
      metalness: level.floorMat === 'metal' ? 0.5 : (isGlaze ? 0.08 : 0.02),
      vertexColors: true,
      envMapIntensity: isGlaze ? 0.7 : 0.28,
    }),
    ceil: new THREE.MeshStandardMaterial({
      map: ceilM.map, roughnessMap: ceilM.rough, roughness: 1,
      normalMap: ceilM.normal, normalScale: new THREE.Vector2(1.15, 1.15),
      metalness: level.ceilMat === 'metal' ? 0.4 : 0.0,
      vertexColors: true,
      envMapIntensity: 0.2,
    }),
    door: new THREE.MeshStandardMaterial({
      map: TEX.toTexture(TEX.woodSurface(rng).albedo), roughness: 0.68, metalness: 0.04,
      color: 0xbdb6ac, envMapIntensity: 0.3,
    }),
    metalDoor: new THREE.MeshStandardMaterial({
      map: TEX.toTexture(TEX.metalSurface(rng).albedo), roughness: 0.48, metalness: 0.62,
      color: 0x9aa0a8, envMapIntensity: 0.8,
    }),
    // painted architectural trim (skirting, chair rails). Slightly glossier than
    // the wall paint, with a faint grain normal so it catches the tube light.
    trim: new THREE.MeshStandardMaterial({
      roughness: 0.55, metalness: 0.03, vertexColors: true,
      normalMap: TEX.makeNormalPair(rng, 24, 0.5, 128),
      normalScale: new THREE.Vector2(0.18, 0.18),
      envMapIntensity: 0.4,
    }),
    // props are merged into one vertex-coloured mesh with no UV continuity, so
    // they get a subtle procedural normal only — no albedo map to smear.
    prop: new THREE.MeshStandardMaterial({
      roughness: 0.82, metalness: 0.12, vertexColors: true,
      normalMap: TEX.makeNormalPair(rng, 6, 0.5, 128),
      normalScale: new THREE.Vector2(0.25, 0.25),
      envMapIntensity: 0.3,
    }),
    // fluorescent diffuser: self-lit, so it is unlit + slightly bloomed. The
    // fixture surface supplies prismatic facet detail so the panel is not a flat
    // sheet of colour.
    lightPanel: new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.0,
      emissiveMap: TEX.toTexture(TEX.fixtureSurface(rng, pal.lightColor).albedo, true),
      roughness: 0.4, metalness: 0.0, toneMapped: false,
    }),
    water: new THREE.MeshStandardMaterial({
      color: 0x14201e, roughness: 0.08, metalness: 0.15,
      transparent: true, opacity: 0.82,
      envMapIntensity: 1.1,
    }),
    paper: new THREE.MeshStandardMaterial({
      map: TEX.toTexture(TEX.paperNote(rng), true, false), roughness: 0.9, side: THREE.DoubleSide,
    }),
  };

  // the fluorescent tube glows in the level's light colour
  mats.lightPanel.emissive = new THREE.Color(pal.lightColor);
  mats.lightPanel.color = new THREE.Color(pal.lightColor).multiplyScalar(1.2);
  mats.lightPanel.toneMapped = false;

  cache.set(key, mats);
  return mats;
}

function makeWallSurface(level, rng) {
  switch (level.wallMat) {
    case 'wallpaper': return TEX.wallpaperSurface(rng, level.palette.wall, { stripesOn: true, motif: 'damask' });
    case 'concrete': return TEX.concreteSurface(rng, level.palette.wall);
    case 'metal': return TEX.metalSurface(rng, level.palette.wall);
    case 'tile': return TEX.tileSurface(rng, level.palette.wall);
    case 'officeWall': return TEX.wallpaperSurface(rng, level.palette.wall, { stripesOn: false, motif: 'plain' });
    case 'hotelWall': return TEX.wallpaperSurface(rng, level.palette.wall, { stripesOn: true, motif: 'damask', seamSpacing: 170 });
    default: return TEX.wallpaperSurface(rng, level.palette.wall, { stripesOn: true, motif: 'damask' });
  }
}

function makeFloorSurface(level, rng) {
  switch (level.floorMat) {
    case 'carpet': return TEX.carpetSurface(rng, level.palette.floor, 0);
    case 'concrete': return TEX.concreteSurface(rng, level.palette.floor);
    case 'metal': return TEX.metalSurface(rng, level.palette.floor);
    case 'tile': return TEX.tileSurface(rng, level.palette.floor);
    case 'officeCarpet': return TEX.carpetSurface(rng, level.palette.floor, 2);
    case 'hotelCarpet': return TEX.carpetSurface(rng, level.palette.floor, 1);
    default: return TEX.carpetSurface(rng, level.palette.floor, 0);
  }
}

function makeCeilSurface(level, rng) {
  switch (level.ceilMat) {
    case 'ceilingTile': return TEX.ceilingTileSurface(rng, level.palette.ceil);
    case 'concrete': return TEX.concreteSurface(rng, level.palette.ceil);
    case 'metal': return TEX.metalSurface(rng, level.palette.ceil);
    default: return TEX.ceilingTileSurface(rng, level.palette.ceil);
  }
}

export function disposeCache() {
  for (const mats of cache.values()) {
    for (const m of Object.values(mats)) {
      if (!m) continue;
      for (const k of ['map', 'roughnessMap', 'normalMap', 'bumpMap', 'emissiveMap']) {
        if (m[k] && m[k].dispose) m[k].dispose();
      }
      if (m.dispose) m.dispose();
    }
  }
  cache.clear();
}
