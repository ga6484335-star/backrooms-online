// Procedural prop library. Every prop is a small set of colored boxes merged
// into chunk geometry (single 'prop' material, vertex colors). Big props also
// register circle colliders.
import * as THREE from 'three';
import { chance, range, pick, intRange } from './rng.js';

// Each builder pushes boxes into a GeoBuilder via g.box(w,h,d, x,y,z, color, ry?)
export const PROP_BUILDERS = {
  chair(g, rng) {
    const c = pickColor(rng, [[60, 62, 66], [88, 70, 52], [52, 58, 72]]);
    g.box(0.5, 0.06, 0.5, 0, 0.46, 0, c);
    g.box(0.5, 0.5, 0.06, 0, 0.74, -0.23, c);
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      g.box(0.05, 0.46, 0.05, dx, 0.23, dz, c);
    }
    g.col(0.3);
  },
  desk(g, rng) {
    const c = [96, 84, 66];
    g.box(1.4, 0.06, 0.8, 0, 0.76, 0, c);
    g.box(0.06, 0.76, 0.74, -0.66, 0.38, 0, c);
    g.box(0.06, 0.76, 0.74, 0.66, 0.38, 0, c);
    if (chance(rng, 0.6)) g.box(0.4, 0.3, 0.12, -0.2, 0.93, 0.2, [40, 42, 46]);
    g.col(0.75);
  },
  cabinet(g, rng) {
    const c = pickColor(rng, [[80, 82, 86], [70, 76, 72], [92, 88, 78]]);
    g.box(0.5, 1.3, 0.4, 0, 0.65, 0, c);
    g.box(0.46, 0.02, 0.36, 0, 0.44, 0, shade(c, -20));
    g.col(0.35);
  },
  papers(g, rng) {
    const c = [188, 182, 168];
    const n = 1 + intRange(rng, 0, 3);
    for (let i = 0; i < n; i++) {
      g.box(0.28, 0.005, 0.4, (rng() - 0.5) * 0.8, 0.003, (rng() - 0.5) * 0.8, shade(c, -rng() * 30), rng() * 3);
    }
  },
  plantpot(g, rng) {
    const pot = [110, 74, 54], leaf = [52, 88, 44];
    g.box(0.35, 0.32, 0.35, 0, 0.16, 0, pot);
    g.box(0.4, 0.3, 0.4, 0, 0.47, 0, shade(leaf, -rng() * 20));
    g.box(0.25, 0.25, 0.25, 0, 0.75, 0, shade(leaf, 10));
    g.col(0.28);
  },
  pipe(g, rng) {
    const c = [86, 88, 92];
    const d = 0.12 + rng() * 0.2;
    g.cylinder(d, 4, 0, 0, 0, c);
  },
  barrel(g, rng) {
    const c = pickColor(rng, [[86, 90, 96], [96, 60, 44], [52, 64, 78]]);
    g.box(0.6, 1.1, 0.6, 0, 0.55, 0, c);
    g.box(0.64, 0.06, 0.64, 0, 0.9, 0, shade(c, -18));
    g.box(0.64, 0.06, 0.64, 0, 0.4, 0, shade(c, -18));
    g.col(0.36);
  },
  crate(g, rng) {
    const c = [104, 86, 58];
    const s = 0.5 + rng() * 0.5;
    g.box(s, s, s, 0, s / 2, 0, shade(c, -rng() * 20));
    g.col(s * 0.55);
  },
  locker(g, rng) {
    const c = [70, 76, 84];
    g.box(0.7, 1.8, 0.45, 0, 0.9, 0, c);
    g.box(0.06, 1.7, 0.42, -0.34, 0.9, 0.01, shade(c, -25));
    g.col(0.45);
  },
  valve(g, rng) {
    const c = [120, 60, 50];
    g.box(0.15, 0.5, 0.15, 0, 1.2, 0, [80, 84, 90]);
    g.box(0.4, 0.08, 0.4, 0, 1.5, 0, c, rng());
  },
  cubicle(g, rng) {
    const c = [88, 86, 92];
    g.box(1.6, 1.4, 0.08, 0, 0.7, -0.8, c);
    g.box(0.08, 1.4, 1.6, -0.8, 0.7, 0, c);
    g.box(1.4, 0.05, 0.6, 0, 0.75, -0.3, [110, 102, 90]);
    g.col(1.0);
  },
  watercooler(g, rng) {
    g.box(0.35, 1.0, 0.35, 0, 0.5, 0, [200, 200, 205]);
    g.box(0.3, 0.4, 0.3, 0, 1.2, 0, [140, 160, 190]);
    g.col(0.28);
  },
  dresser(g, rng) {
    const c = [92, 66, 44];
    g.box(1.2, 0.8, 0.5, 0, 0.4, 0, c);
    g.box(1.1, 0.04, 0.46, 0, 0.6, 0.03, shade(c, -22));
    g.col(0.75);
  },
  cart(g, rng) {
    const c = [120, 122, 126];
    g.box(0.9, 0.08, 0.6, 0, 0.7, 0, c);
    g.box(0.9, 0.08, 0.6, 0, 0.35, 0, c);
    for (const [dx, dz] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) {
      g.box(0.05, 0.7, 0.05, dx, 0.35, dz, c);
    }
    g.box(0.2, 0.2, 0.2, 0.2, 0.82, 0, pickColor(rng, [[150, 148, 140], [90, 96, 120]]));
    g.col(0.55);
  },
  lamp(g, rng) {
    const c = [60, 60, 64];
    g.box(0.25, 0.05, 0.25, 0, 0.03, 0, c);
    g.box(0.04, 1.4, 0.04, 0, 0.7, 0, c);
    g.box(0.3, 0.25, 0.3, 0, 1.5, 0, [212, 196, 150]);
    g.col(0.22);
  },
  debris(g, rng) {
    const c = [80, 80, 84];
    const n = 1 + intRange(rng, 1, 4);
    for (let i = 0; i < n; i++) {
      const s = 0.1 + rng() * 0.3;
      g.box(s, s * 0.6, s, (rng() - 0.5) * 1.5, s * 0.3, (rng() - 0.5) * 1.5, shade(c, -rng() * 30), rng() * 3);
    }
  },
  mannequin(g, rng) {
    const c = [196, 190, 178];
    g.box(0.3, 0.25, 0.2, 0, 1.55, 0, c);             // head
    g.box(0.42, 0.7, 0.26, 0, 1.05, 0, c);            // torso
    g.box(0.14, 0.62, 0.16, -0.1, 0.42, 0, c);        // legs
    g.box(0.14, 0.62, 0.16, 0.1, 0.42, 0, c);
    g.box(0.08, 0.55, 0.1, -0.28, 1.05, 0, c);        // arms
    g.box(0.08, 0.55, 0.1, 0.28, 1.05, 0, c);
    g.col(0.32);
  },
  // ---- new props for variety + landmarks ----
  monitorstack(g, rng) {
    const c = [48, 50, 54];
    g.box(0.55, 0.45, 0.5, 0, 0.23, 0, c, rng() * 0.5);
    g.box(0.42, 0.34, 0.06, 0, 0.25, 0.26, [30, 34, 30]); // dark screen
    if (chance(rng, 0.7)) g.box(0.5, 0.42, 0.45, 0.08, 0.66, -0.04, shade(c, rng() * 16 - 8), rng() * 0.6);
    if (chance(rng, 0.4)) g.box(0.45, 0.4, 0.42, -0.05, 1.06, 0.03, shade(c, -14), rng() * 0.4);
    g.col(0.4);
  },
  shelf(g, rng) {
    const c = pickColor(rng, [[86, 72, 54], [70, 74, 80], [96, 88, 74]]);
    g.box(1.6, 2.0, 0.35, 0, 1.0, 0, c);
    for (let i = 0; i < 4; i++) {
      g.box(1.5, 0.04, 0.3, 0, 0.35 + i * 0.45, 0.02, shade(c, -18));
      const n = intRange(rng, 1, 4);
      for (let b = 0; b < n; b++) {
        g.box(0.09, 0.28 + rng() * 0.1, 0.2, -0.65 + rng() * 1.3, 0.38 + i * 0.45, 0.02,
          pickColor(rng, [[120, 60, 50], [60, 80, 100], [110, 100, 70], [70, 90, 70]]));
      }
    }
    g.col(0.85);
  },
  sofa(g, rng) {
    const c = pickColor(rng, [[92, 60, 48], [60, 74, 66], [86, 72, 58]]);
    g.box(1.7, 0.4, 0.7, 0, 0.2, 0, c);
    g.box(1.7, 0.55, 0.2, 0, 0.4, -0.28, shade(c, -12));
    g.box(0.2, 0.3, 0.7, -0.78, 0.5, 0, shade(c, -8));
    g.box(0.2, 0.3, 0.7, 0.78, 0.5, 0, shade(c, -8));
    g.col(0.95);
  },
  wallclock(g, rng) {
    g.box(0.5, 0.5, 0.08, 0, 2.0, 0, [60, 52, 44]);
    g.box(0.4, 0.4, 0.02, 0, 2.0, 0.05, [212, 208, 196]);
  },
  cabletray(g, rng) {
    const c = [66, 68, 72];
    g.box(0.4, 0.08, 3.6, 0, 2.1, 0, c);
    for (let i = 0; i < 4; i++) {
      g.box(0.05, 0.05, 3.6, -0.14 + i * 0.09, 2.16, 0, shade(c, 14 + rng() * 20));
    }
  },
  wires(g, rng) {
    for (let i = 0; i < 3; i++) {
      const x = (rng() - 0.5) * 1.5, z = (rng() - 0.5) * 1.5;
      g.box(0.04, 0.5 + rng() * 0.9, 0.04, x, 2.2 - (0.5 + rng() * 0.9), z,
        pickColor(rng, [[30, 30, 34], [60, 30, 28], [40, 44, 50]]));
    }
  },
  vending(g, rng) {
    const c = pickColor(rng, [[120, 40, 36], [40, 70, 90], [150, 148, 140]]);
    g.box(0.9, 1.9, 0.7, 0, 0.95, 0, c);
    g.box(0.6, 1.1, 0.04, -0.08, 1.15, 0.36, [20, 24, 26]);
    g.box(0.16, 0.5, 0.04, 0.3, 1.2, 0.36, shade(c, -30));
    g.col(0.55);
  },
  ventduct(g, rng) {
    const c = [88, 92, 96];
    const w = 0.9 + rng() * 0.7;
    g.box(w, w * 0.7, 3.8, 0, 2.0, 0, c, rng() * 3.14);
    g.box(w + 0.06, w * 0.7 + 0.06, 0.1, 0, 2.0, -1.6, shade(c, -16), rng() * 3.14);
  },
  tippedchair(g, rng) {
    const c = pickColor(rng, [[60, 62, 66], [88, 70, 52]]);
    g.box(0.5, 0.06, 0.5, 0, 0.25, 0, c, 0.3);
    g.box(0.5, 0.5, 0.06, 0.3, 0.3, -0.1, c, 0.3);
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      g.box(0.05, 0.4, 0.05, dx * 0.4, 0.12, dz * 1.6, c, 0.3);
    }
    g.col(0.4);
  },
  rubble(g, rng) {
    const c = [96, 92, 86];
    const n = 2 + intRange(rng, 1, 4);
    for (let i = 0; i < n; i++) {
      const s = 0.15 + rng() * 0.4;
      g.box(s, s * 0.5, s, (rng() - 0.5) * 1.8, s * 0.25, (rng() - 0.5) * 1.8, shade(c, -rng() * 40), rng() * 3);
    }
    g.col(0.5);
  },
  bigclock(g, rng) {
    // huge wall clock landmark
    g.box(2.2, 2.2, 0.15, 0, 2.2, 0, [50, 44, 38]);
    g.box(1.9, 1.9, 0.04, 0, 2.2, 0.08, [210, 204, 190]);
    g.box(0.06, 0.7, 0.03, 0, 2.45, 0.11, [30, 28, 26]);  // minute hand
    g.box(0.05, 0.45, 0.03, 0.12, 2.25, 0.11, [30, 28, 26], 0.6); // hour hand
    g.col(1.2);
  },
  statue(g, rng) {
    const c = [128, 126, 120];
    g.box(0.9, 0.25, 0.9, 0, 0.13, 0, shade(c, -30));   // plinth
    g.box(0.34, 0.5, 0.3, 0, 0.5, 0, c);                // legs merged
    g.box(0.46, 0.75, 0.3, 0, 1.12, 0, c);              // torso
    g.box(0.24, 0.3, 0.24, 0, 1.75, 0, shade(c, 8));    // head (slightly too small — wrong)
    g.box(0.1, 0.8, 0.12, -0.3, 1.05, 0, c);            // arms
    g.box(0.1, 0.8, 0.12, 0.3, 1.05, 0, c);
    g.col(0.6);
  },
  elevatorframe(g, rng) {
    const c = [96, 100, 106];
    // broken elevator: frame + half-open doors + dark shaft
    g.box(0.15, 2.5, 0.2, -0.75, 1.25, 0, c);
    g.box(0.15, 2.5, 0.2, 0.75, 1.25, 0, c);
    g.box(1.65, 0.3, 0.2, 0, 2.65, 0, shade(c, -10));
    g.box(0.55, 2.3, 0.08, -0.62, 1.15, 0.02, shade(c, -24)); // door leaf half open
    g.box(0.5, 2.3, 0.06, 0.62, 1.15, -0.3, [16, 16, 20]);    // dark shaft interior
    g.box(1.2, 2.3, 0.9, 0.1, 1.15, -0.75, [10, 10, 14]);     // shaft void
    g.col(0.9);
  },
  battery(g, rng) {
    g.box(0.09, 0.16, 0.09, 0, 0.08, 0, [60, 90, 60]);
    g.box(0.03, 0.03, 0.03, 0, 0.175, 0, [180, 180, 180]);
  },
};

