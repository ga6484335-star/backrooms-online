// ============================================================================
// ENDING — the final cinematic. "CHAPTER ONE — THE PLAYBACK".
//
// After the party completes Level 6 and walks through the exit, the game does
// NOT show a win screen. It stages a short film:
//   door → whiteout → an impossible surface world → the others → calm →
//   the REC light is still on → the sky has a seam → the world tiles → the
//   reveal: the players were never the ones who ARRIVED, they are the PLAYBACK,
//   and the recording is starting again.
//
// Self-contained: owns its own outdoor prop geometry, atmosphere lerps and DOM
// letterbox. main.js switches to gameState 'ending' and forwards update(dt,
// time). Nothing here touches the network or the multiplayer world.
// ============================================================================
import * as THREE from 'three';
import { ENDING } from './story.js';
import { makeAvatar } from './avatar.js';

const SUN = 0xfff4d8;

export class EndingSequence {
  constructor(scene, camera, player, engine, audio, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.engine = engine;
    this.audio = audio;
    this.onCard = opts.onCard || (() => {});
    this.onDone = opts.onDone || (() => {});
    this.onTail = opts.onTail || (() => {});
    this.duration = ENDING.stages[ENDING.stages.length - 1].at + 10;
    this.t = 0;
    this.stageIdx = -1;
    this.done = false;
    this.group = new THREE.Group();
    this.group.name = 'ending-set';
    this.scene.add(this.group);
    this._sky = null;
    this._sun = null;
    this._ground = null;
    this._seam = null;
    this._figures = [];
    this._backroomsBg = null;
    this._saved = null;
    this._cards = new Set();
    this._buildSet();
  }

  // ---------------------------------------------------------------- set build
  _buildSet() {
    // sky dome — a big inverted sphere, unlit, colour-lerped by `env`
    const skyGeo = new THREE.SphereGeometry(180, 24, 16);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x0a0a10, side: THREE.BackSide, fog: false });
    this._sky = new THREE.Mesh(skyGeo, skyMat);
    this._sky.position.y = 0;
    this.group.add(this._sky);

    // ground — an infinite-looking plane that starts flooded/dark and blooms
    const gMat = new THREE.MeshStandardMaterial({ color: 0x10140c, roughness: 1, metalness: 0 });
    this._ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), gMat);
    this._ground.rotation.x = -Math.PI / 2;
    this._ground.position.y = 0;
    this.group.add(this._ground);

    // warm sun
    this._sun = new THREE.DirectionalLight(SUN, 0);
    this._sun.position.set(30, 40, -60);
    this.group.add(this._sun);
    this._hemi = new THREE.HemisphereLight(0xbfe0ff, 0x30401c, 0);
    this.group.add(this._hemi);

    // a low ridge of "trees"/buildings on the horizon so the world reads real
    const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x2a3620, roughness: 1 });
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 90 + (i % 5) * 3;
      const h = 6 + ((i * 37) % 11);
      const m = new THREE.Mesh(new THREE.BoxGeometry(5, h, 5), ridgeMat);
      m.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
      this.group.add(m);
    }

    // the others: reuse the game's own avatars so they read as your teammates
    const names = ['WITNESS', 'ARCHIVIST', 'SIGNAL', 'OPERATOR'];
    for (let i = 0; i < 3; i++) {
      const av = makeAvatar(['#8fa3c7', '#c78f8f', '#a3c78f'][i], names[i]);
      av.group.position.set(-3 + i * 3, 0, -12 - i);
      av.group.visible = false;
      this.group.add(av.group);
      this._figures.push(av.group);
    }

    // the seam: a hairline of static across the sky, revealed at the twist
    const seamGeo = new THREE.PlaneGeometry(360, 0.35);
    this._seam = new THREE.Mesh(seamGeo, new THREE.MeshBasicMaterial({
      color: 0x05050a, transparent: true, opacity: 0, fog: false, side: THREE.DoubleSide,
    }));
    this._seam.position.set(0, 46, -120);
    this.group.add(this._seam);

    // remember the backrooms look so we can fall back into it at the end
    this._saved = {
      bg: this.scene.background ? (this.scene.background.isColor ? this.scene.background.clone() : null) : null,
      fogColor: this.scene.fog ? this.scene.fog.color.clone() : null,
      fogDensity: this.scene.fog ? this.scene.fog.density : 0.05,
    };
    this._backroomsBg = new THREE.Color(0x191408);
  }

  // ------------------------------------------------------------------- update
  update(dt) {
    this.t += dt;
    // advance stage cards
    while (this.stageIdx + 1 < ENDING.stages.length && this.t >= ENDING.stages[this.stageIdx + 1].at) {
      this.stageIdx++;
      this._enterStage(ENDING.stages[this.stageIdx]);
    }
    if (this.t >= ENDING.stages[ENDING.stages.length - 1].at) {
      // tail lines appear under the final card
      if (!this._tailShown && this.t >= ENDING.stages[ENDING.stages.length - 1].at + 2) {
        this._tailShown = true;
        this.onTail(ENDING.tail);
      }
    }
    this._animateCamera(dt);
    if (!this.done && this.t >= this.duration) {
      this.done = true;
      this.onDone();
    }
  }

  _enterStage(st) {
    if (this._cards.has(st.key)) return;
    this._cards.add(st.key);
    this.onCard(st.card, st);
    if (st.glitch && this.engine && this.engine.bumpGlitch) this.engine.bumpGlitch(st.glitch);
  }

  _animateCamera(dt) {
    const t = this.t;
    const cam = this.camera;
    // gentle dolly along +Z looking toward the horizon; slow, camcorder drift
    const drift = Math.sin(t * 0.5) * 0.06;
    let targetY = 1.62;
    if (t < 6) {
      // inside the gate, pushing forward through the bright mouth
      cam.position.set(Math.sin(t * 0.6) * 0.1, 1.62, -3 + t * 0.9);
      cam.lookAt(0, 1.5, 40);
    } else {
      // outside: stand and slowly turn to take in the world
      cam.position.set(drift * 3, targetY, (t - 6) * 0.25);
      const yaw = Math.sin((t - 6) * 0.12) * 0.5;
      const lookX = Math.sin(yaw) * 60;
      const lookZ = 60 * Math.cos(yaw);
      cam.lookAt(lookX, 2.2 + Math.sin(t * 0.3) * 0.3, lookZ);
      if (this._seam) this._seam.lookAt(cam.position);
    }
    cam.rotation.z += Math.sin(t * 1.7) * 0.0006; // handheld micro-roll
  }

  // Environment is keyed off the newest stage's `env` + `glitch`, applied as a
  // continuous crossfade so nothing pops.
  tickEnvironment() {
    const st = ENDING.stages[Math.max(0, this.stageIdx)] || ENDING.stages[0];
    const env = st.env || 'normal';
    const target = ENV_PRESETS[env] || ENV_PRESETS.normal;
    const k = 1 - Math.pow(0.001, 1 / 60); // smoothing at 60fps baseline
    const scene = this.scene;
    if (!scene.fog) scene.fog = new THREE.FogExp2(target.fog, target.density);
    scene.fog.color.lerp(new THREE.Color(target.fog), k);
    scene.fog.density += (target.density - scene.fog.density) * k;
    if (scene.background && scene.background.isColor) scene.background.lerp(new THREE.Color(target.bg), k);
    else scene.background = new THREE.Color(target.bg);

    if (this._sky) {
      this._sky.material.color.lerp(new THREE.Color(target.sky), k);
      this._sky.visible = target.surface;
    }
    if (this._ground) {
      this._ground.material.color.lerp(new THREE.Color(target.ground), k);
      this._ground.visible = target.surface;
    }
    if (this._sun) this._sun.intensity += (target.sun - this._sun.intensity) * k;
    if (this._hemi) this._hemi.intensity += (target.hemi - this._hemi.intensity) * k;
    for (const f of this._figures) f.visible = target.figures;

    // the seam and the sky-crack only appear near the twist
    const crack = env === 'crack' || env === 'void';
    if (this._seam) this._seam.material.opacity += ((crack ? 0.85 : 0) - this._seam.material.opacity) * k;
  }

  tickAnimation(dt) {
    this.tickEnvironment();
    // figures settle and slowly turn so they are not statues
    for (const g of this._figures) g.rotation.y += dt * 0.05;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }
    });
    // restore the backrooms look for the menu/next chapter
    if (this._saved) {
      if (this._saved.bg && this.scene.background && this.scene.background.isColor) this.scene.background.copy(this._saved.bg);
      if (this.scene.fog && this._saved.fogColor) {
        this.scene.fog.color.copy(this._saved.fogColor);
        this.scene.fog.density = this._saved.fogDensity;
      }
    }
  }
}

