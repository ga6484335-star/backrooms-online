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
  runner: {
    // extremely rare burst-chaser: long warning scream, then a straight sprint
    name: 'THE RUNNER', speed: 7.2, aggroRange: 30, despawnLookAt: 0,
    despawnDist: 130, voice: 'runner', rarity: 0.05, privateOnly: false,
    keepDist: [0, 0], vision: 38, hearing: 26,
    attackRange: 1.1, lethal: true, chaseGiveUp: 34,
  },
  crawler: {
    // low, fast skitterer for narrow/maintenance areas; short lethal lunge
    name: 'THE CRAWLER', speed: 3.4, aggroRange: 14, despawnLookAt: 0,
    despawnDist: 70, voice: 'crawler', rarity: 0.12, privateOnly: false,
    keepDist: [0, 0], vision: 16, hearing: 18,
    attackRange: 0.85, lethal: true, chaseGiveUp: 20, lowProfile: true,
  },
  siren: {
    // psychological: stands far away emitting a lure-song; damages sanity,
    // never kills — but walking toward it leads into the dark
    name: 'THE SIREN', speed: 0.9, aggroRange: 0, despawnLookAt: 4,
    despawnDist: 90, voice: 'siren', rarity: 0.07, privateOnly: false,
    keepDist: [18, 30], vision: 0, hearing: 0, attackRange: 0, lethal: false,
    lures: true,
  },
  tallone: {
    // 4.4m silhouette at the far end of a corridor. Posture snaps to a new
    // pose whenever nobody is looking. Never attacks. Fear itself.
    name: 'THE TALL ONE', speed: 0.7, aggroRange: 0, despawnLookAt: 3.2,
    despawnDist: 340, voice: 'tallone', rarity: 0.05, privateOnly: false,
    keepDist: [26, 110], vision: 0, hearing: 0, attackRange: 0, lethal: false,
    farSpawn: true, flashReact: 'vanish', pack: 1,
  },
  hollow: {
    // pale thin congregation figure with an empty face-hole. Freezes under
    // the flashlight; lurches closer in the dark. Touching it = it was never
    // there, but your heart disagrees.
    name: 'THE HOLLOW', speed: 2.4, aggroRange: 6.5, despawnLookAt: 0,
    despawnDist: 75, voice: 'hollow', rarity: 0.12, privateOnly: false,
    keepDist: [0, 0], vision: 15, hearing: 9, attackRange: 1.2, lethal: false,
    scareKill: true, pack: 3, flashReact: 'freeze', lurch: true, prefersDark: true,
  },
  bonefiend: {
    // chalk-white wrong-jointed thing that hunts by sound. Moves in violent
    // discrete snaps. Shining a light on it is a mistake.
    name: 'THE BONE ONE', speed: 3.7, aggroRange: 22, despawnLookAt: 0,
    despawnDist: 95, voice: 'bonefiend', rarity: 0.08, privateOnly: false,
    keepDist: [0, 0], vision: 10, hearing: 26, attackRange: 1.0, lethal: true,
    chaseGiveUp: 24, flashReact: 'enrage', lurch: true, pack: 1,
  },
  walldweller: {
    // plaster-skinned, pressed flat into the wall. Nearly invisible while
    // still; peels off and attacks when brushed past. The flashlight reveals it.
    name: 'THE WALL DWELLER', speed: 2.7, aggroRange: 6.0, despawnLookAt: 0,
    despawnDist: 75, voice: 'walldweller', rarity: 0.1, privateOnly: false,
    keepDist: [0, 0], vision: 12, hearing: 14, attackRange: 1.0, lethal: true,
    chaseGiveUp: 16, flashReact: 'reveal', prefersDark: true, wallHug: true, pack: 1,
  },
  deepone: {
    // flooded levels only. A slick mass half under the waterline, only the
    // head and reaching arms above. Light makes it submerge; dark makes it fast.
    name: 'THE DEEP ONE', speed: 4.2, aggroRange: 13, despawnLookAt: 0,
    despawnDist: 85, voice: 'deepone', rarity: 0.14, privateOnly: false,
    keepDist: [0, 0], vision: 0, hearing: 22, attackRange: 1.1, lethal: true,
    chaseGiveUp: 20, flashReact: 'vanish', levelOnly: 3, submerged: true, pack: 2,
  },
  ceiling: {
    // hangs folded above your head. Tick tick tick. Stay underneath too long
    // and it drops. Light persuades it to relocate.
    name: 'THE CEILING THING', speed: 4.6, aggroRange: 3.4, despawnLookAt: 0,
    despawnDist: 75, voice: 'ceiling', rarity: 0.09, privateOnly: false,
    keepDist: [0, 0], vision: 0, hearing: 10, attackRange: 1.1, lethal: true,
    chaseGiveUp: 15, flashReact: 'avoid', ceilingHug: true, pack: 1,
  },
  falseplayer: {
    // the rarest thing in here. From far away it is one of your friends.
    // Up close the walk is wrong. Then it runs at you on too many joints.
    name: 'THE FALSE PLAYER', speed: 3.3, aggroRange: 9, despawnLookAt: 0,
    despawnDist: 170, voice: 'falseplayer', rarity: 0.02, privateOnly: false,
    keepDist: [0, 0], vision: 22, hearing: 14, attackRange: 1.0, lethal: true,
    chaseGiveUp: 28, farSpawn: true, flashReact: 'reveal', pack: 1,
  },
};

