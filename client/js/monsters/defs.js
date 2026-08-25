// Monster definitions: appearance builders + behavior parameters.
// Every creature is built procedurally with deliberately WRONG anatomy —
// asymmetric limbs, stretched proportions, misplaced features. No bright
// colors, no cartoon shapes. They belong in the Backrooms.
import * as THREE from 'three';

export const MONSTER_TYPES = {
  watcher: {
    name: 'THE WATCHER', speed: 1.1, aggroRange: 0, despawnLookAt: 2.4,
    despawnDist: 70, voice: 'watcher', rarity: 0.4, privateOnly: false,
    keepDist: [16, 32], vision: 0, hearing: 0,
    attackRange: 0, lethal: false, moveWhenUnseen: true,
  },
  stalker: {
    name: 'THE STALKER', speed: 1.6, aggroRange: 30, despawnLookAt: 6,
    despawnDist: 80, voice: 'stalker', rarity: 0.28, privateOnly: false,
    keepDist: [8, 16], vision: 30, hearing: 12,
    attackRange: 0, lethal: false, retreatWhenSeen: true,
  },
  hunter: {
    name: 'THE HUNTER', speed: 4.4, aggroRange: 26, despawnLookAt: 0,
    despawnDist: 110, voice: 'hunter', rarity: 0.1, privateOnly: false,
    keepDist: [0, 0], vision: 34, hearing: 22,
    attackRange: 1.0, lethal: true, chaseGiveUp: 26,
  },
  ambusher: {
    name: 'THE AMBUSHER', speed: 5.2, aggroRange: 7.5, despawnLookAt: 0,
    despawnDist: 60, voice: 'ambusher', rarity: 0.09, privateOnly: false,
    keepDist: [0, 0], vision: 10, hearing: 6,
    attackRange: 1.0, lethal: true, chaseGiveUp: 18, prefersDark: true,
  },
  mimic: {
    name: 'THE MIMIC', speed: 2.8, aggroRange: 4.2, despawnLookAt: 10,
    despawnDist: 50, voice: 'mimic', rarity: 0.08, privateOnly: false,
    keepDist: [0, 0], vision: 8, hearing: 5,
    attackRange: 0.9, lethal: true, chaseGiveUp: 14,
  },
  shadow: {
    name: 'THE SHADOW', speed: 0, aggroRange: 0, despawnLookAt: 1.2,
    despawnDist: 55, voice: 'shadow', rarity: 0.35, privateOnly: true,
    keepDist: [12, 26], vision: 0, hearing: 0, attackRange: 0, lethal: false,
  },
};

// ---------------------------------------------------------------------------
// shared materials — skin like wet pale leather, flesh darker, void-black fur
const skinM = () => new THREE.MeshStandardMaterial({ color: 0xcfc3b2, roughness: 0.55, metalness: 0.05 });
const skinSicklyM = () => new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.7 });
const darkFleshM = () => new THREE.MeshStandardMaterial({ color: 0x4a3f38, roughness: 0.85 });
const voidM = () => new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 1 });
const mouthM = () => new THREE.MeshStandardMaterial({ color: 0x0c0508, roughness: 0.4 });
const eyeGlowM = () => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xd8d2c2, emissiveIntensity: 0.55 });

function seg(g, w, h, d, mat) {
  // limb segment hanging DOWN from its group origin
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = -h / 2;
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}

function head(g, sx, sy, sz, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}

