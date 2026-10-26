// Procedural texture factory — everything is generated at runtime, no assets.
//
// The key idea: every surface is described by a *tileable height field*. The
// albedo, the roughness map and the tangent-space normal map are all sampled
// from that one field, so the bump, the shading breakup and the wear lines up
// instead of fighting itself. Tiles are seamless (all noise is periodic and
// every feature that touches an edge is wrapped), so a 4 m cell never shows a
// visible repeat seam on its own texture border.
import * as THREE from 'three';

// 512 gives roughly 128 px per metre on a 4 m cell: enough for wallpaper seams,
// carpet pile and ceiling perforations to actually read at walking distance.
const S = 512;

function makeCanvas(s = S) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  return [c, c.getContext('2d')];
}

// ---------------------------------------------------------------- noise ----
// Deterministic PRNG for a single tile so a texture looks the same every run.
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Periodic value noise. The lattice wraps on `grid`, which is what makes the
// resulting texture tileable.
function periodicNoise(grid, rng) {
  const g = new Float32Array(grid * grid);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const at = (x, y) => g[(((y % grid) + grid) % grid) * grid + (((x % grid) + grid) % grid)];
  return (u, v) => {
    const x = u * grid, y = v * grid;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  };
}

// Sum a few octaves of periodic noise into a 0..1 field of size s.
function fbm(s, seed, { octaves = 5, base = 4, gain = 0.5, lac = 2 } = {}) {
  const rng = mulberry(seed);
  const layers = [];
  let g = base, amp = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    layers.push([periodicNoise(Math.max(2, g | 0), rng), amp]);
    norm += amp;
    g *= lac; amp *= gain;
  }
  const out = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let v = 0;
      for (const [n, a] of layers) v += n(x / s, y / s) * a;
      out[y * s + x] = v / norm;
    }
  }
  return out;
}

// Stretch a height field to use its full 0..1 range.
//
// The recipes below compose height from several small-amplitude terms (emboss,
// grain, grime, seams) that mostly cancel out, so the raw field only spans
// ~0.2. Central differences of such a field are tiny, which is why the first
// pass produced near-flat normal maps (std ~6/255) and constant roughness maps
// — the surface looked smooth no matter how detailed the albedo was.
//
// The stretch is anchored on the 2nd/98th percentile rather than the absolute
// min/max: a handful of seam pixels reach far outside the bulk, and using them
// as the endpoints would squash everything else back into a narrow band.
function stretchHeight(h) {
  const N = h.length;
  const hist = new Int32Array(256);
  for (let i = 0; i < N; i++) {
    const b = Math.max(0, Math.min(255, (h[i] * 255) | 0));
    hist[b]++;
  }
  const loCount = N * 0.02, hiCount = N * 0.98;
  let acc = 0, lo = 0, hi = 1;
  for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= loCount) { lo = b / 255; break; } }
  acc = 0;
  for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= hiCount) { hi = b / 255; break; } }

  const range = hi - lo;
  if (range < 1e-6) return h;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = Math.max(0, Math.min(1, (h[i] - lo) / range));
  return out;
}

