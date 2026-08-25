// Procedural readable notes — found documents with unsettling text.
import { rngFrom, hashStr, pick } from './rng.js';

const NOTE_TEMPLATES = [
  () => 'IT WATCHES THROUGH THE LIGHTS. STAY WHERE THE LIGHTS ARE DEAD.',
  () => 'DAY 4. THE HALLWAYS REPEAT BUT THE STAIRS ARE NEW.',
  () => 'DO NOT FOLLOW THE HUM. THE HUM IS NOT ELECTRICITY.',
  () => 'sara if you find this — the yellow rooms END at the pipes. keep going down.',
  (rng) => `COUNTED ${2 + ((rng() * 7) | 0)} PILLARS. THERE WERE ${8 + ((rng() * 4) | 0)} YESTERDAY.`,
  () => 'THE CARPET IS WARM. WHY IS THE CARPET WARM.',
  () => 'I HEARD FOOTSTEPS BEHIND ME. I DID NOT TURN AROUND. YOU SHOULD NOT EITHER.',
  () => 'WATER LEVEL RISING ON 3. DOORS SWELL SHUT. MOVE BEFORE THE FLOOD.',
  () => 'the mannequins are not heavy. someone moves them. they move them nightly.',
  () => 'EXIT SIGN = LIE. THERE IS NO EXIT. THERE IS ONLY MORE.',
  (rng) => `room ${['A', 'B', 'K'][(rng() * 3) | 0]}${2 + ((rng() * 40) | 0)} IS SAFE. THE REST ARE NOT.`,
  () => 'IF THE LIGHTS GO OUT IN A PATTERN, STAND STILL. IT LEARNS FROM MOVEMENT.',
  () => 'we set up camp in the hotel corridor. the rooms change numbers. check the locks.',
  () => 'IT MIMICS YOUR FRIENDS. COUNT THE ARMS. COUNT THE ARMS.',
  () => 'the elevator music stopped months ago. nobody turned it off.',
];

export function makeNoteMesh(THREE, noteId, mats) {
  const geom = new THREE.PlaneGeometry(0.21, 0.3);
  const mesh = new THREE.Mesh(geom, mats.paper);
  return mesh;
}

export function noteText(seed, level, id) {
  const rng = rngFrom(hashStr(seed, `note:${level}:${id}`));
  const pickFn = NOTE_TEMPLATES[(rng() * NOTE_TEMPLATES.length) | 0];
  return pickFn(rng);
}
