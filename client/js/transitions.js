// ============================================================================
// TRANSITIONS — how each level BEGINS, once the objective gate has opened.
//
// Unlike the chapter epilogue (a subtitle), a transition is a short, distinct
// event: the fall, the door, the machine lurch, the flood, waking at a desk,
// the lift, the ascent. Each `kind` drives the camera and a full-screen effect
// for ~7-9 seconds while the new world streams underneath, then hands control
// back. Purely local: every client runs its own copy from the synced level, so
// no extra network state is needed.
// ============================================================================
import * as THREE from 'three';
import { prerollFor } from './story.js';

export class TransitionSequence {
  constructor(scene, camera, player, engine, audio, level, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.engine = engine;
    this.audio = audio;
    this.level = level;
    this.script = prerollFor(level);
    this.kind = this.script.kind;
    this.onCard = opts.onCard || (() => {});
    this.onLine = opts.onLine || (() => {});
    this.onHint = opts.onHint || (() => {});
    this.onDone = opts.onDone || (() => {});
    this.dur = { fall: 8.5, door: 7, lurch: 8, flood: 8.5, wake: 7.5, elevator: 7.5, ascent: 9 }[this.kind] || 7.5;
    this.t = 0;
    this.lineIdx = 0;
    this.typed = 0;
    this.done = false;
    this._fired = false;
    this._flash = 1; // 1 = black, 0 = clear (local overlay alpha)

    this._look = REVEALS[this.kind] || REVEALS.fall;
    this._saved = {
      bg: scene.background && scene.background.isColor ? scene.background.clone() : null,
      fogColor: scene.fog ? scene.fog.color.clone() : null,
      fogDensity: scene.fog ? scene.fog.density : 0.05,
    };
    this.group = new THREE.Group();
    this.group.name = 'transition-set';
    this.scene.add(this.group);
    this._build();
    this.onCard(this.script.card || null);
    this.onHint(true);
    this._sfx();
  }