// ---------------------------------------------------------------------------
export function buildMonster(type) {
  const g = new THREE.Group();
  const u = g.userData;
  u.limbs = [];

  switch (type) {
    case 'watcher': {
      // 3.4m emaciated figure. Ribbed chest, arms to the floor, head tilted,
      // two faint eyes. Stands impossibly still.
      const skin = skinSicklyM();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.25, 0.24), darkFleshM());
      body.position.y = 2.05;
      for (let i = 0; i < 4; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.045, 0.28), skin);
        rib.position.y = 2.35 - i * 0.17;
        g.add(rib);
      }
      const hd = head(g, 0.26, 0.42, 0.26, skin);
      hd.position.set(0.03, 2.85, 0.05);
      hd.rotation.z = 0.18; hd.rotation.x = 0.12;
      const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.06, 0.02), eyeGlowM());
      e1.position.set(-0.06, 0.03, 0.135);
      const e2 = e1.clone(); e2.position.set(0.075, -0.02, 0.135);
      hd.add(e1, e2);
      for (const s of [-1, 1]) {
        const arm = seg(g, 0.09, 1.55, 0.09, skin);
        arm.position.set(0.26 * s + (s > 0 ? 0.03 : 0), 2.6, 0);
        arm.rotation.z = s * 0.07;
        const leg = seg(g, 0.11, 1.45, 0.11, darkFleshM());
        leg.position.set(0.12 * s, 1.45, 0);
        if (s > 0) leg.scale.setScalar(1.12); // asymmetric legs
        g.add(arm, leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      u.head = hd;
      g.add(body, hd);
      break;
    }
    case 'stalker': {
      // hunched quadruped with arms longer than its body, knuckle-walking
      const skin = darkFleshM();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 1.1), skin);
      body.position.set(0, 0.85, -0.1);
      body.rotation.x = -0.25;
      const hd = head(g, 0.28, 0.24, 0.36, skinSicklyM());
      hd.position.set(0, 1.0, 0.55);
      hd.rotation.x = 0.4;
      const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), eyeGlowM());
      e1.position.set(-0.07, 0.04, 0.19);
      const e2 = e1.clone(); e2.position.x = 0.07;
      hd.add(e1, e2);
      for (const s of [-1, 1]) {
        const arm = seg(g, 0.1, 1.1, 0.1, skin);
        arm.position.set(0.3 * s, 1.0, 0.4);
        arm.rotation.x = 0.55;
        const leg = seg(g, 0.13, 0.75, 0.13, skin);
        leg.position.set(0.24 * s, 0.72, -0.45);
        g.add(arm, leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      u.head = hd;
      g.add(body, hd);
      break;
    }
    case 'hunter': {
      // 2.7m wrong-proportioned runner. Torso too small, legs too long,
      // jaw hangs open, one arm longer than the other.
      const skin = skinM();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.75, 0.24), darkFleshM());
      body.position.y = 1.95;
      const hd = head(g, 0.24, 0.34, 0.26, skin);
      hd.position.set(0, 2.55, 0.02);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.2), mouthM());
      jaw.position.set(0, -0.2, 0.06);
      jaw.rotation.x = 0.5;
      hd.add(jaw);
      const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), eyeGlowM());
      e1.position.set(-0.06, 0.06, 0.135);
      const e2 = e1.clone(); e2.position.set(0.07, 0.02, 0.135);
      hd.add(e1, e2);
      for (const s of [-1, 1]) {
        const arm = seg(g, 0.08, s > 0 ? 1.35 : 1.0, 0.08, skin);
        arm.position.set(0.24 * s, 2.25, 0);
        const leg = seg(g, 0.1, 1.6, 0.1, darkFleshM());
        leg.position.set(0.12 * s, 1.58, 0);
        g.add(arm, leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      u.head = hd; u.jaw = jaw;
      g.add(body, hd);
      break;
    }
    case 'ambusher': {
      // crouched mass in the dark — limbs folded wrong, head sunk into
      // shoulders. When it lunges it unfolds upward.
      const skin = voidM();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), skin);
      body.position.y = 0.4;
      const hd = head(g, 0.3, 0.26, 0.3, skin);
      hd.position.set(0, 0.68, 0.28);
      const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), eyeGlowM());
      e1.position.set(-0.08, 0.02, 0.16);
      const e2 = e1.clone(); e2.position.set(0.06, -0.03, 0.16);
      hd.add(e1, e2);
      for (const s of [-1, 1]) {
        const arm = seg(g, 0.09, 0.9, 0.09, skin);
        arm.position.set(0.36 * s, 0.65, 0.15);
        arm.rotation.x = -0.9; arm.rotation.z = s * 0.3; // folded
        const leg = seg(g, 0.12, 0.5, 0.12, skin);
        leg.position.set(0.26 * s, 0.5, -0.2);
        leg.rotation.x = 0.8;
        g.add(arm, leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      u.head = hd;
      g.add(body, hd);
      break;
    }
    case 'mimic': {
      // dormant: an ordinary office chair. revealed: it unfolds — seat rises
      // on spider legs, the backrest opens into a vertical mouth.
      const chairMat = new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.9 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.5), chairMat);
      seat.position.y = 0.46;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.06), chairMat);
      back.position.set(0, 0.74, -0.23);
      const legs = new THREE.Group();
      for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.05), chairMat);
        l.position.set(dx, 0.23, dz);
        legs.add(l);
      }
      g.add(seat, back, legs);
      u.dormantParts = [seat, back, legs];
      u.revealed = false;
      u.reveal = () => {
        if (u.revealed) return;
        u.revealed = true;
        const flesh = darkFleshM();
        seat.material = flesh; back.material = flesh;
        back.rotation.x = -0.9; // opens like a jaw
        seat.position.y = 0.95;
        back.position.set(0, 1.35, -0.35);
        // teeth inside the backrest-mouth
        for (let i = 0; i < 5; i++) {
          const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.03), skinM());
          t.position.set(-0.16 + i * 0.08, 0, 0.05);
          back.add(t);
        }
        const inner = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.03), mouthM());
        inner.position.set(0, 0, 0.035);
        back.add(inner);
        // long jointed legs replace the stubby ones
        g.remove(legs);
        for (const s of [-1, 1]) {
          const legA = seg(g, 0.07, 0.9, 0.07, flesh);
          legA.position.set(0.3 * s, 0.95, 0.15);
          legA.rotation.z = s * 0.5;
          const legB = seg(g, 0.07, 0.9, 0.07, flesh);
          legB.position.set(0.3 * s, 0.95, -0.2);
          legB.rotation.z = s * 0.5;
          g.add(legA, legB);
          u.limbs.push({ g: legA, kind: 'leg', side: s }, { g: legB, kind: 'leg', side: -s });
        }
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), eyeGlowM());
        e.position.set(0, 1.15, 0.26);
        g.add(e);
      };
      break;
    }
    case 'shadow': {
      // matte void-black humanoid, wrong head, slightly too tall
      const mat = new THREE.MeshBasicMaterial({ color: 0x030307 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.9, 0.26), mat);
      body.position.y = 1.05;
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.22), mat);
      hd.position.y = 2.15;
      hd.rotation.z = 0.1;
      g.add(body, hd);
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; } });
  return g;
}
