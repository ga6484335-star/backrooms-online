// Monster definitions: appearance builders + behavior parameters.
// AI lives in monsters.js; these are the factory + tuning tables.
import * as THREE from 'three';

export const MONSTER_TYPES = {
  watcher: {
    name: 'THE WATCHER', speed: 0.0, aggroRange: 0, despawnLookAt: 2.2,
    despawnDist: 60, voice: 'watcher', rarity: 0.45, privateOnly: false,
    keepDist: [18, 34],
  },
  stalker: {
    name: 'THE STALKER', speed: 1.4, aggroRange: 26, despawnLookAt: 6,
    despawnDist: 70, voice: 'stalker', rarity: 0.3, privateOnly: false,
    keepDist: [7, 14],
  },
  runner: {
    name: 'THE RUNNER', speed: 4.6, aggroRange: 18, despawnLookAt: 0,
    despawnDist: 80, voice: 'runner', rarity: 0.12, privateOnly: false,
    keepDist: [0, 0],
  },
  mimic: {
    name: 'THE MIMIC', speed: 0.9, aggroRange: 5, despawnLookAt: 10,
    despawnDist: 50, voice: 'stalker', rarity: 0.08, privateOnly: false,
    keepDist: [3, 8],
  },
  shadow: {
    name: 'THE SHADOW', speed: 0, aggroRange: 0, despawnLookAt: 1.2,
    despawnDist: 55, voice: 'shadow', rarity: 0.35, privateOnly: true, // personal hallucination
    keepDist: [12, 26],
  },
};

// ---------------------------------------------------------------------------
// Appearance builders — procedural, nightmare-flavored low-poly
export function buildMonster(type) {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 });
  const pale = new THREE.MeshStandardMaterial({ color: 0xb9b0a2, roughness: 0.9 });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeR = new THREE.MeshBasicMaterial({ color: 0xff2a1a });

  switch (type) {
    case 'watcher': {
      // impossibly tall, thin silhouette; pale oval face with two dark eyes
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.5, 0.3), black);
      body.position.y = 1.4;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.3), pale);
      head.position.y = 2.85;
      const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.02), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      e1.position.set(-0.08, 2.9, 0.16);
      const e2 = e1.clone(); e2.position.x = 0.08;
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 0.1), black);
      armL.position.set(-0.34, 1.3, 0); armL.rotation.z = 0.08;
      const armR = armL.clone(); armR.position.x = 0.34; armR.rotation.z = -0.08;
      g.add(body, head, e1, e2, armL, armR);
      break;
    }
    case 'stalker': {
      // hunched, long-armed crawler on all fours-ish
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.9), black);
      body.position.y = 0.65;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.34), black);
      head.position.set(0, 0.85, 0.5);
      const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), eyeR);
      e1.position.set(-0.07, 0.88, 0.68);
      const e2 = e1.clone(); e2.position.x = 0.07;
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.09), black);
        arm.position.set(0.3 * s, 0.45, 0.35); arm.rotation.x = 0.5;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.7, 0.11), black);
        leg.position.set(0.22 * s, 0.35, -0.3);
        g.add(arm, leg);
      }
      g.add(body, head, e1, e2);
      break;
    }
    case 'runner': {
      // long-legged sprinter, wrong proportions
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.26), black);
      body.position.y = 1.9;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.26), pale);
      head.position.y = 2.5;
      head.rotation.z = 0.35; // permanently tilted
      const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.02), eyeM);
      e1.position.set(-0.06, 2.52, 0.15); e1.rotation.z = 0.35;
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.55, 0.09), black);
        leg.position.set(0.13 * s, 0.78, 0);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), black);
        arm.position.set(0.26 * s, 1.9, 0);
        g.add(leg, arm);
        g.userData[s < 0 ? 'legL' : 'legR'] = leg;
        g.userData[s < 0 ? 'armL' : 'armR'] = arm;
      }
      g.add(body, head, e1);
      break;
    }
    case 'mimic': {
      // starts as a fake prop (chair-like); when revealed it grows limbs
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.9 }));
      body.position.y = 0.25;
      g.add(body);
      g.userData.revealed = false;
      g.userData.reveal = () => {
        if (g.userData.revealed) return;
        g.userData.revealed = true;
        body.material = black;
        body.position.y = 1.1;
        body.scale.set(0.9, 1.8, 0.9);
        for (const s of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), black);
          arm.position.set(0.3 * s, 1.0, 0);
          g.add(arm);
        }
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.02), eyeR);
        e.position.set(0, 1.5, 0.24);
        g.add(e);
      };
      break;
    }
    case 'shadow': {
      // pure black humanoid, slightly wrong; near-unlit
      const mat = new THREE.MeshBasicMaterial({ color: 0x020204 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.9, 0.3), mat);
      body.position.y = 1.0;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.26), mat);
      head.position.y = 2.1;
      g.add(body, head);
      break;
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; } });
  return g;
}
