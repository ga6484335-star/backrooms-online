// Structural sanity for all monster builds: real meshes, real materials,
// sensible heights, and animation hooks the AI loop depends on.
import * as THREE from 'three';
import { buildMonster, MONSTER_TYPES } from '../client/js/monsters/defs.js';

let pass = 0, fail = 0;
function check(cond, label) {
  if (cond) { pass++; console.log('  ✔ ' + label); }
  else { fail++; console.error('  ✘ FAILED: ' + label); process.exitCode = 1; }
}

const TALL = { watcher: 3.0, hunter: 2.5, tallone: 4.0, siren: 1.9, hollow: 2.0,
  bonefiend: 2.2, falseplayer: 1.7, walldweller: 2.0, stalker: 1.2 };

for (const [type, def] of Object.entries(MONSTER_TYPES)) {
  const g = buildMonster(type);
  let meshes = 0, visible = 0, uncullable = true;
  g.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      if (o.visible) visible++;
      if (o.frustumCulled) uncullable = false;
    }
  });
  const box = new THREE.Box3().setFromObject(g);
  const height = box.max.y - box.min.y;
  check(meshes >= 4 && visible === meshes, `${type}: ${meshes} meshes, all visible`);
  check(uncullable, `${type}: frustumCulled disabled (never culled)`);
  if (TALL[type]) check(height > TALL[type] * 0.8, `${type}: tall silhouette (h=${height.toFixed(2)}m)`);
  if (type !== 'shadow' && type !== 'mimic' && type !== 'deepone') {
    check(!!g.userData.head, `${type}: has head hook`);
  }
  if (['hunter', 'runner', 'crawler', 'bonefiend', 'ceiling', 'deepone', 'ambusher', 'stalker', 'falseplayer'].includes(type)) {
    check(!!g.userData.jaw, `${type}: has attack-jaw hook`);
  }
  const limbs = g.userData.limbs || [];
  // runner keeps only its powerful legs in u.limbs (arms are glued to the
  // chest by design); deepone is armless too. everyone else animates 4+.
  if (!['shadow', 'mimic', 'siren', 'runner', 'deepone'].includes(type)) {
    check(limbs.length >= 4, `${type}: has ${limbs.length} animated limbs`);
  }
  // materials are real three materials with sane colors (never fully transparent)
  let opaque = true, stdMats = 0;
  g.traverse((o) => {
    if (o.isMesh && o.material) {
      if (o.material.transparent && o.material.opacity < 0.2) opaque = false;
      if (o.material.isMeshStandardMaterial || o.material.isMeshBasicMaterial) stdMats++;
    }
  });
  check(opaque && stdMats === meshes, `${type}: all materials opaque and valid`);
}

console.log(`\n${pass} passed, ${fail} failed`);
