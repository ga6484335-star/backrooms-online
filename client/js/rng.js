// Seeded deterministic RNG utilities shared by every world system.
// All generation must be pure functions of (seed, level, coordinates) so that
// every player in a room computes the identical world.

export function hashStr(seed, str) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i) + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = h >>> 0;
  }
  return h >>> 0;
}

// mulberry32 — fast, fine for visual variety
export function rngFrom(hash) {
  let a = hash >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cellRng(seed, level, x, z, tag = '') {
  return rngFrom(hashStr(seed, `l${level}:${tag}:${x},${z}`));
}

export function pick(rng, arr) { return arr[Math.min(arr.length - 1, (rng() * arr.length) | 0)]; }
export function chance(rng, p) { return rng() < p; }
export function range(rng, a, b) { return a + rng() * (b - a); }
export function intRange(rng, a, b) { return a + ((rng() * (b - a + 1)) | 0); }

// Densely sampling cell info: memoized per (seed,level) via Map with string key
export function makeCache() { return new Map(); }
