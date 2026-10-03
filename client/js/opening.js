// ============================================================================
// OPENING — the cold open. A short, self-contained film that runs before the
// player ever sees the Backrooms: an ordinary walk home, the world going subtly
// wrong, the floor giving way, the fall, the landing in the yellow.
//
// Like ending.js, this module owns its own prop geometry, camera, atmosphere
// and DOM card, and never touches the network or the multiplayer world. main.js
// switches to gameState 'opening', hands it update(dt), and gets control back
// via onDone. The Backrooms world is streamed underneath (pre-loaded) so the
// hand-off is seamless — the opening just hides it behind fog until the land
// phase, then reveals it.
// ============================================================================
import * as THREE from 'three';
import { OPENING } from './story.js';

const LOOKS = {
  street: { bg: 0x0a0c14, fog: 0x0a0c14, density: 0.035, amb: 0x1c2233, ambI: 0.55, lamp: 1.0, surface: true, streak: false, crack: false },
  wrong:  { bg: 0x0a0b10, fog: 0x0a0b10, density: 0.05, amb: 0x171b26, ambI: 0.42, lamp: 0.7, surface: true, streak: false, crack: false },
  crack:  { bg: 0x070810, fog: 0x070810, density: 0.06, amb: 0x12151d, ambI: 0.3, lamp: 0.5, surface: true, streak: false, crack: true },
  fall:   { bg: 0x05060a, fog: 0x05060a, density: 0.03, amb: 0x0a0a12, ambI: 0.2, lamp: 0.0, surface: false, streak: true, crack: false },
  land:   { bg: 0x191408, fog: 0x191408, density: 0.055, amb: 0x33301f, ambI: 0.6, lamp: 0.0, surface: false, streak: false, crack: false },
  wake:   { bg: 0x191408, fog: 0x191408, density: 0.05, amb: 0x38331f, ambI: 0.62, lamp: 0.0, surface: false, streak: false, crack: false },
};

export class OpeningSequence {
  constructor(scene, camera, player, engine, audio, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.engine = engine;
    this.audio = audio;
    this.onCard = opts.onCard || (() => {});
    this.onLine = opts.onLine || (() => {});
    this.onHint = opts.onHint || (() => {});
    this.onDone = opts.onDone || (() => {});
    this.onPhase = opts.onPhase || (() => {});

    this.phases = OPENING.phases;
    this.phaseIdx = -1;
    this.t = 0;          // seconds into the current phase
    this.T = 0;          // total elapsed
    this.lineIdx = 0;
    this.typed = 0;
    this.done = false;
    this._fired = new Set();
    this._playingStreet = false;
    this._streetOpacity = 1;
    this._streaksVisible = false;

    this._saved = {
      bg: scene.background && scene.background.isColor ? scene.background.clone() : null,
      fogColor: scene.fog ? scene.fog.color.clone() : null,
      fogDensity: scene.fog ? scene.fog.density : 0.05,
    };
    this.group = new THREE.Group();
    this.group.name = 'opening-set';
    // the street stage floats high above the Backrooms (which pre-streams at
    // ground level); the fall phase sinks it back down so the landing happens
    // in the real corridors with nothing visible bleeding through
    this.originY = 260;
    this.group.position.set(0, this.originY, 0);
    this.scene.add(this.group);

    this._buildStreet();
    this._buildStreaks();
    this._enterPhase(0, true);
  }

