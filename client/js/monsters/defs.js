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
  theunstoppable: {
    name: 'THE UNSTOPPABLE', speed: 4.6, aggroRange: 34, despawnLookAt: 0,
    despawnDist: 180, voice: 'theunstoppable', rarity: 0.012, privateOnly: false,
    keepDist: [0, 0], vision: 30, hearing: 30, attackRange: 1.3, lethal: true,
    chaseGiveUp: 42, pack: 1, unstoppable: true, heavy: true,
  },
  leech: {
    name: 'THE LEECH', speed: 3.6, aggroRange: 9, despawnLookAt: 0,
    despawnDist: 70, voice: 'leech', rarity: 0.13, privateOnly: false,
    keepDist: [0, 0], vision: 8, hearing: 16, attackRange: 0.8, lethal: true,
    chaseGiveUp: 20, prefersDark: true, lowProfile: true, pack: 2,
  },
  king: {
    name: 'THE KING', speed: 2.2, aggroRange: 30, despawnLookAt: 0,
    despawnDist: 120, voice: 'king', rarity: 0.04, privateOnly: false,
    keepDist: [0, 0], vision: 36, hearing: 8, attackRange: 1.6, lethal: true,
    chaseGiveUp: 26, pack: 1, farSpawn: true, heavy: true,
  },
  flicker: {
    name: 'THE FLICKER', speed: 2.6, aggroRange: 22, despawnLookAt: 0,
    despawnDist: 85, voice: 'flicker', rarity: 0.08, privateOnly: false,
    keepDist: [0, 0], vision: 26, hearing: 12, attackRange: 1.0, lethal: true,
    chaseGiveUp: 24, pack: 1, lurch: true, flashReact: 'avoid',
  },
  drifter: {
    name: 'THE DRIFTER', speed: 1.4, aggroRange: 18, despawnLookAt: 0,
    despawnDist: 90, voice: 'drifter', rarity: 0.09, privateOnly: false,
    keepDist: [0, 0], vision: 20, hearing: 4, attackRange: 1.1, lethal: true,
    chaseGiveUp: 18, pack: 1, moveWhenUnseen: true,
  },
  statue: {
    name: 'THE STATUE', speed: 3.0, aggroRange: 26, despawnLookAt: 0,
    despawnDist: 110, voice: 'statue', rarity: 0.07, privateOnly: false,
    keepDist: [0, 0], vision: 0, hearing: 0, attackRange: 0.9, lethal: true,
    chaseGiveUp: 22, pack: 1, flashReact: 'freeze',
  },
  swarm: {
    name: 'THE SWARM', speed: 4.0, aggroRange: 16, despawnLookAt: 0,
    despawnDist: 60, voice: 'swarm', rarity: 0.10, privateOnly: false,
    keepDist: [0, 0], vision: 14, hearing: 18, attackRange: 0.6, lethal: true,
    chaseGiveUp: 14, pack: 4, lowProfile: true,
  },
  spitter: {
    name: 'THE SPITTER', speed: 0, aggroRange: 0, despawnLookAt: 0,
    despawnDist: 70, voice: 'spitter', rarity: 0.07, privateOnly: false,
    keepDist: [0, 0], vision: 24, hearing: 6, attackRange: 9.0, lethal: true,
    chaseGiveUp: 0, pack: 1, ranged: true,
  },
  drummer: {
    name: 'THE DRUMMER', speed: 3.9, aggroRange: 0, despawnLookAt: 0,
    despawnDist: 100, voice: 'drummer', rarity: 0.08, privateOnly: false,
    keepDist: [0, 0], vision: 0, hearing: 34, attackRange: 1.0, lethal: true,
    chaseGiveUp: 22, pack: 1, flashReact: 'enrage',
  },
  worm: {
    name: 'THE WORM', speed: 4.4, aggroRange: 14, despawnLookAt: 0,
    despawnDist: 85, voice: 'worm', rarity: 0.11, privateOnly: false,
    keepDist: [0, 0], vision: 0, hearing: 24, attackRange: 1.0, lethal: true,
    chaseGiveUp: 18, pack: 1, submerged: true, levelOnly: 3,
  },
  null: {
    name: 'THE NULL', speed: 2.8, aggroRange: 20, despawnLookAt: 0,
    despawnDist: 95, voice: 'null', rarity: 0.03, privateOnly: false,
    keepDist: [0, 0], vision: 24, hearing: 10, attackRange: 1.2, lethal: true,
    chaseGiveUp: 20, pack: 1, moveWhenUnseen: true,
  },
  thresher: {
    name: 'THE THRESHER', speed: 5.0, aggroRange: 26, despawnLookAt: 0,
    despawnDist: 110, voice: 'thresher', rarity: 0.06, privateOnly: false,
    keepDist: [0, 0], vision: 18, hearing: 20, attackRange: 1.3, lethal: true,
    chaseGiveUp: 20, pack: 1, heavy: true,
  },
  rememberer: {
    name: 'THE REMEMBERER', speed: 2.0, aggroRange: 24, despawnLookAt: 0,
    despawnDist: 130, voice: 'rememberer', rarity: 0.05, privateOnly: false,
    keepDist: [0, 0], vision: 28, hearing: 12, attackRange: 1.0, lethal: true,
    chaseGiveUp: 40, pack: 1,
  },
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// horror palette — rotten, wet, damaged flesh; exposed bone; void interiors.
// Every creature material passes through creatureMat so silhouettes stay
// readable in darkness, and eyeGlow pupils ignore fog.
const skinM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0xcfc3b2, roughness: 0.55, metalness: 0.05 }));
const skinSicklyM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.7 }));
const darkFleshM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x4a3f38, roughness: 0.85 }));
const voidM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 1 }));
const mouthM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x0c0508, roughness: 0.4 }));
const eyeGlowM = () => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xd8d2c2, emissiveIntensity: 0.55, fog: false });
const wetBlackM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x0d0f0c, roughness: 0.22, metalness: 0.1 }));
const boneM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.5, metalness: 0.02 }));
const plasterM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x8f8468, roughness: 0.92 }));
const hollowSkinM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0xb9b0a2, roughness: 0.78 }));
const rotDarkM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x2b2119, roughness: 0.34, metalness: 0.07 }));
const rotDeepM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x191310, roughness: 0.42, metalness: 0.05 }));
const rotPaleM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x8f8472, roughness: 0.5, metalness: 0.03 }));
const boneExM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0xb2a894, roughness: 0.55 }));
const socketBlackM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }));
const gumDarkM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x2a0d0b, roughness: 0.3 }));
const nailM = () => creatureMat(new THREE.MeshStandardMaterial({ color: 0x15100b, roughness: 0.35 }));

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