function pickColor(rng, arr) { return arr[(rng() * arr.length) | 0]; }
function shade(c, d) { return [c[0] + d, c[1] + d, c[2] + d]; }

// Lightweight geometry builder used for props and chunk walls alike.
export class GeoBuilder {
  constructor() {
    this.pos = []; this.norm = []; this.uv = []; this.col = []; this.idx = [];
    this.lastCol = 0;
    this._vc = 0;
  }
  quad(pts, normal, color, uvs) {
    const b = this._vc;
    for (const p of pts) this.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i++) this.norm.push(normal[0], normal[1], normal[2]);
    const uv = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const u of uv) this.uv.push(u[0], u[1]);
    const cn = Array.isArray(color) ? [color[0] / 255, color[1] / 255, color[2] / 255] : [1, 1, 1];
    for (let i = 0; i < 4; i++) this.col.push(cn[0], cn[1], cn[2]);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this._vc += 4;
  }
  box(w, h, d, x, y, z, color = [255, 255, 255], ry = 0) {
    const hw = w / 2, hd = d / 2;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const rp = (px, py, pz) => [x + px * cos - pz * sin, y + py, z + px * sin + pz * cos];
    const rn = (nx, nz) => [nx * cos - nz * sin, 0, nx * sin + nz * cos];
    const c0 = [];
    for (const [dx, dy, dz] of [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-hw, h, -hd], [hw, h, -hd], [hw, h, hd], [-hw, h, hd]]) {
      c0.push(rp(dx, dy, dz));
    }
    const uBase = [[0, 0], [d > w ? d : w, 0], [d > w ? d : w, h], [0, h]];
    const F = [
      [0, 1, 2, 3, [0, -1, 0]], [4, 6, 5, 7, [0, 1, 0]],
      [3, 2, 6, 7, rn(0, 1)], [1, 0, 4, 5, rn(0, -1)],
      [0, 3, 7, 4, rn(-1, 0)], [2, 1, 5, 6, rn(1, 0)],
    ];
    for (const [a, b, c, d2, n] of F) {
      this.quad([c0[a], c0[b], c0[c], c0[d2]], n, color, uBase);
    }
  }
  cylinder(r, h, x, y, z, color) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const x0 = x + Math.cos(a0) * r, z0 = z + Math.sin(a0) * r;
      const x1 = x + Math.cos(a1) * r, z1 = z + Math.sin(a1) * r;
      const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);
      this.quad(
        [[x0, y, z0], [x1, y, z1], [x1, y + h, z1], [x0, y + h, z0]],
        [nx, 0, nz], color, [[0, 0], [1, 0], [1, h / 2], [0, h / 2]]);
    }
  }
  col(r) { this.lastCol = r; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.norm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

export { shade as shadeCol, pickColor };