// Tangent-space normal map from a height field (central differences, wrapped).
// The field is normalised first so the relief uses the full map range.
function normalMapFromHeight(h, s, strength = 2.2) {
  const hn = stretchHeight(h);
  const [c, ctx] = makeCanvas(s);
  const img = ctx.createImageData(s, s);
  const at = (x, y) => hn[((((y % s) + s) % s) * s) + (((x % s) + s) % s)];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * s + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = inv * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Roughness map: surfaces with a higher height reading are duller (fabric,
// unpainted plaster), recessed grime is a touch shinier (grease/water).
// The field is normalised first, otherwise the narrow raw range would compress
// every value into a couple of grey levels and the map would do nothing.
function roughnessFromHeight(h, s, lo = 0.55, hi = 1.0) {
  const hn = stretchHeight(h);
  const [c, ctx] = makeCanvas(s);
  const img = ctx.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = (lo + (hi - lo) * hn[i]) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function toTexture(canvas, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// --------------------------------------------------------- colour utils ----
function rgb(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function shade(c, d) { return [clamp8(c[0] + d), clamp8(c[1] + d), clamp8(c[2] + d)]; }
function clamp8(v) { return Math.max(0, Math.min(255, v)); }
function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// stains/streaks are applied directly to a canvas with soft radial gradients
function stains(ctx, s, rng, count, darkness = 0.28, maxR = 0.4) {
  for (let i = 0; i < count; i++) {
    const x = rng() * s, y = rng() * s, r = (0.06 + rng() * maxR) * s;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const d = (0.1 + rng() * darkness) * (rng() < 0.3 ? 1.6 : 1);
    g.addColorStop(0, `rgba(24,19,10,${d})`);
    g.addColorStop(1, 'rgba(24,19,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rng()), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Vertical water damage; wrapped horizontally so it stays tileable.
function streaks(ctx, s, rng, count, darkness = 0.2) {
  for (let i = 0; i < count; i++) {
    const x = rng() * s, w = 1.5 + rng() * 5, len = s * (0.3 + rng() * 0.7);
    const g = ctx.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(38,30,16,${darkness + rng() * 0.22})`);
    g.addColorStop(0.7, `rgba(38,30,16,${(darkness + rng() * 0.1) * 0.5})`);
    g.addColorStop(1, 'rgba(38,30,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, w, len);
    if (x + w > s) ctx.fillRect(x - s, 0, w, len); // wrap
  }
}

// ===================================================== surface recipes =====

// ---------------------------------------------------------------------------
// WALLPAPER — the iconic yellow-beige Backrooms wall.
//
// Real feature set: vertical embossed stripe pairs, a subtle flock damask
// repeat, horizontal hanging seams every ~1 m, vertical strip seams, scuffed
// base, moisture bloom and tide lines. Height field carries the emboss and the
// seams so the normal map actually catches the fluorescent light.
export function wallpaperSurface(rng, base = [181, 160, 92], opts = {}) {
  const { stripesOn = true, motif = 'damask', seamSpacing = 128 } = opts;
  const seed = Math.floor(rng() * 1e9);
  const emboss = fbm(S, seed, { octaves: 4, base: 6, gain: 0.55 });     // plaster unevenness
  const fine = fbm(S, seed ^ 0x9e37, { octaves: 3, base: 48, gain: 0.5 }); // paper tooth
  const grime = fbm(S, seed ^ 0x51ed, { octaves: 4, base: 3, gain: 0.6 });  // broad dirt

  const height = new Float32Array(S * S);
  const [c, ctx] = makeCanvas(S);
  const img = ctx.createImageData(S, S);

  const stripeCol = shade(base, -26);
  const stripeHi = shade(base, 18);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const u = x / S, v = y / S;
      let col = base.slice();
      let hgt = 0.45 + emboss[i] * 0.25 + fine[i] * 0.12;

      // embossed vertical stripe pair, 64 px period → wraps 8× across the tile
      if (stripesOn) {
        const sp = x % 64;
        if (sp < 10) { col = lerp3(col, stripeCol, 0.72); hgt -= 0.09; }
        else if (sp >= 14 && sp < 24) { col = lerp3(col, stripeHi, 0.55); hgt += 0.1; }
      }

      // flock damask motif: a repeating diamond of dots, barely-there relief
      if (motif === 'damask') {
        const mu = ((x % 64) - 32) / 32, mv = ((y % 64) - 32) / 32;
        const d = Math.abs(mu) + Math.abs(mv);
        if (d > 0.42 && d < 0.62) { col = lerp3(col, shade(base, -34), 0.5); hgt += 0.06; }
        if (Math.abs(mu) < 0.1 && Math.abs(mv) < 0.1) { col = lerp3(col, shade(base, 15), 0.45); hgt += 0.08; }
      }

      // horizontal hanging seam every seamSpacing px (visible wallpaper joint)
      const seam = y % seamSpacing;
      if (seam < 2) { col = lerp3(col, [74, 60, 30], 0.78); hgt -= 0.2; }
      else if (seam < 4) { col = lerp3(col, shade(base, 24), 0.45); hgt += 0.05; }
      // vertical strip seam every 128 px, offset from the emboss
      const vseam = x % 128;
      if (vseam < 1) { col = lerp3(col, [84, 68, 34], 0.68); hgt -= 0.15; }

      // broad dirt + fine tooth
      col = lerp3(col, [62, 50, 26], (grime[i] - 0.45) * 0.9);
      col = lerp3(col, shade(base, 14), (fine[i] - 0.5) * 0.45);

      const o = i * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      height[i] = Math.max(0, Math.min(1, hgt));
    }
  }
  ctx.putImageData(img, 0, 0);
  streaks(ctx, S, rng, window.__texStreaks === false ? 0 : 14, 0.18);
  stains(ctx, S, rng, 12, 0.24, 0.35);

  return {
    albedo: c,
    height,
    roughness: roughnessFromHeight(height, S, 0.78, 1.0),
    normal: normalMapFromHeight(height, S, 2.6),
  };
}

// ---------------------------------------------------------------------------
// CARPET — dense short-pile office carpet. Weave, pile noise, and dark traffic
// lanes. Height is high-frequency so the normal map scatters light into a matte
// fuzz instead of a flat colour.
export function carpetSurface(rng, base = [126, 116, 82], pattern = 0) {
  const seed = Math.floor(rng() * 1e9);
  const pile = fbm(S, seed, { octaves: 4, base: 64, gain: 0.55 });     // fibre fuzz
  const wear = fbm(S, seed ^ 0x2f1a, { octaves: 4, base: 3, gain: 0.62 }); // traffic lanes
  // woven loop rows: horizontal bands 3 px tall that alternate, like tufting
  const loopH = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const on = (y % 6) < 3 ? 1 : 0;
    for (let x = 0; x < S; x++) loopH[y * S + x] = on;
  }

  const height = new Float32Array(S * S);
  const [c, ctx] = makeCanvas(S);
  const img = ctx.createImageData(S, S);
  const dark = shade(base, -46);
  const hi = shade(base, 26);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let col = base.slice();
      let hgt = 0.5 + pile[i] * 0.4 + loopH[i] * 0.12;

      // woven loop shadowing
      col = lerp3(col, loopH[i] > 0.5 ? hi : dark, 0.4);

      if (pattern === 1) { // hotel diamond motif
        const mu = ((x % 64) - 32) / 32, mv = ((y % 64) - 32) / 32;
        if (Math.abs(Math.abs(mu) - Math.abs(mv)) < 0.08) { col = lerp3(col, shade(base, 58), 0.55); hgt += 0.08; }
      }
      if (pattern === 2) { // office tile: recessed seam grid
        const gx = x % 256, gy = y % 256;
        if (gx < 3 || gy < 3) { col = lerp3(col, [30, 26, 18], 0.7); hgt -= 0.24; }
      }

      // traffic wear darkens and flattens the pile
      const w = (wear[i] - 0.45) * 1.0;
      col = lerp3(col, [48, 42, 28], w);
      hgt -= Math.max(0, w) * 0.3;
      col = lerp3(col, hi, (pile[i] - 0.5) * 0.4);

      const o = i * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      height[i] = Math.max(0, Math.min(1, hgt));
    }
  }
  ctx.putImageData(img, 0, 0);
  stains(ctx, S, rng, 14, 0.34, 0.45);

  return {
    albedo: c,
    height,
    roughness: roughnessFromHeight(height, S, 0.9, 1.0),
    normal: normalMapFromHeight(height, S, 3.2),
  };
}

// ---------------------------------------------------------------------------
// CEILING TILE — mineral fibre acoustic panel: pinholes, fissures, sag, and the
// T-bar grid groove that catches shadow.
export function ceilingTileSurface(rng, base = [186, 181, 166]) {
  const seed = Math.floor(rng() * 1e9);
  const fibre = fbm(S, seed, { octaves: 4, base: 96, gain: 0.5 });
  const fis = fbm(S, seed ^ 0x77a1, { octaves: 4, base: 12, gain: 0.6 });
  const sag = fbm(S, seed ^ 0x33c9, { octaves: 3, base: 3, gain: 0.6 });

  const height = new Float32Array(S * S);
  const [c, ctx] = makeCanvas(S);
  const img = ctx.createImageData(S, S);
  const [dot, dotCtx] = makeCanvas(S);
  dotCtx.clearRect(0, 0, S, S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let col = base.slice();
      let hgt = 0.55 + fibre[i] * 0.22;

      // fissures read as dark shallow cracks
      const f = fis[i];
      if (f > 0.62) { const k = (f - 0.62) * 2.2; col = lerp3(col, [78, 74, 62], Math.min(0.8, k)); hgt -= 0.14 * k; }

      // sag: the panel bellies down slightly, darker toward the middle
      const su = (x / S - 0.5) * 2, sv = (y / S - 0.5) * 2;
      const sagK = (1 - Math.min(1, Math.hypot(su, sv))) * sag[i];
      hgt += sagK * 0.08;
      col = lerp3(col, shade(base, -26), sagK * 0.5);

      // T-bar grid groove at the tile border (2 tiles per texture)
      const gx = x % 256, gy = y % 256;
      if (gx < 4 || gy < 4) { col = lerp3(col, [58, 54, 44], 0.88); hgt -= 0.3; }
      else if (gx < 7 || gy < 7) { col = lerp3(col, shade(base, 22), 0.5); hgt += 0.07; }

      const o = i * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      height[i] = Math.max(0, Math.min(1, hgt));
    }
  }
  ctx.putImageData(img, 0, 0);

  // perforations: 2 px pinholes on a jittered grid, with a tiny dark rim
  const prng = mulberry(seed ^ 0xabcd);
  dotCtx.fillStyle = 'rgba(26,22,16,0.8)';
  for (let gy = 6; gy < S; gy += 9) {
    for (let gx = 6; gx < S; gx += 9) {
      const jx = gx + (prng() - 0.5) * 3, jy = gy + (prng() - 0.5) * 3;
      dotCtx.fillRect(jx, jy, 2.2, 2.2);
    }
  }
  ctx.globalAlpha = 0.95;
  ctx.drawImage(dot, 0, 0);
  ctx.globalAlpha = 1;
  stains(ctx, S, rng, 6, 0.38, 0.5);

  return {
    albedo: c,
    height,
    roughness: roughnessFromHeight(height, S, 0.92, 1.0),
    normal: normalMapFromHeight(height, S, 2.2),
  };
}

// ---------------------------------------------------------------------------
// CONCRETE — poured slab: form-board seams, aggregate speckle, spalling, rust.
export function concreteSurface(rng, base = [116, 114, 108]) {
  const seed = Math.floor(rng() * 1e9);
  const agg = fbm(S, seed, { octaves: 4, base: 128, gain: 0.5 });
  const broad = fbm(S, seed ^ 0x1b2c, { octaves: 4, base: 4, gain: 0.6 });
  const spall = fbm(S, seed ^ 0x4d5e, { octaves: 3, base: 9, gain: 0.62 });

  const height = new Float32Array(S * S);
  const [c, ctx] = makeCanvas(S);
  const img = ctx.createImageData(S, S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let col = base.slice();
      let hgt = 0.5 + agg[i] * 0.3 + broad[i] * 0.12;

      // form-board seams
      const seam = y % 128;
      if (seam < 2) { col = lerp3(col, shade(base, -34), 0.6); hgt -= 0.18; }
      // board tie holes
      if (x % 128 < 3 && seam < 3) { col = lerp3(col, [70, 66, 60], 0.7); hgt -= 0.25; }

      // spalling: brighter exposed aggregate patches
      const sp = spall[i];
      if (sp > 0.66) {
        const k = (sp - 0.66) * 2.5;
        col = lerp3(col, shade(base, 26), Math.min(0.6, k));
        hgt += 0.12 * k;
      }
      col = lerp3(col, [60, 58, 54], (broad[i] - 0.5) * 0.5);

      const o = i * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      height[i] = Math.max(0, Math.min(1, hgt));
    }
  }
  ctx.putImageData(img, 0, 0);
  streaks(ctx, S, rng, 8, 0.16);
  stains(ctx, S, rng, 10, 0.22, 0.4);

  return {
    albedo: c,
    height,
    roughness: roughnessFromHeight(height, S, 0.72, 0.98),
    normal: normalFromHeightLocal(height, S, 2.0),
  };
}

// ---------------------------------------------------------------------------
// METAL PANEL — riveted/ribbed industrial cladding with rust blooms.
export function metalSurface(rng, base = [84, 88, 94]) {
  const seed = Math.floor(rng() * 1e9);
  const brush = fbm(S, seed, { octaves: 3, base: 160, gain: 0.5 });
  const rust = fbm(S, seed ^ 0x6f77, { octaves: 4, base: 6, gain: 0.6 });

  const height = new Float32Array(S * S);
  const [c, ctx] = makeCanvas(S);
  const img = ctx.createImageData(S, S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let col = base.slice();
      let hgt = 0.5 + brush[i] * 0.1;

      // vertical ribs with a rolled highlight
      const rib = x % 64;
      if (rib < 4) { col = lerp3(col, shade(base, -30), 0.6); hgt -= 0.14; }
      else if (rib < 8) { col = lerp3(col, shade(base, 22), 0.4); hgt += 0.08; }
      else if (rib < 56) { col = lerp3(col, shade(base, 6), 0.2); }

      // rivet rows near the panel edges
      const ry = y % 128;
      if ((rib > 8 && rib < 14) || (rib > 50 && rib < 56)) {
        if (ry % 32 < 5) { col = lerp3(col, shade(base, 30), 0.5); hgt += 0.14; }
      }

      // rust blooms: colour shift, slight pitting
      const r = rust[i];
      if (r > 0.6) {
        const k = (r - 0.6) * 2.2;
        col = lerp3(col, [104, 58, 28], Math.min(0.75, k));
        hgt -= 0.08 * k;
      }

      const o = i * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      height[i] = Math.max(0, Math.min(1, hgt));
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    albedo: c,
    height,
    roughness: roughnessFromHeight(height, S, 0.35, 0.72), // metal: shinier overall
    normal: normalFromHeightLocal(height, S, 2.4),
  };
}

// ---------------------------------------------------------------------------
// TILE FLOOR — glazed ceramic with grout, lippage, crazing and scuffing.
export function tileSurface(rng, base = [122, 126, 118]) {
  const seed = Math.floor(rng() * 1e9);
  const craz = fbm(S, seed, { octaves: 3, base: 40, gain: 0.55 });
  const grime = fbm(S, seed ^ 0x1234, { octaves: 4, base: 5, gain: 0.6 });
  const height = new Float32Array(S * S);
  const [c, ctx] = makeCanvas(S);
  const img = ctx.createImageData(S, S);
  const n = 4, ts = S / n;

  const tileTint = [];
  for (let i = 0; i < n * n; i++) tileTint.push(shade(base, (rng() - 0.5) * 24));

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const ti = ((y / ts) | 0) * n + ((x / ts) | 0);
      let col = tileTint[ti].slice();
      const lx = x % ts, ly = y % ts;
      let hgt = 0.72 + craz[i] * 0.04;

      // grout channel (4 px) with a shadowed shoulder
      if (lx < 5 || ly < 5) { col = lerp3(col, [74, 72, 66], 0.8); hgt = 0.24; }
      else if (lx < 9 || ly < 9) { col = lerp3(col, shade(col, -18), 0.4); hgt = 0.55; }

      // crazing: fine hairline cracks in the glaze
      if (craz[i] > 0.72) col = lerp3(col, shade(col, -40), 0.35);

      // grime pooling in the grout
      col = lerp3(col, [48, 46, 40], (grime[i] - 0.55) * 0.6);

      const o = i * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      height[i] = Math.max(0, Math.min(1, hgt));
    }
  }
  ctx.putImageData(img, 0, 0);
  stains(ctx, S, rng, 8, 0.22, 0.3);

  return {
    albedo: c,
    height,
    roughness: roughnessFromHeight(height, S, 0.18, 0.6), // glaze: fairly glossy
    normal: normalFromHeightLocal(height, S, 3.0),
  };
}

// local alias so the recipes above read cleanly
function normalFromHeightLocal(h, s, strength) { return normalMapFromHeight(h, s, strength); }

// ---------------------------------------------------------------------------
// WOOD DOOR — vertical grain, raised panel moulding, brass-worn edges.
export function woodSurface(rng, base = [94, 66, 40]) {
  const seed = Math.floor(rng() * 1e9);
  const grain = fbm(S, seed, { octaves: 3, base: 90, gain: 0.5 });
  const [c, ctx] = makeCanvas(S);
  const img = ctx.createImageData(S, S);
  const height = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let col = base.slice();
      let hgt = 0.5;
      // stretched vertical grain
      const g = grain[(y * S + ((x * 7) % S))];
      col = lerp3(col, shade(base, 22), (g - 0.5) * 0.7);
      hgt += (g - 0.5) * 0.12;

      // raised panel moulding: a bevel inside the border
      const px = x / S, py = y / S;
      const inPanel = px > 0.18 && px < 0.82 && py > 0.12 && py < 0.44;
      const inPanel2 = px > 0.18 && px < 0.82 && py > 0.55 && py < 0.88;
      const edge = (v0, v1, a, b) => Math.min(Math.abs(a - v0), Math.abs(a - v1));
      if (inPanel || inPanel2) { col = lerp3(col, shade(base, 8), 0.3); hgt += 0.22; }
      const bevel = Math.min(
        edge(0.18, 0.82, px, 0), edge(0.12, 0.44, py, 0), edge(0.55, 0.88, py, 0));
      if (bevel < 0.012) { col = lerp3(col, shade(base, -30), 0.5); hgt -= 0.1; }

      const o = i * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      height[i] = Math.max(0, Math.min(1, hgt));
    }
  }
  ctx.putImageData(img, 0, 0);
  stains(ctx, S, rng, 5, 0.26, 0.3);

  return {
    albedo: c,
    height,
    roughness: roughnessFromHeight(height, S, 0.6, 0.9),
    normal: normalFromHeightLocal(height, S, 2.4),
  };
}

// ---------------------------------------------------------------------------
// FLUORESCENT FIXTURE — the luminaire housing, diffuser and tube, drawn to be
// used on the emissive panel mesh (self-lit, so it needs its own colour map).
export function fixtureSurface(rng, base = [255, 250, 226]) {
  // accept either an [r,g,b] array or a 0xRRGGBB number
  if (typeof base === 'number') base = [(base >> 16) & 255, (base >> 8) & 255, base & 255];
  const seed = Math.floor(rng() * 1e9);
  const diff = fbm(S, seed, { octaves: 3, base: 24, gain: 0.5 });
  const [c, ctx] = makeCanvas(S);
  const img = ctx.createImageData(S, S);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let col = base.slice();
      // prismatic diffuser facets
      const f = ((x % 24) < 12) ? 0 : 1;
      col = lerp3(col, shade(base, f ? -18 : 6), 0.35);
      // a few dead/blackened segments (worn tube)
      const dead = diff[i] > 0.82;
      if (dead) col = lerp3(col, [40, 38, 34], 0.7);
      col = lerp3(col, shade(base, 10), (diff[i] - 0.5) * 0.3);
      const o = i * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
      height[i] = dead ? 0.4 : 0.7;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { albedo: c, height, normal: normalFromHeightLocal(height, S, 1.4) };
}

// ------------------------------------------------- legacy named exports -----
// Kept so materials.js keeps a stable surface API. Each returns a canvas (as
// before) — materials.js builds the matched maps via the *Surface variants.

export function wallpaper(rng, base = [181, 160, 92], stripes = true) {
  return wallpaperSurface(rng, base, { stripesOn: stripes }).albedo;
}
export function carpet(rng, base = [126, 116, 82], pattern = 0) {
  return carpetSurface(rng, base, pattern).albedo;
}
export function ceilingTile(rng, base = [186, 181, 166]) {
  return ceilingTileSurface(rng, base).albedo;
}
export function concrete(rng, base = [116, 114, 108]) {
  return concreteSurface(rng, base).albedo;
}
export function metalPanel(rng, base = [84, 88, 94]) {
  return metalSurface(rng, base).albedo;
}
export function tileFloor(rng, base = [122, 126, 118]) {
  return tileSurface(rng, base).albedo;
}
export function woodDoor(rng, base = [94, 66, 40]) {
  return woodSurface(rng, base).albedo;
}
export function paperNote(rng) {
  const s = 256;
  const [c, ctx] = makeCanvas(s);
  ctx.fillStyle = '#c9bd97';
  ctx.fillRect(0, 0, s, s);
  stains(ctx, s, rng, 4, 0.18, 0.4);
  return c;
}

// Generic normal map for props/doors where there is no matched height field.
export function makeNormalPair(rng, scale = 5, strength = 1.6, s = 256) {
  const h = fbm(s, Math.floor(rng() * 1e9), { octaves: 4, base: scale * 4, gain: 0.55 });
  return toTexture(normalMapFromHeight(h, s, strength), false);
}