  _buildStreet() {
    // wet asphalt road + sidewalk running into the distance
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 400),
      new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.4, metalness: 0.1 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -120);
    this.group.add(road);

    const walkMat = new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: 1 });
    for (const sx of [-6.6, 6.6]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 400), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(sx, 0.02, -120);
      this.group.add(walk);
    }
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 1 });
    for (const sx of [-4.4, 4.4]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 400), curbMat);
      c.position.set(sx, 0.07, -120);
      this.group.add(c);
    }

    // buildings: dark silhouettes, a broken wall of boxes
    const bMat = new THREE.MeshStandardMaterial({ color: 0x090b10, roughness: 1 });
    for (let i = 0; i < 46; i++) {
      const side = i % 2 ? 1 : -1;
      const z = -8 - i * 9 - (i % 3) * 2;
      const w = 6 + (i * 13) % 7;
      const h = 9 + (i * 29) % 22;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8), bMat);
      b.position.set(side * (11 + (i % 4)), h / 2, z);
      this.group.add(b);
      if (i % 4 === 0) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0),
          new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
        win.position.set(side * (11 + (i % 4)) - side * (w / 2 + 0.01), 3 + (i % 5), z + 1);
        win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.group.add(win);
      }
    }

    // street lamps down the right sidewalk — the things that drift "too far apart"
    this._lamps = [];
    for (let i = 0; i < 14; i++) {
      const z = -6 - i * 16;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.8 }));
      pole.position.set(0, 2.6, 0);
      g.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.28),
        new THREE.MeshBasicMaterial({ color: 0xffd48a }));
      head.position.set(-0.3, 5.1, 0);
      g.add(head);
      const light = new THREE.PointLight(0xffc46a, 6, 12, 2);
      light.position.set(-0.3, 5.0, 0);
      g.add(light);
      g.position.set(6.6, 0, z);
      this.group.add(g);
      this._lamps.push({ g, light, head, base: z });
    }

    // a parked car on the corner (the one that "hasn't moved")
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.35, metalness: 0.4 }));
    body.position.y = 0.6; car.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 0.3, metalness: 0.3 }));
    cab.position.set(0, 1.15, -0.2); car.add(cab);
    car.position.set(-6.2, 0, -20);
    car.rotation.y = 0.05;
    this.group.add(car);
    this._car = car;

    // the crack: a hairline of cold light opening in the sidewalk ahead
    this._crack = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 60),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, fog: false }));
    this._crack.rotation.x = -Math.PI / 2;
    this._crack.position.set(0, 0.04, -14);
    this.group.add(this._crack);

    this._sky = new THREE.Mesh(new THREE.SphereGeometry(150, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0x0a0c14, side: THREE.BackSide, fog: false }));
    this.group.add(this._sky);

    this._amb = new THREE.AmbientLight(0x1c2233, 0.5);
    this.group.add(this._amb);
  }

  _buildStreaks() {
    // the fall: bars of light racing past the camera. Parented to the camera so
    // they surround it no matter how far the camera descends.
    this._streaks = [];
    for (let i = 0; i < 44; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.06 + Math.random() * 0.1, 8 + Math.random() * 22, 0.06),
        new THREE.MeshBasicMaterial({ color: 0x8fb6d8, transparent: true, opacity: 0, fog: false }));
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 14;
      m.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 70, Math.sin(a) * r);
      this.camera.add(m);
      this._streaks.push(m);
    }
  }

  _enterPhase(i, first = false) {
    const p = this.phases[i];
    if (!p) return;
    this.phaseIdx = i;
    this.t = 0;
    this.lineIdx = 0;
    this.typed = 0;
    this._look = LOOKS[p.world] || LOOKS.street;
    this.onCard(p.card || null);
    if (!first) this.onPhase(p.key);
    this.onHint(i > 0);
    this._sfx(p);
  }

  _sfx(p) {
    for (const s of p.sfx || []) {
      if (this._fired.has(p.key + ':' + s)) continue;
      this._fired.add(p.key + ':' + s);
      this._play(s);
    }
  }

  _play(s) {
    const a = this.audio;
    if (!a) return;
    try {
      switch (s) {
        case 'streetAmb': a.startStreetAmbience(); this._playingStreet = true; break;
        case 'steps': a.distantFootsteps(2); break;
        case 'stepsSlow': a.distantFootsteps(2); break;
        case 'hum': break; // carried by the street bed / backrooms ambience
        case 'crack': a.concreteCrack(); break;
        case 'subDrop': a.subDrop(46, 1.4); break;
        case 'subDrop2': a.subDrop(34, 2.2); break;
        case 'whoosh': a.fallWhoosh(2.6); break;
        case 'land': a.landing(); break;
        case 'fluores': a.fluorescentBurst(); break;
      }
    } catch (e) { /* audio must never break the cinematic */ }
  }

  update(dt) {
    if (this.done) return;
    const p = this.phases[this.phaseIdx];
    this.T += dt;
    this.t += dt;

    const full = (p.lines && p.lines[this.lineIdx]) || '';
    if (full) {
      this.typed = Math.min(full.length, this.typed + dt * 30);
      this.onLine(full.slice(0, this.typed | 0));
    }

    if (p.lines && this.lineIdx < p.lines.length - 1) {
      const per = Math.max(1.6, (p.dur - 1.2) / p.lines.length);
      if (this.typed >= full.length && this.t >= per * (this.lineIdx + 1)) {
        this.lineIdx++; this.typed = 0;
      }
    }

    this._animateCamera(dt);
    this._tickEnvironment(dt);

    if (this.t >= p.dur && this.phaseIdx < this.phases.length - 1) {
      this._enterPhase(this.phaseIdx + 1);
    } else if (this.phaseIdx === this.phases.length - 1 && this.t >= p.dur) {
      this.done = true;
      this.onDone();
    }
  }

  _tickEnvironment(dt) {
    const lk = this._look || LOOKS.street;
    const k = 1 - Math.pow(0.02, dt);
    const scene = this.scene;
    if (!scene.fog) scene.fog = new THREE.FogExp2(lk.fog, lk.density);
    scene.fog.color.lerp(new THREE.Color(lk.fog), k);
    scene.fog.density += (lk.density - scene.fog.density) * k;
    if (scene.background && scene.background.isColor) scene.background.lerp(new THREE.Color(lk.bg), k);
    else scene.background = new THREE.Color(lk.bg);

    const surfaceOp = lk.surface ? 1 : 0;
    this._streetOpacity = this._streetOpacity + (surfaceOp - this._streetOpacity) * k;
    const vis = this._streetOpacity > 0.02;
    for (const c of this.group.children) {
      if (c === this._sky || c === this._amb || this._streaks.includes(c)) continue;
      c.visible = vis;
    }
    this._sky.visible = lk.surface;
    if (this._sky.visible) this._sky.material.color.lerp(new THREE.Color(lk.bg), k);

    const lampI = lk.lamp;
    for (const L of this._lamps) {
      L.light.intensity += ((lampI > 0 ? 6 * lampI : 0) - L.light.intensity) * k;
      L.head.material.color.setHex(lampI > 0 ? 0xffd48a : 0x0a0a0a);
    }
    if (this.phaseIdx >= 1 && this.phaseIdx <= 2) {
      for (let i = 0; i < this._lamps.length; i++) {
        const L = this._lamps[i];
        const want = L.base - i * (this.phaseIdx === 2 ? 1.6 : 0.9);
        L.g.position.z += (want - L.g.position.z) * Math.min(1, dt * 0.6);
      }
    }

    if (!lk.surface && this._playingStreet) { this.audio && this.audio.stopStreetAmbience(); this._playingStreet = false; }

    if (this._crack) {
      const want = lk.crack ? 0.9 : 0;
      this._crack.material.opacity += (want - this._crack.material.opacity) * k;
      if (lk.crack) this._crack.scale.x = 1 + Math.sin(this.T * 3) * 0.4;
    }

    if (this._streaks) {
      const on = lk.streak;
      this._streaksVisible = on;
      const camY = this.camera.position.y;
      for (const m of this._streaks) {
        m.material.opacity += ((on ? 0.55 : 0) - m.material.opacity) * k;
        if (on) {
          // keep the bars around the descending camera
          m.position.y = camY + ((Math.random() * 70) - 35 + m.position.y * 0.02);
          m.position.y += dt * (8 + Math.abs(m.position.x) % 3 * 4);
        }
      }
    }

    if (this._amb) {
      this._amb.color.lerp(new THREE.Color(lk.amb), k);
      this._amb.intensity += (lk.ambI - this._amb.intensity) * k;
    }
  }

  _animateCamera(dt) {
    const cam = this.camera;
    const key = this.phases[this.phaseIdx].key;
    const oy = this.originY;
    switch (key) {
      case 'street': {
        const z = -1 - this.t * 1.35;
        cam.position.set(0.4 + Math.sin(this.t * 1.1) * 0.03, oy + 1.62 + Math.sin(this.t * 2.2) * 0.03, z);
        cam.rotation.set(Math.sin(this.t * 1.2) * 0.01, Math.sin(this.t * 0.4) * 0.05, Math.sin(this.t * 1.6) * 0.004);
        break;
      }
      case 'wrong': {
        const z = -21 - this.t * 0.9;
        cam.position.set(0.4 + Math.sin(this.t * 0.9) * 0.05, oy + 1.62 + Math.sin(this.t * 1.7) * 0.03, z);
        cam.rotation.set(Math.sin(this.t * 1.4) * 0.02, Math.sin(this.t * 0.5) * 0.16, Math.sin(this.t * 2.4) * 0.01);
        break;
      }
      case 'crack': {
        cam.position.set(0.4, oy + 1.62, -30);
        const k = Math.min(1, this.t / 1.4);
        cam.rotation.set(-1.25 * k, 0.02, Math.sin(this.t * 8) * 0.008 * k);
        break;
      }
      case 'fall': {
        // descend from the high street stage down into the real corridors
        const p = Math.min(1, this.t / this.phases[this.phaseIdx].dur);
        const ease = p * p * (3 - 2 * p);
        const y = (oy + 1.2) * (1 - ease) + 1.2 * ease;
        cam.position.set(Math.sin(this.t * 1.3) * 1.4, y, -30 + Math.sin(this.t * 0.7) * 2);
        cam.rotation.set(this.t * 2.6, this.t * 1.7, this.t * 3.1);
        break;
      }
      case 'land': {
        const y = Math.min(1.62, 0.5 + this.t * 0.5);
        cam.position.set(0, y, 0);
        const roll = Math.max(0, 0.5 - this.t * 0.25) * Math.sin(this.t * 5);
        cam.rotation.set(-0.35 * Math.max(0, 1 - this.t) + Math.sin(this.t * 1.5) * 0.01, 0.1, roll);
        break;
      }
      case 'wake':
      default: {
        cam.position.set(0, 1.62, 0);
        cam.rotation.set(0, Math.sin(this.t * 0.3) * 0.1, Math.sin(this.t * 1.4) * 0.003);
        break;
      }
    }
    if (this.engine && this.engine.bumpGlitch) {
      if (key === 'fall') this.engine.bumpGlitch(0.8 + Math.sin(this.T * 6) * 0.5);
      else if (key === 'crack') this.engine.bumpGlitch(0.5);
    }
  }

  dispose() {
    this.audio && this.audio.stopStreetAmbience();
    for (const m of (this._streaks || [])) {
      this.camera.remove(m);
      m.geometry.dispose(); m.material.dispose();
    }
    this._streaks = [];
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }
    });
    if (this._saved) {
      if (this._saved.bg && this.scene.background && this.scene.background.isColor) this.scene.background.copy(this._saved.bg);
      if (this.scene.fog && this._saved.fogColor) {
        this.scene.fog.color.copy(this._saved.fogColor);
        this.scene.fog.density = this._saved.fogDensity;
      }
    }
  }
}
