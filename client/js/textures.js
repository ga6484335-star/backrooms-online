// Procedural texture factory — everything is generated, no external assets.
// All textures are deliberately dirty, stained and worn.
import * as THREE from 'three';

function makeCanvas(s) {
  const c = document.createElement('canvas');
  c.width = c.height = s;
  return [c, c.getContext('2d')];
}

// simple deterministic value noise grid (visual only — determinism here is cosmetic)
function valueNoise(ctx, s, rng, octaves = 4, alpha = 0.12) {
  for (let o = 0; o < octaves; o++) {
    const grid = 4 << o;
    const cell = s / grid;
    for (let gx = 0; gx < grid; gx++) {
      for (let gz = 0; gz < grid; gz++) {
        const v = rng();
        ctx.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${alpha * (0.4 + v * 0.6)})`;
        ctx.fillRect(gx * cell, gz * cell, cell + 1, cell + 1);
      }
    }
  }
}

function stains(ctx, s, rng, count, darkness = 0.28, maxR = 0.4) {
  for (let i = 0; i < count; i++) {
    const x = rng() * s, y = rng() * s, r = (0.06 + rng() * maxR) * s;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const d = (0.1 + rng() * darkness) * (rng() < 0.3 ? 1.6 : 1);
    g.addColorStop(0, `rgba(20,16,8,${d})`);
    g.addColorStop(1, 'rgba(20,16,8,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rng()), rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

// downward streaks — water damage on walls
function streaks(ctx, s, rng, count, darkness = 0.2) {
  for (let i = 0; i < count; i++) {
    const x = rng() * s, w = 1 + rng() * 4, len = s * (0.2 + rng() * 0.7);
    const y0 = 0;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, `rgba(30,24,14,${darkness + rng() * 0.2})`);
    g.addColorStop(1, 'rgba(30,24,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y0, w, len);
  }
}

export function toTexture(canvas, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

// normal map from a procedural heightfield
function normalFromHeight(heightFn, s, strength = 2.0) {
  const [c, ctx] = makeCanvas(s);
  const img = ctx.createImageData(s, s);
  const h = (x, y) => heightFn((x + s) % s, (y + s) % s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
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

function noiseHeightFactory(rng, scale = 6) {
  const grid = new Float32Array((scale + 1) * (scale + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  return (x, y, s) => {
    const gx = (x / s) * scale, gy = (y / s) * scale;
    const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
    const b00 = grid[y0 * (scale + 1) + x0], b10 = grid[y0 * (scale + 1) + x0 + 1];
    const b01 = grid[(y0 + 1) * (scale + 1) + x0], b11 = grid[(y0 + 1) * (scale + 1) + x0 + 1];
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return b00 * (1 - u) * (1 - v) + b10 * u * (1 - v) + b01 * (1 - u) * v + b11 * u * v;
  };
}

// ---------- texture recipes ----------

export function wallpaper(rng, base = [178, 158, 92], stripes = true) {
  const s = 256;
  const [c, ctx] = makeCanvas(s);
  ctx.fillStyle = rgb(base, 1);
  ctx.fillRect(0, 0, s, s);
  if (stripes) {
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = rgb(shade(base, -14 + rng() * 6), 0.5);
      ctx.fillRect(x, 0, 7, s);
    }
  }
  valueNoise(ctx, s, rng, 4, 0.08);
  streaks(ctx, s, rng, window.__texStreaks === false ? 0 : 10, 0.16);
  stains(ctx, s, rng, 9, 0.22, 0.35);
  return c;
}

export function carpet(rng, base = [126, 116, 82], pattern = 0) {
  const s = 256;
  const [c, ctx] = makeCanvas(s);
  ctx.fillStyle = rgb(base, 1);
  ctx.fillRect(0, 0, s, s);
  // weave lines
  ctx.globalAlpha = 0.08;
  for (let y = 0; y < s; y += 3) {
    ctx.fillStyle = y % 6 ? '#000' : '#fff';
    ctx.fillRect(0, y, s, 1);
  }
  ctx.globalAlpha = 1;
  if (pattern === 1) { // hotel diamond motif
    ctx.strokeStyle = rgb(shade(base, 40), 0.35); ctx.lineWidth = 2;
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + s, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + s, 0); ctx.lineTo(i, s); ctx.stroke();
    }
  }
  if (pattern === 2) { // office tiles seam
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  }
  valueNoise(ctx, s, rng, 5, 0.1);
  stains(ctx, s, rng, 12, 0.3, 0.45);
  return c;
}

export function ceilingTile(rng, base = [186, 181, 166]) {
  const s = 256;
  const [c, ctx] = makeCanvas(s);
  ctx.fillStyle = rgb(base, 1);
  ctx.fillRect(0, 0, s, s);
  // pin holes typical of acoustic tiles
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(40,36,28,${0.1 + rng() * 0.2})`;
    ctx.fillRect(rng() * s, rng() * s, 1.6, 1.6);
  }
  valueNoise(ctx, s, rng, 3, 0.06);
  stains(ctx, s, rng, 5, 0.3, 0.5);
  // grid groove (tile border)
  ctx.strokeStyle = 'rgba(60,55,45,0.8)'; ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
  ctx.strokeRect(4, 4, s - 8, s - 8);
  return c;
}

export function concrete(rng, base = [116, 114, 108]) {
  const s = 256;
  const [c, ctx] = makeCanvas(s);
  ctx.fillStyle = rgb(base, 1);
  ctx.fillRect(0, 0, s, s);
  valueNoise(ctx, s, rng, 5, 0.1);
  streaks(ctx, s, rng, 6, 0.14);
  stains(ctx, s, rng, 8, 0.2, 0.4);
  // form board lines
  ctx.globalAlpha = 0.12;
  for (let y = 0; y < s; y += 42) { ctx.fillStyle = '#000'; ctx.fillRect(0, y, s, 2); }
  ctx.globalAlpha = 1;
  return c;
}

export function metalPanel(rng, base = [84, 88, 94]) {
  const s = 256;
  const [c, ctx] = makeCanvas(s);
  ctx.fillStyle = rgb(base, 1);
  ctx.fillRect(0, 0, s, s);
  // vertical panel ribs
  for (let x = 0; x < s; x += 32) {
    const g = ctx.createLinearGradient(x, 0, x + 32, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 32, s);
  }
  // rust
  for (let i = 0; i < 10; i++) {
    const x = rng() * s, y = rng() * s, r = 10 + rng() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(96,52,24,${0.15 + rng() * 0.25})`);
    g.addColorStop(1, 'rgba(96,52,24,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  valueNoise(ctx, s, rng, 4, 0.07);
  return c;
}

export function tileFloor(rng, base = [122, 126, 118]) {
  const s = 256;
  const [c, ctx] = makeCanvas(s);
  // large tiles with grout
  const n = 4, ts = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = rgb(shade(base, (rng() - 0.5) * 22), 1);
    ctx.fillRect(i * ts + 2, j * ts + 2, ts - 4, ts - 4);
  }
  ctx.strokeStyle = 'rgba(30,30,28,0.9)'; ctx.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * ts, 0); ctx.lineTo(i * ts, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * ts); ctx.lineTo(s, i * ts); ctx.stroke();
  }
  stains(ctx, s, rng, 6, 0.2, 0.3);
  return c;
}

export function woodDoor(rng, base = [94, 66, 40]) {
  const s = 128;
  const [c, ctx] = makeCanvas(s);
  ctx.fillStyle = rgb(base, 1);
  ctx.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.07})`;
    ctx.fillRect(0, y, s, 1);
  }
  // panel moulding
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
  ctx.strokeRect(s * 0.18, s * 0.12, s * 0.64, s * 0.32);
  ctx.strokeRect(s * 0.18, s * 0.55, s * 0.64, s * 0.32);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  ctx.strokeRect(s * 0.18 + 3, s * 0.12 + 3, s * 0.64 - 6, s * 0.32 - 6);
  stains(ctx, s, rng, 4, 0.25, 0.3);
  return c;
}

export function paperNote(rng) {
  const s = 128;
  const [c, ctx] = makeCanvas(s);
  ctx.fillStyle = '#c9bd97';
  ctx.fillRect(0, 0, s, s);
  stains(ctx, s, rng, 3, 0.18, 0.4);
  return c;
}

export function makeNormalPair(rng, scale = 5, strength = 1.6, s = 128) {
  const nh = noiseHeightFactory(rng, scale);
  const canvas = normalFromHeight((x, y) => nh(x, y, s), s, strength);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rgb(c, a = 1) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function shade(c, d) {
  return [clamp8(c[0] + d), clamp8(c[1] + d), clamp8(c[2] + d)];
}
function clamp8(v) { return Math.max(0, Math.min(255, v)); }