// ---------------------------------------------------------------------------
// shared materials — skin like wet pale leather, flesh darker, void-black fur
const skinM = () => new THREE.MeshStandardMaterial({ color: 0xcfc3b2, roughness: 0.55, metalness: 0.05 });
const skinSicklyM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.7 }));
const darkFleshM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x4a3f38, roughness: 0.85 }));
const voidM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 1 }));
const mouthM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x0c0508, roughness: 0.4 }));
const eyeGlowM = () => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xd8d2c2, emissiveIntensity: 0.55, fog: false });

// Creatures live in heavy fog and near-darkness; pure MeshStandard bodies read
// as nothing from a corridor away. A whisper of emissive keeps silhouettes
// readable without ever making them glow cartoon-bright.
function creatureMat(base) {
  base.emissive = base.color.clone().multiplyScalar(0.085);
  return base;
}

// stamp every mesh in a monster group so nothing is ever accidentally culled
// or left invisible when it should exist
export function finalizeMonsterMesh(g) {
  g.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      o.castShadow = false; // perf: shadows off (they live in the dark anyway)
      o.receiveShadow = false;
    }
  });
  return g;
}
const wetBlackM = () => new THREE.MeshStandardMaterial({ color: 0x0d0f0c, roughness: 0.22, metalness: 0.1 });
const boneM = () => new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.5, metalness: 0.02 });
const plasterM = () => new THREE.MeshStandardMaterial({ color: 0x8f8468, roughness: 0.92 });
const hollowSkinM = () => new THREE.MeshStandardMaterial({ color: 0xb9b0a2, roughness: 0.78 });

// long fingers: a fan of thin boxes drooping from a hand point
function fingers(g, x, y, z, n, len, mat, spread = 0.05) {
  const grp = new THREE.Group();
  grp.position.set(x, y, z);
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, len, 0.02), mat);
    f.position.set((i - (n - 1) / 2) * spread, -len / 2, 0);
    f.rotation.z = (i - (n - 1) / 2) * 0.12;
    f.rotation.x = 0.15 + (i % 2) * 0.2;
    grp.add(f);
  }
  g.add(grp);
  return grp;
}

// a two-segment limb with a knee/elbow group. Returns {upper, joint}
function limb2(r1, len1, r2, len2, mat, bend = 0) {
  const upper = limb(r1, len1, mat);
  const joint = new THREE.Group();
  joint.position.y = -len1;
  const lower = limb(r2, len2, mat);
  lower.rotation.x = bend;
  joint.add(lower);
  upper.add(joint);
  return { upper, joint, lower };
}

