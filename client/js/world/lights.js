// Dynamic fluorescent light manager.
// The world can contain hundreds of fixtures, but only a small pool of real
// THREE.PointLights is kept active around the player. Flicker patterns are
// deterministic per fixture so every player sees the same behaviour.
import * as THREE from 'three';
import { rngFrom } from '../rng.js';

const MAX_LIGHTS = { low: 2, medium: 3, high: 4, ultra: 6 };

export class LightManager {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.pool = [];
    this.fixtures = new Map(); // key -> fixture info {x,y,z,color,intensity,distance,flickerSeed,special}
    this.dead = new Set();     // fixtures permanently off (lightdie events)
    this.budget = MAX_LIGHTS[quality] || 4;
    for (let i = 0; i < MAX_LIGHTS.ultra; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.visible = false;
      l.castShadow = false;
      scene.add(l);
      this.pool.push(l);
    }
    this.time = 0;
  }

  setQuality(q) { this.budget = MAX_LIGHTS[q] || 4; }

  addFixture(f, key) {
    this.fixtures.set(key, f);
  }

  removeFixturesIn(chunkX, chunkZ) {
    for (const [key, f] of this.fixtures) {
      if (Math.floor(f.cx / 4) === chunkX && Math.floor(f.cz / 4) === chunkZ) {
        this.fixtures.delete(key);
      }
    }
  }

  killFixture(key) { this.dead.add(key); }
  reviveFixture(key) { this.dead.delete(key); }

  // permanently kill the nearest live fixture within maxD; returns its key
  killNearest(px, pz, maxD = 12) {
    let best = null, bestD = maxD;
    for (const [key, f] of this.fixtures) {
      if (this.dead.has(key)) continue;
      const d = Math.hypot(f.x - px, f.z - pz);
      if (d < bestD) { best = key; bestD = d; }
    }
    if (best) this.dead.add(best);
    return best;
  }

  // bring the nearest DEAD fixture within maxD back to life; returns its key
  reviveNearest(px, pz, maxD = 16) {
    let best = null, bestD = maxD;
    for (const [key, f] of this.fixtures) {
      if (!this.dead.has(key)) continue;
      const d = Math.hypot(f.x - px, f.z - pz);
      if (d < bestD) { best = key; bestD = d; }
    }
    if (best) this.dead.delete(best);
    return best;
  }

  update(dt, px, pz, camera) {
    this.time += dt;
    // rank fixtures by distance to player
    let candidates = [];
    for (const [key, f] of this.fixtures) {
      if (this.dead.has(key)) continue;
      const d = Math.hypot(f.x - px, f.z - pz);
      if (d < f.distance * 1.6) candidates.push([d, key, f]);
    }
    candidates.sort((a, b) => a[0] - b[0]);
    candidates = candidates.slice(0, this.budget);

    // assign pool lights
    for (let i = 0; i < this.pool.length; i++) {
      const light = this.pool[i];
      if (i < candidates.length) {
        const [d, key, f] = candidates[i];
        const rng = rngFrom(f.flickerSeed);
        const flicker = this.flickerPattern(f.flickerSeed, this.time, f);
        light.visible = flicker > 0.03;
        light.position.set(f.x, f.y, f.z);
        light.color.set(f.color);
        light.intensity = f.intensity * flicker;
        light.distance = f.distance;
      } else {
        light.visible = false;
      }
    }
  }

  // deterministic flicker: base pattern from seed + occasional deep dips
  flickerPattern(seed, t, f) {
    // special rooms: lightsdie gets dramatic progressive failure
    const rngT = rngFrom(seed + ((t * 2) | 0));
    let base = 1;
    const roll = rngT();
    if (f.special && f.special.type === 'lightsdie') {
      // lights progressively fail: intensity decays with world time modulo
      const cycle = (t * 0.13) % 1;
      base = cycle > 0.6 ? Math.max(0, 1 - (cycle - 0.6) * 2.2) : 1;
      if (roll < 0.06) base *= 0.15;
    } else {
      if (roll < 0.04) base *= 0.05 + rngT() * 0.2;       // near-blackout flick
      else if (roll < 0.12) base *= 0.4 + rngT() * 0.3;   // strong flicker
      else if (roll < 0.3) base *= 0.85 + rngT() * 0.1;   // subtle wobble
    }
    // fast buzz modulation
    base *= 0.94 + 0.06 * Math.sin(t * 47 + seed % 100);
    return Math.max(0, Math.min(1.25, base));
  }

  // how bright is the world at a point (used for audio ducking + fear logic)
  brightnessAt(px, pz) {
    let b = 0;
    for (const [key, f] of this.fixtures) {
      if (this.dead.has(key)) continue;
      const d = Math.hypot(f.x - px, f.z - pz);
      if (d < f.distance) b += (1 - d / f.distance) * this.flickerPattern(f.flickerSeed, this.time, f);
    }
    return Math.min(1, b);
  }
}