// ---------------------------------------------------------------------------
// horror anatomy toolkit — deep hollow sockets, gaping toothy jaws,
// emaciated ribcages, exposed spine, clawed finger-fans.

// irregular sharp teeth along a jaw edge (vertical cones, point-down)
function teethRow(parent, n, w, y, z, size = 1, mat = null) {
  const m = mat || boneExM();
  for (let i = 0; i < n; i++) {
    const len = (0.045 + Math.abs(Math.sin(i * 3.31)) * 0.045) * size;
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.012 * size, len, 5), m);
    const off = n > 1 ? -w / 2 + (i / (n - 1)) * w : 0;
    t.position.set(off + Math.sin(i * 5.13) * 0.007, y, z);
    t.rotation.x = Math.PI;
    t.rotation.z = Math.sin(i * 7.7) * 0.24;
    parent.add(t);
  }
  return parent;
}

// skull + deep hollow eye sockets (+faint pupils) + permanently-open toothy jaw.
// Returns { hd, skull, jawG } — jawG with rotation.x hooks the attack-anim.
function horrorHead(opts = {}) {
  const skin = opts.skin || rotDarkM();
  const scale = opts.scale || 1;
  const wantJaw = opts.jaw !== false;
  const pupils = opts.pupils !== false;
  const hd = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135 * scale, 10, 8), skin);
  skull.scale.set(0.78, 1.18, 0.95);
  hd.add(skull);
  // back-of-cranium bulge so the skull reads as bony not round
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.085 * scale, 8, 6), skin);
  back.position.set(0, 0.04 * scale, -0.06 * scale);
  back.scale.set(0.85, 1.0, 0.8);
  hd.add(back);
  let jawG = null;
  if (wantJaw) {
    teethRow(hd, 7, 0.14 * scale, -0.07 * scale, 0.1 * scale, scale); // upper teeth on skull
    jawG = new THREE.Group();
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.13 * scale, 0.05 * scale, 0.09 * scale), skin);
    chin.position.set(0, -0.13 * scale, 0.07 * scale);
    jawG.add(chin);
    const void_ = new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, 0.1 * scale, 0.08 * scale), gumDarkM());
    void_.position.set(0, -0.09 * scale, 0.07 * scale);
    jawG.add(void_);
    teethRow(jawG, 6, 0.11 * scale, -0.1 * scale, 0.105 * scale, scale * 0.9);
    jawG.rotation.x = 0.34; // hangs wrong, permanently
    hd.add(jawG);
  }
  for (const s of [-1, 1]) {
    const sock = new THREE.Mesh(new THREE.SphereGeometry(0.032 * scale, 8, 6), socketBlackM());
    sock.position.set(s * 0.052 * scale, 0.04 * scale, 0.1 * scale);
    sock.scale.set(1, 1.35, 0.55);
    hd.add(sock);
    if (pupils) {
      const pup = new THREE.Mesh(new THREE.BoxGeometry(0.01 * scale, 0.01 * scale, 0.008), eyeGlowM());
      pup.position.set(s * 0.052 * scale, 0.045 * scale, 0.115 * scale);
      hd.add(pup);
    }
  }
  return { hd, skull, jawG };
}

// emaciated torso: hollow tube + protruding front ribs + back spine knobs
function emaciatedTorso(skin, bone, chestW = 0.36, tubeH = 0.9, ribs = 5) {
  const gT = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(chestW * 0.42, chestW * 0.36, tubeH, 9), skin);
  gT.add(tube);
  const detail = [];
  for (let i = 0; i < ribs; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(chestW, 0.032, chestW * 0.68), bone || skin);
    rib.position.set(0, tubeH * 0.5 - 0.08 - i * (tubeH * 0.22), chestW * 0.16);
    gT.add(rib);
    detail.push(rib);
  }
  for (let i = 0; i < ribs; i++) {
    const v = new THREE.Mesh(new THREE.SphereGeometry(0.032, 5, 4), bone || skin);
    v.position.set(0, tubeH * 0.5 - 0.06 - i * (tubeH * 0.21), -chestW * 0.32);
    gT.add(v);
    detail.push(v);
  }
  return { gT, detail };
}

// long thin arm pivoting at the shoulder, finished with a long claw-fan
function longArm(side, mat, len = 1.2, fingersN = 5) {
  const arm = limb(0.045 + len * 0.003, len, mat);
  const hand = fingers(arm, 0, -len, 0, fingersN, len * 0.28, mat, 0.04);
  return { arm, hand };
}