  _build() {
    // overlays ride on top of the world: a whiteout plane for door/ascent, a
    // water sheet for flood, a dark body for fall/wake/lurch.
    this._sheet = new THREE.Mesh(new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, fog: false, depthTest: false }));
    this._sheet.renderOrder = 999;
    this.camera.add(this._sheet);
    this._sheet.position.set(0, 0, -0.5);

    if (this.kind === 'fall') {
      this._streaks = [];
      for (let i = 0; i < 30; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 4 + Math.random() * 14, 0.05),
          new THREE.MeshBasicMaterial({ color: 0x8fb6d8, transparent: true, opacity: 0, fog: false }));
        const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 10;
        m.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 40, Math.sin(a) * r);
        this.camera.add(m);
        this._streaks.push(m);
      }
    }
    if (this.kind === 'flood') {
      this._water = true;
    }
    if (this.kind === 'elevator') {
      // sliding metal doors that part to reveal the floor
      const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.5, metalness: 0.6 });
      this._doorL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 0.06), mat);
      this._doorR = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 0.06), mat);
      this._doorL.position.set(-0.35, 1.2, -1.2);
      this._doorR.position.set(0.35, 1.2, -1.2);
      this.camera.add(this._doorL); this.camera.add(this._doorR);
    }
  }

  _sfx() {
    const a = this.audio;
    if (!a) return;
    try {
      switch (this.kind) {
        case 'fall': a.fallWhoosh(3.0); a.subDrop(32, 2.4); break;
        case 'door': a.doorCreak(0, 0); a.doorSlam(2, 0); break;
        case 'lurch': a.machineLurch(2.2); break;
        case 'flood': a.waterSurge(2.6); break;
        case 'wake': a.fluorescentBurst(); a.doorCreak(0, 0); break;
        case 'elevator': a.elevatorChime(); break;
        case 'ascent': a.subDrop(28, 3.0); a.fallWhoosh(3.4); break;
      }
    } catch (e) { /* ignore */ }
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    const lines = this.script.lines || [];
    const full = lines[this.lineIdx] || '';
    if (full) {
      this.typed = Math.min(full.length, this.typed + dt * 30);
      this.onLine(full.slice(0, this.typed | 0));
    }
    const per = Math.max(1.5, (this.dur - 1.5) / Math.max(1, lines.length));
    if (this.lineIdx < lines.length - 1 && this.typed >= full.length && this.t >= per * (this.lineIdx + 1)) {
      this.lineIdx++; this.typed = 0;
    }

    this._animate(dt);
    if (this.t >= this.dur) { this.done = true; this.onDone(); }
  }

  _animate(dt) {
    const cam = this.camera;
    const p = Math.min(1, this.t / this.dur);
    const k = 1 - Math.pow(0.02, dt);

    // reveal the world as the transition plays out
    const targetAlpha = this._look.alpha(p);
    this._sheet.material.opacity += (targetAlpha - this._sheet.material.opacity) * (this.kind === 'fall' ? 0.5 : k);
    this._sheet.material.color.lerp(new THREE.Color(this._look.sheet), k);

    // look (fog/bg) eases from the reveal palette to the level under it
    this._revealT = (this._revealT ?? 0) + dt;
    if (this._revealT > this.dur * 0.4) this._restoreLook(k);

    // per-kind camera
    switch (this.kind) {
      case 'fall':
        cam.position.set(Math.sin(this.t * 1.4) * 1.2, 4 - p * 4, Math.sin(this.t) * 1.2);
        cam.rotation.set(p * 1.8, this.t * 1.4, this.t * 2.2);
        for (const m of (this._streaks || [])) {
          m.material.opacity = 0.6 * (1 - p);
          m.position.y += dt * 30;
          if (m.position.y > 24) m.position.y -= 48;
        }
        break;
      case 'door':
        cam.rotation.set(-0.1 * (1 - p), 0, Math.sin(this.t * 2) * 0.02);
        break;
      case 'lurch':
        cam.position.set(Math.sin(this.t * 11) * 0.03, 1.6, 0);
        cam.rotation.set(0, 0, Math.sin(this.t * 9) * 0.03 * (1 - p));
        break;
      case 'flood':
        cam.position.set(0, 1.6 - (1 - p) * 0.9, 0);
        cam.rotation.set(Math.sin(this.t * 3) * 0.03 * (1 - p), Math.sin(this.t) * 0.05, 0);
        break;
      case 'wake':
        cam.position.set(0, 1.6 - (1 - p) * 0.6, 0);
        cam.rotation.set(-0.5 * (1 - p), Math.sin(this.t * 0.8) * 0.1 * (1 - p), Math.sin(this.t * 4) * 0.01 * (1 - p));
        break;
      case 'elevator': {
        cam.rotation.set(0, 0, 0);
        const open = Math.min(1, this.t / (this.dur * 0.5));
        if (this._doorL) this._doorL.position.x = -0.35 - open * 0.5;
        if (this._doorR) this._doorR.position.x = 0.35 + open * 0.5;
        cam.rotation.y = Math.sin(this.t * 0.6) * 0.08;
        break;
      }
      case 'ascent':
        cam.position.set(0, p * 2.2, 0);
        cam.rotation.set(Math.sin(this.t * 2) * 0.04 * (1 - p), 0, Math.sin(this.t * 1.3) * 0.02);
        break;
    }
    if (this.engine && this.engine.bumpGlitch) {
      this.engine.bumpGlitch((this.kind === 'fall' || this.kind === 'ascent') ? 0.9 * (1 - p) : 0.4 * (1 - p));
    }
  }

  _restoreLook(k) {
    if (this._saved.bg && this.scene.background && this.scene.background.isColor) this.scene.background.lerp(this._saved.bg, k * 0.6);
    if (this.scene.fog && this._saved.fogColor) {
      this.scene.fog.color.lerp(this._saved.fogColor, k * 0.6);
      this.scene.fog.density += (this._saved.fogDensity - this.scene.fog.density) * k * 0.6;
    }
  }

  dispose() {
    for (const o of [this._sheet, ...(this._streaks || []), this._doorL, this._doorR].filter(Boolean)) {
      o.parent && o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    }
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }
    });
    if (this._saved.bg && this.scene.background && this.scene.background.isColor) this.scene.background.copy(this._saved.bg);
    if (this.scene.fog && this._saved.fogColor) {
      this.scene.fog.color.copy(this._saved.fogColor);
      this.scene.fog.density = this._saved.fogDensity;
    }
  }
}

// Reveal palettes: `alpha(p)` returns the blackout/sheet opacity over the
// transition's normalized progress p, `sheet` is the sheet colour.
const REVEALS = {
  fall:     { sheet: 0x05060a, alpha: (p) => Math.max(0, 1 - p * 2.2) },
  door:     { sheet: 0xffffff, alpha: (p) => p < 0.25 ? 1 : Math.max(0, 1 - (p - 0.25) * 2.2) },
  lurch:    { sheet: 0x10100e, alpha: (p) => Math.max(0, 1 - p * 1.6) },
  flood:    { sheet: 0x0a1a1a, alpha: (p) => Math.max(0, 1 - p * 1.4) },
  wake:     { sheet: 0xf2ead0, alpha: (p) => p < 0.3 ? 1 : Math.max(0, 1 - (p - 0.3) * 2.0) },
  elevator: { sheet: 0x14100c, alpha: (p) => Math.max(0, 1 - p * 1.6) },
  ascent:   { sheet: 0xffffff, alpha: (p) => Math.max(0, 1 - p * 0.7) },
};