// Atmosphere presets. `surface` toggles the outdoor set (sky/ground/figures);
// `sun`/`hemi` drive the daylight; fog/bg handle the found-footage grade.
const ENV_PRESETS = {
  normal: { bg: 0x050306, fog: 0x050306, density: 0.11, sky: 0x05050a, ground: 0x10140c, sun: 0, hemi: 0, surface: false, figures: false },
  dawn:   { bg: 0xdfe6ef, fog: 0xdfe6ef, density: 0.02, sky: 0xcfe0f2, ground: 0x4a5238, sun: 0.6, hemi: 0.5, surface: true, figures: false },
  day:    { bg: 0x9fc4e8, fog: 0x9fc4e8, density: 0.012, sky: 0x7fb0e0, ground: 0x4f6a34, sun: 1.5, hemi: 0.9, surface: true, figures: true },
  dusk:   { bg: 0xe8b48a, fog: 0xe8b48a, density: 0.016, sky: 0xd99a6c, ground: 0x3f4a2a, sun: 1.1, hemi: 0.6, surface: true, figures: true },
  dread:  { bg: 0x6a5a4a, fog: 0x6a5a4a, density: 0.02, sky: 0x8a7a68, ground: 0x3a4026, sun: 0.8, hemi: 0.4, surface: true, figures: true },
  crack:  { bg: 0x3a3020, fog: 0x3a3020, density: 0.03, sky: 0x5a4a30, ground: 0x2a3018, sun: 0.5, hemi: 0.25, surface: true, figures: true },
  void:   { bg: 0x191408, fog: 0x191408, density: 0.09, sky: 0x0a0804, ground: 0x141a10, sun: 0.1, hemi: 0.1, surface: false, figures: false },
};

export { ENV_PRESETS };