// ---------------------------------------------------------------------------
export function buildMonster(type) {
  const g = new THREE.Group();
  const u = g.userData;
  u.limbs = [];
  u.detail = []; // small meshes hidden beyond LOD range

  switch (type) {
    case 'watcher': {
      // 3.4m emaciated figure with ribbed chest, floor-dragging claws and a
      // jaw that never fully closes. It stands impossibly still.
      const mat = rotPaleM(), bone = boneExM();
      const t = emaciatedTorso(mat, bone, 0.4, 1.5, 5);
      t.gT.position.y = 2.2;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 1.12 });
      headR.hd.position.set(0.03, 3.08, 0.05);
      headR.hd.rotation.z = 0.17;
      headR.hd.rotation.x = 0.1;
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const len = 1.85 + (s > 0 ? 0.2 : 0);
        const { arm, hand } = longArm(s, mat, len, 6);
        arm.position.set(s * 0.24 + (s > 0 ? 0.04 : 0), 2.95, 0);
        arm.rotation.z = s * 0.07;
        g.add(arm);
        u.detail.push(...hand.children);
        const leg = limb(0.085, 1.55, rotDeepM());
        leg.position.set(s * 0.12, 1.55, 0);
        if (s > 0) leg.scale.setScalar(1.08); // asymmetric legs
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'stalker': {
      // hunched knuckle-walker: torso leaned forward, arms longer than body,
      // claws skimming the floor. Face always slightly lifted, watching.
      const skin = rotDarkM(), bone = boneExM();
      const t = emaciatedTorso(skin, bone, 0.42, 0.65, 4);
      t.gT.position.set(0, 1.05, -0.1);
      t.gT.rotation.x = -0.5;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin, scale: 0.95 });
      headR.hd.position.set(0, 1.12, 0.52);
      headR.hd.rotation.x = 0.35;
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const { arm, hand } = longArm(s, skin, 1.25, 5);
        arm.position.set(s * 0.3, 1.1, 0.42);
        arm.rotation.x = 0.55; // knuckle-walk reach
        g.add(arm);
        u.detail.push(...hand.children);
        const leg = limb(0.11, 0.8, rotDeepM());
        leg.position.set(s * 0.25, 0.8, -0.45);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'hunter': {
      // 2.8m predator: torn-open jaw, one arm longer than the other, legs
      // too long for the torso. Built to run you down.
      const mat = rotDarkM(), bone = boneExM();
      const t = emaciatedTorso(mat, bone, 0.4, 1.2, 4);
      t.gT.position.y = 1.95;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 1.05 });
      headR.hd.position.set(0, 2.72, 0.02);
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) { u.jaw = headR.jawG; u.jaw.rotation.x = 0.5; }
      for (const s of [-1, 1]) {
        const len = s > 0 ? 1.7 : 1.4; // wrong by design
        const { arm, hand } = longArm(s, mat, len, 5);
        arm.position.set(s * 0.24, 2.5, 0);
        g.add(arm);
        u.detail.push(...hand.children);
        const leg = limb(0.095, 1.65, rotDeepM());
        leg.position.set(s * 0.12, 1.68, 0);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'ambusher': {
      // crouched void-whatever, folded limbs, skull tucked into its shoulders.
      // Unfolds upward when it lunges.
      const skin = voidM();
      const t = emaciatedTorso(skin, boneExM(), 0.7, 0.55, 3);
      t.gT.position.set(0, 0.46, 0);
      t.gT.rotation.x = -0.2;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin, scale: 1.1 });
      headR.hd.position.set(0, 0.7, 0.3);
      headR.hd.rotation.x = 0.45;
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const { arm, hand } = longArm(s, skin, 0.85, 5);
        arm.position.set(s * 0.38, 0.68, 0.12);
        arm.rotation.x = -1.0;
        arm.rotation.z = s * 0.4; // folded against the body
        g.add(arm);
        u.detail.push(...hand.children);
        const leg = limb(0.11, 0.5, skin);
        leg.position.set(s * 0.26, 0.5, -0.22);
        leg.rotation.x = 0.85;
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'mimic': {
      // dormant: an ordinary office chair. revealed: seat rises on long
      // spider-legs, backrest splits open into a vertical toothy mouth.
      const chairMat = creatureMat(new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.9 }));
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
        const flesh = rotDarkM();
        seat.material = flesh;
        back.material = flesh;
        back.rotation.x = -0.9; // opens like a jaw
        seat.position.y = 1.0;
        back.position.set(0, 1.42, -0.36);
        // the mouth: upper and lower teeth rows + dark void inside
        const void_ = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.03), gumDarkM());
        void_.position.set(0, 0, 0.035);
        back.add(void_);
        teethRow(back, 6, 0.4, -0.2, 0.045, 1.1);
        // skull with hollow sockets floating above the jaw-backrest
        const headR = horrorHead({ skin: flesh, scale: 0.9 });
        headR.hd.position.set(0, 1.95, -0.3);
        g.add(headR.hd);
        u.head = headR.hd;
        if (headR.jawG) u.jaw = headR.jawG;
        // long jointed legs replace the stubby ones
        g.remove(legs);
        for (const s of [-1, 1]) {
          const legA = limb(0.06, 1.0, flesh);
          legA.position.set(s * 0.3, 1.0, 0.15);
          legA.rotation.z = s * 0.5;
          const legB = limb(0.06, 1.0, flesh);
          legB.position.set(s * 0.3, 1.0, -0.2);
          legB.rotation.z = s * 0.5;
          g.add(legA, legB);
          u.limbs.push({ g: legA, kind: 'leg', side: s }, { g: legB, kind: 'leg', side: -s });
        }
      };
      break;
    }
    case 'shadow': {
      // matte void-black humanoid, head too long, arms drooping past the
      // knees. A hole in the light, nothing more.
      const mat = new THREE.MeshBasicMaterial({ color: 0x030307 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.85, 0.26), mat);
      body.position.y = 1.05;
      const hd = new THREE.Group();
      const skullM = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat);
      skullM.scale.set(0.75, 1.4, 0.9);
      hd.add(skullM);
      hd.position.set(0.04, 2.4, 0);
      hd.rotation.z = 0.16;
      for (const s of [-1, 1]) {
        const arm = limb(0.05, 1.15, mat);
        arm.position.set(s * 0.24, 1.9, 0);
        g.add(arm);
      }
      g.add(body, hd);
      break;
    }
    case 'runner': {
      // a sprinter built wrong: powerful back-folded legs, shrivelled arms
      // glued to the chest, skull thrown back with the mouth torn wide open
      const skin = rotDarkM();
      const hips = new THREE.Group(); hips.position.y = 1.05;
      const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), rotDeepM());
      pelvis.scale.set(1, 0.8, 1);
      hips.add(pelvis);
      for (const s of [-1, 1]) {
        const thigh = limb(0.13, 0.62, rotDeepM());
        thigh.position.set(s * 0.2, -0.1, 0);
        const knee = new THREE.Group(); knee.position.y = -0.62; thigh.add(knee);
        const shin = limb(0.1, 0.55, rotDeepM());
        shin.rotation.x = 0.7;
        knee.add(shin);
        hips.add(thigh);
        u.limbs.push({ g: thigh, kind: 'leg', side: s });
      }
      const torso = new THREE.Group(); torso.position.y = 0.42; torso.rotation.x = 0.45;
      const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), rotPaleM());
      chest.scale.set(1, 1.1, 0.75);
      torso.add(chest);
      for (const s of [-1, 1]) {
        const arm = limb(0.055, 0.34, rotPaleM());
        arm.position.set(s * 0.26, 0.12, 0.12);
        arm.rotation.set(-1.4, 0, s * 0.5); // folded useless
        torso.add(arm);
      }
      const headR = horrorHead({ skin: rotPaleM(), scale: 1.0 });
      headR.hd.position.set(0, 0.4, 0.12);
      headR.hd.rotation.x = -0.95; // head thrown back
      if (headR.jawG) headR.jawG.rotation.x = 1.1; // mouth torn open
      torso.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      hips.add(torso);
      g.add(hips);
      u.torso = torso;
      break;
    }
    case 'crawler': {
      // drags itself flat: a segmented trailing body, many finger-legs, and a
      // face that is mostly a mouth ringed with mismatched teeth
      const segs = 6;
      let parent = g;
      for (let i = 0; i < segs; i++) {
        const segG = new THREE.Group();
        segG.position.set(0, i === 0 ? 0.34 : 0, i === 0 ? 0 : 0.42);
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.24 - i * 0.015, 8, 6), rotDeepM());
        body.scale.set(1, 0.55, 1.2);
        segG.add(body);
        for (const s of [-1, 1]) {
          const leg = limb(0.035, 0.3, rotDeepM());
          leg.position.set(s * 0.22, 0, 0);
          leg.rotation.z = s * 0.9;
          segG.add(leg);
        }
        u.limbs.push({ g: segG, kind: 'seg', side: i % 2 === 0 ? 1 : -1 });
        parent.add(segG);
        parent = segG;
      }
      const headR = horrorHead({ skin: rotDarkM(), scale: 0.85 });
      headR.hd.position.set(0, 0.32, -0.42);
      headR.hd.rotation.x = 0.4;
      if (headR.jawG) headR.jawG.rotation.x = 0.7;
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      break;
    }
    case 'siren': {
      // pale emaciated figure in ragged hanging strips, head tilted as if
      // listening; hollow sockets, no jaw — yet it sings
      const m = creatureMat(new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.85 }));
      const skirtM = creatureMat(new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.95, side: THREE.DoubleSide }));
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 1.6, 9), m);
      body.position.y = 0.9;
      g.add(body);
      const t = emaciatedTorso(m, boneExM(), 0.32, 0.7, 4);
      t.gT.position.set(0, 1.45, 0);
      g.add(t.gT);
      u.detail.push(...t.detail);
      for (let i = 0; i < 10; i++) {
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.7 + ((i * 37) % 10) / 20), skirtM);
        const a = (i / 10) * Math.PI * 2;
        strip.position.set(Math.cos(a) * 0.3, 1.0, Math.sin(a) * 0.3);
        strip.rotation.y = -a + Math.PI / 2;
        strip.rotation.z = Math.sin(i * 3.7) * 0.3;
        g.add(strip);
      }
      const headR = horrorHead({ skin: m, scale: 1.0, jaw: false });
      headR.hd.position.set(0, 2.0, 0.02);
      headR.hd.rotation.z = 0.35;
      headR.hd.rotation.x = -0.15; // tilted, listening
      g.add(headR.hd);
      const hairM = creatureMat(new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 1 }));
      for (let i = 0; i < 8; i++) {
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.008, 0.8 + ((i * 53) % 10) / 25, 3), hairM);
        const a = (i / 8) * Math.PI * 2;
        h.position.set(Math.cos(a) * 0.12, -0.3, Math.sin(a) * 0.12);
        h.rotation.z = Math.sin(i * 2.1) * 0.3;
        headR.hd.add(h);
      }
      u.head = headR.hd;
      for (const s of [-1, 1]) {
        const arm = limb(0.07, 0.95, m);
        arm.position.set(s * 0.22, 1.55, 0);
        arm.rotation.z = s * 0.12;
        g.add(arm);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
      }
      u.torso = headR.hd;
      break;
    }
    case 'tallone': {
      // 4.4m of wrong. Curtain-thin torso, arms that reach the floor and keep
      // going, a skull on a neck too long. Faint wet sheen for the flashlight.
      const mat = rotDeepM(), bone = boneExM();
      const t = emaciatedTorso(mat, bone, 0.3, 1.9, 6);
      t.gT.position.y = 2.6;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.55, 6), mat);
      neck.position.y = 3.85;
      g.add(neck);
      const headR = horrorHead({ skin: mat, scale: 1.0, jaw: false });
      headR.hd.position.set(0.02, 4.25, 0);
      headR.hd.rotation.z = 0.22; // permanently questioning
      g.add(headR.hd);
      u.head = headR.hd;
      const arms = [];
      for (const s of [-1, 1]) {
        const { upper, joint } = limb2(0.05, 1.5, 0.04, 1.4, mat, s * 0.12);
        upper.position.set(s * 0.17, 3.5, 0);
        upper.rotation.z = s * 0.06;
        g.add(upper);
        const hand = fingers(joint, 0, -1.4, 0, 6, 0.6, mat, 0.05);
        u.detail.push(...hand.children);
        arms.push(upper);
        u.limbs.push({ g: upper, kind: 'arm', side: s });
        const leg = limb(0.055, 2.3, mat);
        leg.position.set(s * 0.11, 2.3, 0);
        g.add(leg);
        u.limbs.push({ g: leg, kind: 'leg', side: s });
      }
      u.poseArms = arms;
      // posture snap: discrete poses it holds while unobserved
      u.poseIdx = 0;
      u.setPose = (i) => {
        u.poseIdx = i;
        const P = [
          [0.06, -0.06, 0.22],   // arms slack, head tilted
          [0.35, -0.3, -0.15],   // arms slightly raised — was it always?
          [-0.2, 0.25, 0.45],    // one arm half-lifted, head other way
          [0.0, 0.0, 0.0],       // perfectly straight. worst of all.
        ][i % 4];
        arms[0].rotation.z = P[0];
        arms[1].rotation.z = P[1];
        u.head.rotation.z = P[2];
      };
      break;
    }
    case 'hollow': {
      // 2.2m grey emaciated figure, arms hanging past the knees, and where
      // the face should be: a smooth recess of nothing.
      const skin = hollowSkinM();
      const t = emaciatedTorso(skin, boneExM(), 0.32, 1.1, 4);
      t.gT.position.set(0, 1.25, 0);
      t.gT.rotation.x = 0.08; // stooped
      g.add(t.gT);
      u.detail.push(...t.detail);
      const hd = new THREE.Group();
      hd.position.set(0, 1.95, 0.05);
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
      u.head = hd;
      for (const s of [-1, 1]) {
        const { arm, hand } = longArm(s, skin, 1.15, 4);
        arm.position.set(s * 0.17, 1.75, 0.02);
        arm.rotation.z = s * 0.05;
        g.add(arm);
        u.detail.push(...hand.children);
        const leg = limb(0.05, 0.9, skin);
        leg.position.set(s * 0.09, 0.92, 0);
        if (s > 0) leg.rotation.x = 0.14; // one knee buckled wrong
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'bonefiend': {
      // chalk-white anatomy lesson gone wrong: open ribcage, visible spine,
      // backwards knees, jaw unhinged full of mismatched teeth.
      const bone = boneM();
      const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.18), bone);
      pelvis.position.y = 0.98;
      g.add(pelvis);
      // spine: stacked knobs, slightly curved wrong
      for (let i = 0; i < 7; i++) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), bone);
        knob.position.set(Math.sin(i * 0.7) * 0.05, 1.05 + i * 0.13, -0.02 - i * 0.015);
        g.add(knob);
        u.detail.push(knob);
      }
      // open ribcage hoops
      for (let i = 0; i < 4; i++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(0.16 - i * 0.012, 0.016, 5, 10, Math.PI * 1.5), bone);
        rib.position.y = 1.55 + i * 0.09;
        rib.rotation.x = Math.PI / 2;
        rib.rotation.z = Math.PI * 0.75;
        g.add(rib);
        u.detail.push(rib);
      }
      const headR = horrorHead({ skin: bone, scale: 1.0 });
      headR.hd.position.set(0.03, 2.15, 0.02);
      if (headR.jawG) headR.jawG.rotation.x = 0.85; // unhinged
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        // backwards knees: thigh forward, shin bent BACK
        const thigh = limb(0.045, 0.5, bone);
        thigh.position.set(s * 0.11, 0.95, 0);
        thigh.rotation.x = 0.25;
        const knee = new THREE.Group(); knee.position.y = -0.5;
        const shin = limb(0.035, 0.5, bone);
        shin.rotation.x = -0.9; // wrong direction
        knee.add(shin);
        thigh.add(knee);
        g.add(thigh);
        u.limbs.push({ g: thigh, kind: 'leg', side: s });
        const { arm, hand } = longArm(s, bone, 0.9, 5);
        arm.position.set(s * 0.2, 1.8, 0);
        arm.rotation.z = s * 0.3;
        g.add(arm);
        u.detail.push(...hand.children);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
      }
      break;
    }
    case 'walldweller': {
      // pressed flat: a pancake-thin body the colour of old wallpaper, limbs
      // splayed up like a pasted specimen, face rotated into the wall
      const skin = plasterM();
      const t = emaciatedTorso(skin, rotDarkM(), 0.7, 1.3, 5);
      t.gT.position.set(0, 1.4, 0);
      t.gT.scale.z = 0.18; // flattened against the wall
      g.add(t.gT);
      u.detail.push(...t.detail);
      // faint stain patterns so it reads as "wall damage" until it moves
      for (let i = 0; i < 5; i++) {
        const stain = new THREE.Mesh(new THREE.BoxGeometry(0.12 + (i % 3) * 0.07, 0.2, 0.02), rotDarkM());
        stain.position.set(Math.sin(i * 2.3) * 0.3, 1.0 + i * 0.22, 0.06);
        g.add(stain);
        u.detail.push(stain);
      }
      const headR = horrorHead({ skin: rotPaleM(), scale: 1.0, jaw: false });
      headR.hd.position.set(0.1, 2.3, 0.02);
      headR.hd.rotation.y = Math.PI / 2.3; // face pressed sideways
      g.add(headR.hd);
      u.head = headR.hd;
      for (const s of [-1, 1]) {
        const { arm, hand } = longArm(s, skin, 1.15, 5);
        arm.position.set(s * 0.4, 1.95, 0);
        arm.rotation.z = s * 1.15; // splayed up against the wall
        g.add(arm);
        u.detail.push(...hand.children);
        const leg = limb(0.06, 0.85, skin);
        leg.position.set(s * 0.22, 0.85, 0);
        leg.rotation.z = s * 0.45;
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'deepone': {
      // slick, eyeless, wide eel-mouth; dorsal spines; built to be half-seen
      // above a flooded waterline
      const skin = wetBlackM();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), skin);
      body.scale.set(1, 1.25, 0.85);
      body.position.y = 0.7;
      g.add(body);
      const headR = horrorHead({ skin, scale: 1.05, pupils: false });
      headR.hd.position.set(0, 1.4, 0.08);
      if (headR.jawG) headR.jawG.rotation.x = 0.6; // gaping wet mouth
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const { arm, hand } = longArm(s, skin, 1.0, 4);
        arm.position.set(s * 0.34, 1.05, 0.1);
        arm.rotation.z = s * 0.55;
        arm.rotation.x = -0.5; // reaching forward over the water
        g.add(arm);
        for (const f of hand.children) f.scale.z = 2.2; // webbed, flattened
        u.detail.push(...hand.children);
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
      break;
    }
    case 'ceiling': {
      // hangs upside down: limbs folded up around an invisible grip, head
      // dangling down, rotated 180° so the face is upright — which is worse
      const skin = skinSicklyM();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.3), rotDeepM());
      body.position.y = -0.35; // group origin sits at the ceiling
      g.add(body);
      const headR = horrorHead({ skin, scale: 0.95 });
      headR.hd.position.set(0, -0.85, 0.2);
      headR.hd.rotation.z = Math.PI; // inverted
      if (headR.jawG) headR.jawG.rotation.x = 0.6;
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const { arm, hand } = longArm(s, skin, 0.8, 5);
        arm.position.set(s * 0.22, 0.05, 0);
        arm.rotation.z = s * 2.6; // folded upward
        g.add(arm);
        u.detail.push(...hand.children);
        const leg = limb(0.055, 0.9, skin);
        leg.position.set(s * 0.15, -0.05, -0.1);
        leg.rotation.z = s * 2.9;
        leg.rotation.x = -0.4;
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      u.upsideDown = true;
      break;
    }
    case 'theunstoppable': {
      // 2.6m of wrong anatomy: head too small for the body, arms that hang
      // past the knees and end in splayed claws, jaw permanently open.
      const mat = rotDarkM(), bone = boneExM();
      const t = emaciatedTorso(mat, bone, 0.42, 1.1, 5);
      t.gT.position.y = 2.15;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 1.05 });
      headR.hd.position.set(0, 2.85, 0.02);
      if (headR.jawG) headR.jawG.rotation.x = 0.55; // never closed
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const { arm, hand } = longArm(s, mat, 1.85 + (s > 0 ? 0.2 : 0), 5);
        arm.position.set(s * 0.24, 2.55, 0);
        arm.rotation.z = s * 0.06;
        g.add(arm);
        u.detail.push(...hand.children);
        const leg = limb(0.1, 1.6, rotDeepM());
        leg.position.set(s * 0.12, 1.7, 0);
        if (s > 0) leg.scale.setScalar(1.08);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'leech': {
      // floor-crawler: low profile, two pale arms drag it across the carpet
      const skin = hollowSkinM();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), skin);
      body.scale.set(1.3, 0.4, 1.6);
      body.position.y = 0.22;
      g.add(body);
      const headR = horrorHead({ skin, scale: 0.75, jaw: false });
      headR.hd.position.set(0, 0.28, 0.42);
      headR.hd.rotation.x = 0.3;
      g.add(headR.hd);
      u.head = headR.hd;
      for (const s of [-1, 1]) {
        const arm = limb(0.04, 0.6, skin);
        arm.position.set(s * 0.22, 0.3, 0.25);
        arm.rotation.x = -0.7;
        g.add(arm);
        fingers(arm, 0, -0.6, 0, 4, 0.18, skin, 0.04);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
      }
      u.lowProfile = true;
      break;
    }
    case 'king': {
      // 5m of thin legs and a crown of ribs, small head, slow deliberate steps
      const mat = rotPaleM(), bone = boneExM();
      const t = emaciatedTorso(mat, bone, 0.5, 2.0, 6);
      t.gT.position.y = 2.8;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const crown = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.2 + i * 0.03, 0.018, 5, 8), bone);
        r.position.y = 0.05 + i * 0.06;
        r.rotation.x = Math.PI / 2;
        crown.add(r);
        u.detail.push(r);
      }
      crown.position.set(0, 4.55, 0);
      g.add(crown);
      const headR = horrorHead({ skin: mat, scale: 0.9 });
      headR.hd.position.set(0, 4.85, 0.02);
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const { arm, hand } = longArm(s, mat, 2.3 + (s > 0 ? 0.15 : 0), 5);
        arm.position.set(s * 0.28, 3.5, 0);
        arm.rotation.z = s * 0.04;
        g.add(arm);
        u.detail.push(...hand.children);
        const leg = limb(0.12, 2.0, rotDeepM());
        leg.position.set(s * 0.14, 1.85, 0);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'flicker': {
      // looks almost human until it blinks: then it's two steps closer
      const mat = hollowSkinM();
      const t = emaciatedTorso(mat, boneExM(), 0.34, 0.95, 4);
      t.gT.position.y = 1.4;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 0.9 });
      headR.hd.position.set(0, 1.95, 0.02);
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const { arm } = longArm(s, mat, 1.15, 4);
        arm.position.set(s * 0.2, 1.75, 0);
        arm.rotation.z = s * 0.08;
        g.add(arm);
        const leg = limb(0.07, 1.0, mat);
        leg.position.set(s * 0.09, 1.05, 0);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'drifter': {
      // a figure that only ever faces you sideways, wrong-height, always in
      // a doorway's shadow until the flashlight catches it
      const mat = voidM();
      const t = emaciatedTorso(mat, rotDeepM(), 0.28, 0.85, 3);
      t.gT.position.y = 1.3;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 0.8, pupils: false });
      headR.hd.position.set(0.03, 1.85, 0.02);
      headR.hd.rotation.y = Math.PI / 2.4; // sideways, always
      g.add(headR.hd);
      u.head = headR.hd;
      for (const s of [-1, 1]) {
        const { arm } = longArm(s, mat, 1.1, 4);
        arm.position.set(s * 0.18, 1.6, 0);
        arm.rotation.z = s * 0.5;
        g.add(arm);
        const leg = limb(0.055, 0.85, mat);
        leg.position.set(s * 0.08, 0.85, 0);
        if (s > 0) leg.rotation.x = 0.2;
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'statue': {
      // a person-shaped block of grey that only moves when unobserved
      const mat = plasterM();
      const t = emaciatedTorso(mat, boneExM(), 0.32, 0.9, 4);
      t.gT.position.y = 1.35;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 0.85, jaw: false, pupils: false });
      headR.hd.position.set(0, 1.95, 0.02);
      g.add(headR.hd);
      u.head = headR.hd;
      for (const s of [-1, 1]) {
        const { arm } = longArm(s, mat, 1.0, 4);
        arm.position.set(s * 0.18, 1.7, 0);
        arm.rotation.z = s * 0.03;
        g.add(arm);
        const leg = limb(0.06, 0.9, mat);
        leg.position.set(s * 0.09, 0.95, 0);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'swarm': {
      // one of many: small chitinous thing that scuttles toward light
      const mat = rotDeepM();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), mat);
      body.scale.set(1, 0.55, 1.4);
      body.position.y = 0.12;
      g.add(body);
      const headR = horrorHead({ skin: mat, scale: 0.55, jaw: false, pupils: false });
      headR.hd.position.set(0, 0.18, 0.22);
      g.add(headR.hd);
      u.head = headR.hd;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const leg = limb(0.02, 0.22, mat);
          leg.position.set(s * (0.08 + i * 0.05), 0.16, -0.1 + i * 0.1);
          leg.rotation.z = s * (0.6 + i * 0.2);
          g.add(leg);
          u.limbs.push({ g: leg, kind: 'leg', side: s });
        }
      }
      break;
    }
    case 'spitter': {
      // hangs in the doorway, wide-open mouth full of black fluid
      const mat = voidM();
      const t = emaciatedTorso(mat, rotDarkM(), 0.34, 0.8, 3);
      t.gT.position.y = 1.2;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 0.9 });
      headR.hd.position.set(0, 1.65, 0.02);
      if (headR.jawG) headR.jawG.rotation.x = 0.9; // permanently gaping
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      // mouth pool: a dark disc just under the jaw
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 7), gumDarkM());
      pool.position.set(0, 1.55, 0.1);
      g.add(pool);
      u.detail.push(pool);
      for (const s of [-1, 1]) {
        const arm = limb(0.045, 0.7, mat);
        arm.position.set(s * 0.2, 1.55, 0.05);
        arm.rotation.x = 0.4;
        g.add(arm);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
      }
      break;
    }
    case 'drummer': {
      // blind: large ears instead of eyes, heavy forearms it slams together
      const mat = rotDarkM();
      const t = emaciatedTorso(mat, boneExM(), 0.42, 0.95, 4);
      t.gT.position.y = 1.45;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 0.85, pupils: false, jaw: false });
      headR.hd.position.set(0, 2.05, 0.02);
      // two oversized ears where eyes should be
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat);
        ear.scale.set(0.5, 1.1, 0.3);
        ear.position.set(s * 0.1, 0.02, 0.12);
        headR.hd.add(ear);
      }
      g.add(headR.hd);
      u.head = headR.hd;
      for (const s of [-1, 1]) {
        const arm = limb(0.07, 0.95, mat);
        arm.position.set(s * 0.28, 1.85, 0.05);
        arm.rotation.z = s * 0.15;
        g.add(arm);
        const fist = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), mat);
        fist.position.set(s * 0.28, 1.85 - 0.95, 0.08);
        g.add(fist);
        u.detail.push(fist);
        const leg = limb(0.09, 1.05, rotDeepM());
        leg.position.set(s * 0.11, 1.1, 0);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'worm': {
      // a long slick tube that slides through the water; no face, no eyes
      const mat = wetBlackM();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 9, 7), mat);
      body.scale.set(1.4, 0.6, 1.8);
      body.position.y = 0.35;
      g.add(body);
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24 - i * 0.02, 0.02, 5, 10), mat);
        ring.position.set(0, 0.35 + i * 0.12, -0.28 - i * 0.15);
        ring.rotation.x = -0.6;
        g.add(ring);
        u.detail.push(ring);
      }
      const headR = horrorHead({ skin: mat, scale: 0.7, jaw: false, pupils: false });
      headR.hd.position.set(0, 0.45, 0.5);
      headR.hd.rotation.x = 0.4;
      g.add(headR.hd);
      u.head = headR.hd;
      for (const s of [-1, 1]) {
        const arm = limb(0.035, 0.6, mat);
        arm.position.set(s * 0.28, 0.4, 0.15);
        arm.rotation.x = -0.5;
        arm.rotation.z = s * 0.6;
        g.add(arm);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
      }
      break;
    }
    case 'null': {
      // almost featureless: tall, thin, wrong proportions, no face at all
      const mat = voidM();
      const t = emaciatedTorso(mat, rotDeepM(), 0.26, 1.2, 4);
      t.gT.position.y = 1.9;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 0.8, jaw: false, pupils: false });
      headR.hd.position.set(0, 2.6, 0);
      g.add(headR.hd);
      u.head = headR.hd;
      for (const s of [-1, 1]) {
        const { arm } = longArm(s, mat, 1.55 + (s > 0 ? 0.12 : 0), 5);
        arm.position.set(s * 0.18, 2.3, 0);
        arm.rotation.z = s * 0.04;
        g.add(arm);
        const leg = limb(0.06, 1.35, rotDeepM());
        leg.position.set(s * 0.1, 1.4, 0);
        if (s > 0) leg.scale.setScalar(1.05);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'thresher': {
      // blade-arms spinning, head packed with sockets that all watch at once
      const mat = rotDeepM(), blade = boneExM();
      const t = emaciatedTorso(mat, blade, 0.38, 1.0, 4);
      t.gT.position.y = 1.6;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 1.0 });
      headR.hd.position.set(0, 2.25, 0.02);
      // extra eye sockets all over the skull
      for (let i = 0; i < 5; i++) {
        const sock = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), socketBlackM());
        sock.position.set(Math.sin(i * 2.3) * 0.06, 0.05 + i * 0.04, 0.1);
        headR.hd.add(sock);
        u.detail.push(sock);
      }
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const { arm } = longArm(s, mat, 1.2, 3);
        arm.position.set(s * 0.22, 2.0, 0);
        arm.rotation.z = s * 0.4;
        g.add(arm);
        // blade where the hand should be
        const bl = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), blade);
        bl.position.set(0, -1.2, 0.1);
        bl.rotation.x = Math.PI / 2;
        arm.add(bl);
        u.detail.push(bl);
        const leg = limb(0.08, 1.15, rotDeepM());
        leg.position.set(s * 0.1, 1.2, 0);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'rememberer': {
      // tall, gaunt, covered in small hands that point at you — it remembers
      const mat = hollowSkinM();
      const t = emaciatedTorso(mat, boneExM(), 0.34, 1.2, 5);
      t.gT.position.y = 1.7;
      g.add(t.gT);
      u.detail.push(...t.detail);
      const headR = horrorHead({ skin: mat, scale: 0.95 });
      headR.hd.position.set(0, 2.35, 0.02);
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      // small hands sprouting from the chest, all pointing forward
      for (let i = 0; i < 4; i++) {
        const tiny = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), mat);
        tiny.position.set(-0.06 + i * 0.04, 1.6 + (i % 2) * 0.25, 0.2);
        tiny.rotation.z = -0.4 + (i % 2) * 0.2;
        g.add(tiny);
        u.detail.push(tiny);
      }
      for (const s of [-1, 1]) {
        const { arm } = longArm(s, mat, 1.3, 5);
        arm.position.set(s * 0.2, 2.05, 0);
        arm.rotation.z = s * 0.07;
        g.add(arm);
        const leg = limb(0.07, 1.15, rotDeepM());
        leg.position.set(s * 0.1, 1.2, 0);
        g.add(leg);
        u.limbs.push({ g: arm, kind: 'arm', side: s }, { g: leg, kind: 'leg', side: s });
      }
      break;
    }
    case 'falseplayer': {
      // almost your friend: right jacket silhouette, a pale head. Arms 15%
      // too long. No camera. No name. Up close, hollow sockets and a jaw.
      const jacketM = creatureMat(new THREE.MeshStandardMaterial({ color: 0x5c5648, roughness: 0.85 }));
      const paleM = creatureMat(new THREE.MeshStandardMaterial({ color: 0xc9bda9, roughness: 0.6 }));
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.62, 0.24), jacketM);
      body.position.y = 1.15;
      g.add(body);
      const headR = horrorHead({ skin: paleM, scale: 0.95 });
      headR.hd.position.set(0, 1.75, 0);
      if (headR.jawG) headR.jawG.rotation.x = 0.4;
      g.add(headR.hd);
      u.head = headR.hd;
      if (headR.jawG) u.jaw = headR.jawG;
      for (const s of [-1, 1]) {
        const arm = limb(0.05, 0.9, jacketM); // too long for the body
        arm.position.set(s * 0.24, 1.45, 0);
        g.add(arm);
        const hand = fingers(arm, 0, -0.9, 0, 4, 0.2, paleM, 0.035);
        u.detail.push(...hand.children);
        u.limbs.push({ g: arm, kind: 'arm', side: s });
        const leg = limb(0.07, 0.85, rotDeepM());
        leg.position.set(s * 0.11, 0.85, 0);
        g.add(leg);
        u.limbs.push({ g: leg, kind: 'leg', side: s });
      }
      break;
    }
  }
  finalizeMonsterMesh(g);
  return g;
}