function seg(g, w, h, d, mat) {
  // limb segment hanging DOWN from its group origin
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = -h / 2;
  const grp = new THREE.Group();
  grp.add(m);
  return grp;
}

// organic cylinder limb, tapered, hanging DOWN from its group origin
function limb(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, len, 6), mat);
  m.position.y = -len / 2;
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
  u.detail = []; // small meshes hidden beyond LOD range

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
        // long dragging fingers, slightly different on each hand
        const hand = fingers(arm, 0, -1.55, 0, 5, 0.34 + (s > 0 ? 0.08 : 0), skin, 0.04);
        u.detail.push(...hand.children);
        const leg = seg(g, 0.11, 1.45, 0.11, darkFleshM());
        leg.position.set(0.12 * s, 1.45, 0);
        if (s > 0) leg.scale.setScalar(1.12); // asymmetric legs
        g.add(arm, leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      // vertebrae nubs down the back — only visible up close
      for (let i = 0; i < 5; i++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.04), skin);
        v.position.set(0, 1.6 + i * 0.24, -0.15);
        g.add(v);
        u.detail.push(v);
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
        const armLen = s > 0 ? 1.35 : 1.0;
        const arm = seg(g, 0.08, armLen, 0.08, skin);
        arm.position.set(0.24 * s, 2.25, 0);
        // clawed reaching fingers on the long arm
        const hand = fingers(arm, 0, -armLen, 0, 4, 0.26, skin, 0.045);
        u.detail.push(...hand.children);
        const leg = seg(g, 0.1, 1.6, 0.1, darkFleshM());
        leg.position.set(0.12 * s, 1.58, 0);
        g.add(arm, leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      // sunken chest: rib slats over a hollow torso
      for (let i = 0; i < 3; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.26), skin);
        rib.position.y = 2.1 - i * 0.14;
        g.add(rib);
        u.detail.push(rib);
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
    case 'runner': {
      // a sprinter built wrong: powerful hind legs, shrivelled arms folded
      // against the chest, head thrown permanently back mid-scream
      const hips = new THREE.Group(); hips.position.y = 1.05;
      const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), darkFleshM());
      pelvis.scale.set(1, 0.8, 1);
      hips.add(pelvis);
      for (const s of [-1, 1]) {
        const thigh = limb(0.13, 0.62, darkFleshM());
        thigh.position.set(s * 0.2, -0.1, 0);
        const knee = new THREE.Group(); knee.position.y = -0.62; thigh.add(knee);
        const shin = limb(0.1, 0.55, darkFleshM());
        shin.rotation.x = 0.7; knee.add(shin);
        hips.add(thigh);
        u.limbs.push({ g: thigh, kind: 'leg', side: s });
      }
      const torso = new THREE.Group(); torso.position.y = 0.42; torso.rotation.x = 0.45;
      const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), skinM());
      chest.scale.set(1, 1.1, 0.75); torso.add(chest);
      for (const s of [-1, 1]) {
        const arm = limb(0.06, 0.34, skinM());
        arm.position.set(s * 0.26, 0.12, 0.12);
        arm.rotation.set(-1.4, 0, s * 0.5); // folded useless against chest
        torso.add(arm);
      }
      const headG = new THREE.Group(); headG.position.set(0, 0.4, 0.1);
      headG.rotation.x = -0.9; // head thrown back
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 7), skinM());
      headG.add(head);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.12), darkFleshM());
      jaw.position.set(0, -0.12, 0.1); jaw.rotation.x = 1.1; // mouth torn open
      headG.add(jaw);
      torso.add(headG);
      hips.add(torso);
      g.add(hips);
      u.torso = torso;
      break;
    }
    case 'crawler': {
      // something that drags itself flat: long segmented torso, many small
      // skittering legs, a face that is only teeth
      const segs = 6;
      let parent = g;
      for (let i = 0; i < segs; i++) {
        const seg = new THREE.Group();
        seg.position.set(0, i === 0 ? 0.32 : 0, i === 0 ? 0 : 0.42);
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.24 - i * 0.015, 8, 6), darkFleshM());
        body.scale.set(1, 0.55, 1.2);
        seg.add(body);
        for (const s of [-1, 1]) {
          const leg = limb(0.035, 0.3, darkFleshM());
          leg.position.set(s * 0.22, 0, 0);
          leg.rotation.z = s * 0.9;
          seg.add(leg);
        }
        u.limbs.push({ g: seg, kind: 'seg', side: i % 2 === 0 ? 1 : -1 });
        parent.add(seg);
        parent = seg;
      }
      const headG = new THREE.Group(); headG.position.set(0, 0.3, -0.35);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 9, 7), darkFleshM());
      head.scale.set(1, 0.8, 1);
      headG.add(head);
      const maw = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 8), mouthM());
      maw.rotation.x = -Math.PI / 2;
      maw.position.set(0, 0, -0.16);
      headG.add(maw);
      g.add(headG);
      break;
    }
    case 'siren': {
      // a pale figure in ragged hanging strips, head tilted as if listening;
      // the face is smooth — no mouth, yet it sings
      const m = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.85 });
      const skirtM = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.95, side: THREE.DoubleSide });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 1.6, 9), m);
      body.position.y = 0.9;
      g.add(body);
      for (let i = 0; i < 10; i++) {
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.7 + ((i * 37) % 10) / 20), skirtM);
        const a = (i / 10) * Math.PI * 2;
        strip.position.set(Math.cos(a) * 0.3, 1.0, Math.sin(a) * 0.3);
        strip.rotation.y = -a + Math.PI / 2;
        strip.rotation.z = Math.sin(i * 3.7) * 0.3;
        g.add(strip);
      }
      const headG = new THREE.Group(); headG.position.y = 1.85;
      headG.rotation.z = 0.35; headG.rotation.x = -0.15; // tilted, listening
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 7), m);
      head.scale.set(0.9, 1.25, 0.9); // smooth, featureless, wrong
      headG.add(head);
      const hairM = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 1 });
      for (let i = 0; i < 8; i++) {
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.008, 0.8 + ((i * 53) % 10) / 25, 3), hairM);
        const a = (i / 8) * Math.PI * 2;
        h.position.set(Math.cos(a) * 0.12, -0.3, Math.sin(a) * 0.12);
        h.rotation.z = Math.sin(i * 2.1) * 0.3;
        headG.add(h);
      }
      g.add(headG);
      for (const s of [-1, 1]) {
        const arm = limb(0.07, 0.9, m);
        arm.position.set(s * 0.22, 1.45, 0);
        arm.rotation.z = s * 0.12; // hanging limp
        g.add(arm);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
      }
      u.torso = headG;
      break;
    }
    case 'tallone': {
      // 4.4m of wrong. Torso like a stretched curtain, arms that reach the
      // floor and keep going, a head too small on a neck too long. Matte
      // near-black with a faint wet sheen so the flashlight catches it.
      const mat = new THREE.MeshStandardMaterial({ color: 0x14130f, roughness: 0.42, metalness: 0.08 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.0, 0.16), mat);
      body.position.y = 2.6;
      g.add(body);
      // faint rib ridges — visible only when the beam crosses it
      for (let i = 0; i < 6; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.19), wetBlackM());
        rib.position.y = 3.3 - i * 0.24;
        g.add(rib);
        u.detail.push(rib);
      }
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.55, 6), mat);
      neck.position.y = 3.85;
      g.add(neck);
      const hd = new THREE.Group();
      hd.position.set(0.02, 4.25, 0);
      hd.rotation.z = 0.22; // permanently questioning
      const skull = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.34, 0.19), mat);
      hd.add(skull);
      // no face. just a slightly darker vertical seam where one would be.
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.01), voidM());
      seam.position.set(0, 0, 0.096);
      hd.add(seam);
      u.detail.push(seam);
      g.add(hd);
      const arms = [];
      for (const s of [-1, 1]) {
        const { upper, joint } = limb2(0.05, 1.5, 0.04, 1.4, mat, s * 0.12);
        upper.position.set(s * 0.16, 3.5, 0);
        upper.rotation.z = s * 0.06;
        g.add(upper);
        const hand = fingers(joint, 0, -1.4, 0, 5, 0.55, mat, 0.045);
        u.detail.push(...hand.children);
        arms.push(upper);
        u.limbs.push({ g: upper, kind: 'arm', side: s });
        const leg = limb(0.06, 2.3, mat);
        leg.position.set(s * 0.11, 2.3, 0);
        g.add(leg);
        u.limbs.push({ g: leg, kind: 'leg', side: s });
      }
      u.head = hd;
      u.poseArms = arms;
      // posture snap: discrete poses it holds while unobserved
      u.poseIdx = 0;
      u.setPose = (i) => {
        u.poseIdx = i;
        const P = [
          [0.06, -0.06, 0.22],   // arms slack, head tilted
          [0.35, -0.3, -0.15],   // arms slightly raised — was it always like that?
          [-0.2, 0.25, 0.45],    // one arm half-lifted, head the other way
          [0.0, 0.0, 0.0],       // perfectly straight. worst of all.
        ][i % 4];
        arms[0].rotation.z = P[0];
        arms[1].rotation.z = P[1];
        hd.rotation.z = P[2];
      };
      break;
    }
    case 'hollow': {
      // 2m grey figure, arms hanging past the knees, and where the face
      // should be: a smooth recess of nothing.
      const skin = hollowSkinM();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 8), skin);
      body.position.y = 1.15;
      body.rotation.x = 0.08; // stooped
      g.add(body);
      const hd = new THREE.Group();
      hd.position.set(0, 1.82, 0.05);
      hd.rotation.x = 0.3; // head bowed down
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin);
      skull.scale.set(0.9, 1.3, 0.95);
      hd.add(skull);
      // the hollow: an inset black void for a face
      const void_ = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), voidM());
      void_.position.set(0, 0.02, 0.09);
      void_.scale.set(0.8, 1.15, 0.5);
      hd.add(void_);
      u.detail.push(void_);
      g.add(hd);
      for (const s of [-1, 1]) {
        const arm = limb(0.045, 1.05, skin);
        arm.position.set(s * 0.17, 1.62, 0.02);
        arm.rotation.z = s * 0.05;
        g.add(arm);
        fingers(arm, 0, -1.05, 0, 4, 0.22, skin, 0.035);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
        const leg = limb(0.05, 0.85, skin);
        leg.position.set(s * 0.09, 0.85, 0);
        if (s > 0) leg.rotation.x = 0.14; // one knee buckled wrong
        g.add(leg);
        u.limbs.push({ g: leg, kind: 'leg', side: s });
      }
      u.head = hd;
      break;
    }
    case 'bonefiend': {
      // chalk-white anatomy lesson gone wrong: visible spine, ribcage hoops,
      // backwards knees, a skull with the jaw unhinged. Built to lurch.
      const bone = boneM();
      const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.18), bone);
      pelvis.position.y = 0.98;
      g.add(pelvis);
      // spine: stacked knobs, slightly curved wrong
      const spine = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), bone);
        knob.position.set(Math.sin(i * 0.7) * 0.05, 1.05 + i * 0.13, -0.02 - i * 0.015);
        spine.add(knob);
        u.detail.push(knob);
      }
      g.add(spine);
      // ribcage: open hoops
      for (let i = 0; i < 4; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.012, 0.016, 5, 10, Math.PI * 1.5), bone);
        rib.position.y = 1.55 + i * 0.09;
        rib.rotation.x = Math.PI / 2;
        rib.rotation.z = Math.PI * 0.75;
        g.add(rib);
        u.detail.push(rib);
      }
      const hd = new THREE.Group();
      hd.position.set(0.03, 2.1, 0.02);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), bone);
      skull.scale.set(0.85, 1.15, 1.15);
      hd.add(skull);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.14), bone);
      jaw.position.set(0, -0.16, 0.05);
      jaw.rotation.x = 0.85; // unhinged
      hd.add(jaw);
      u.jaw = jaw;
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), voidM());
      socket.position.set(-0.05, 0.04, 0.1);
      const socket2 = socket.clone(); socket2.position.set(0.06, 0.01, 0.1); socket2.scale.setScalar(0.7);
      hd.add(socket, socket2); // asymmetric empty sockets
      u.detail.push(socket, socket2);
      g.add(hd);
      for (const s of [-1, 1]) {
        // backwards knees: thigh forward, shin bent BACK
        const thigh = limb(0.045, 0.5, bone);
        thigh.position.set(s * 0.11, 0.95, 0);
        thigh.rotation.x = 0.25;
        const knee = new THREE.Group(); knee.position.y = -0.5;
        const shin = limb(0.035, 0.5, bone);
        shin.rotation.x = -0.9; // wrong direction
        knee.add(shin); thigh.add(knee);
        g.add(thigh);
        u.limbs.push({ g: thigh, kind: 'leg', side: s });
        const arm = limb(0.035, 0.85, bone);
        arm.position.set(s * 0.2, 1.78, 0);
        arm.rotation.z = s * 0.3;
        g.add(arm);
        fingers(arm, 0, -0.85, 0, 5, 0.3, bone, 0.04);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
      }
      u.head = hd;
      break;
    }
    case 'walldweller': {
      // pressed flat: a wide, pancake-thin body the color of old wallpaper,
      // limbs splayed like a pasted specimen, face turned sideways into the wall
      const skin = plasterM();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.1), skin);
      body.position.y = 1.4;
      g.add(body);
      // faint stain patterns so it reads as "wall damage" until it moves
      for (let i = 0; i < 5; i++) {
        const stain = new THREE.Mesh(new THREE.BoxGeometry(0.12 + (i % 3) * 0.07, 0.2, 0.02), darkFleshM());
        stain.position.set(Math.sin(i * 2.3) * 0.25, 1.0 + i * 0.22, 0.06);
        g.add(stain);
        u.detail.push(stain);
      }
      const hd = new THREE.Group();
      hd.position.set(0.1, 2.15, 0.02);
      hd.rotation.y = Math.PI / 2.3; // face pressed sideways
      const skull = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.16), skin);
      hd.add(skull);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.02), voidM());
      eye.position.set(0, 0.06, 0.09);
      hd.add(eye);
      u.detail.push(eye);
      g.add(hd);
      for (const s of [-1, 1]) {
        const arm = limb(0.05, 1.1, skin);
        arm.position.set(s * 0.4, 1.9, 0);
        arm.rotation.z = s * 1.15; // splayed up against the wall
        g.add(arm);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
        const leg = limb(0.06, 0.85, skin);
        leg.position.set(s * 0.22, 0.85, 0);
        leg.rotation.z = s * 0.45;
        g.add(leg);
        u.limbs.push({ g: leg, kind: 'leg', side: s });
      }
      u.head = hd;
      break;
    }
    case 'deepone': {
      // slick, eyeless, wide-mouthed; built to be half-seen above a waterline
      const skin = wetBlackM();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), skin);
      body.scale.set(1, 1.25, 0.85);
      body.position.y = 0.7;
      g.add(body);
      const hd = new THREE.Group();
      hd.position.set(0, 1.35, 0.08);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
      skull.scale.set(1.15, 0.9, 1.05);
      hd.add(skull);
      // no eyes — just a wide lipless slit
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.05), mouthM());
      slit.position.set(0, -0.05, 0.2);
      hd.add(slit);
      u.jaw = slit;
      g.add(hd);
      for (const s of [-1, 1]) {
        const arm = limb(0.06, 0.95, skin);
        arm.position.set(s * 0.34, 1.0, 0.1);
        arm.rotation.z = s * 0.55;
        arm.rotation.x = -0.5; // reaching forward over the water
        g.add(arm);
        const hand = fingers(arm, 0, -0.95, 0, 4, 0.28, skin, 0.06);
        for (const f of hand.children) f.scale.z = 2.2; // webbed, flattened
        u.limbs.push({ g: arm, kind: 'arm', side: s });
      }
      // dorsal spines along the back
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16 + i * 0.02, 5), skin);
        sp.position.set(0, 0.75 + i * 0.18, -0.32);
        sp.rotation.x = -0.5;
        g.add(sp);
        u.detail.push(sp);
      }
      u.head = hd;
      break;
    }
    case 'ceiling': {
      // hangs upside down: limbs folded up around an invisible grip, head
      // dangling down, rotated 180° so the face is upright — which is worse
      const skin = skinSicklyM();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.3), darkFleshM());
      body.position.y = -0.35; // group origin sits at ceiling
      g.add(body);
      const hd = new THREE.Group();
      hd.position.set(0, -0.85, 0.1);
      hd.rotation.z = Math.PI; // inverted head
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 9, 7), skin);
      skull.scale.set(0.9, 1.2, 0.9);
      hd.add(skull);
      const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.02), eyeGlowM());
      e1.position.set(-0.06, -0.03, 0.12);
      const e2 = e1.clone(); e2.position.set(0.07, 0.01, 0.12);
      hd.add(e1, e2); // eyes at wrong heights
      u.detail.push(e1, e2);
      g.add(hd);
      for (const s of [-1, 1]) {
        const arm = limb(0.045, 0.8, skin);
        arm.position.set(s * 0.22, 0.05, 0);
        arm.rotation.z = s * 2.6; // folded upward, gripping nothing
        g.add(arm);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
        const leg = limb(0.055, 0.9, skin);
        leg.position.set(s * 0.15, -0.05, -0.1);
        leg.rotation.z = s * 2.9;
        leg.rotation.x = -0.4;
        g.add(leg);
        u.limbs.push({ g: leg, kind: 'leg', side: s });
      }
      u.head = hd;
      u.upsideDown = true;
      break;
    }
    case 'falseplayer': {
      // almost your friend: right height, right jacket silhouette, a pale
      // head. Arms 15% too long. No camera. No name. Up close, no eyes.
      const jacketM = new THREE.MeshStandardMaterial({ color: 0x5c5648, roughness: 0.85 });
      const paleM = new THREE.MeshStandardMaterial({ color: 0xc9bda9, roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 0.24), jacketM);
      body.position.y = 1.15;
      g.add(body);
      const hd = new THREE.Group();
      hd.position.set(0, 1.62, 0);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 9, 7), paleM);
      hd.add(skull);
      // the face only resolves when close: smooth, eyes shallow dents
      for (const s of [-1, 1]) {
        const dent = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), mouthM());
        dent.position.set(s * 0.05, 0.02, 0.11);
        dent.scale.z = 0.4;
        hd.add(dent);
        u.detail.push(dent);
      }
      g.add(hd);
      for (const s of [-1, 1]) {
        const arm = limb(0.05, 0.78, jacketM); // too long for the body
        arm.position.set(s * 0.24, 1.42, 0);
        g.add(arm);
        const hand = fingers(arm, 0, -0.78, 0, 4, 0.16, paleM, 0.035);
        u.detail.push(...hand.children);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
        const leg = limb(0.07, 0.85, darkFleshM());
        leg.position.set(s * 0.11, 0.85, 0);
        g.add(leg);
        u.limbs.push({ g: leg, kind: 'leg', side: s });
      }
      u.head = hd;
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; } });
  finalizeMonsterMesh(g);
  return g;
}
