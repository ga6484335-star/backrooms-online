// ============================================================================
// OPENING — the cold open, as a real cinematic rather than a walk-through.
//
// A short first-person film that runs before the player ever sees the Backrooms:
// an ordinary walk home after work, a street that is subtly wrong, a figure
// under a lamp, the concrete opening like a doorway, reality tearing, a long
// fall, and the landing in the yellow.
//
// It owns its own set, camera, atmosphere, a first-person body and a DOM card,
// and never touches the network or the multiplayer world. main.js switches to
// gameState 'opening', hands it update(dt), and gets control back via onDone.
// The Backrooms stream underneath so the hand-off is seamless: the set floats
// high above the corridors and the fall descends into the real level.
//
// Camera direction is per-shot (`shot`), continuity is kept in first person,
// and every line is voiced through the VoiceEngine with subtitles alongside.
// ============================================================================
import * as THREE from 'three';
import { OPENING, openingLines } from './story.js';

// Environmental palettes per `world`. `amb`/`lamps` drive the lighting mood.
const LOOKS = {
  street: { bg: 0x0d1018, fog: 0x0d1018, density: 0.028, amb: 0x20283a, ambI: 0.6, lamp: 1.0, surface: true, streak: false, crack: 0 },
  wrong:  { bg: 0x0b0c13, fog: 0x0b0c13, density: 0.042, amb: 0x1a1f2c, ambI: 0.44, lamp: 0.7, surface: true, streak: false, crack: 0 },
  crack:  { bg: 0x080911, fog: 0x080911, density: 0.055, amb: 0x14171f, ambI: 0.3, lamp: 0.45, surface: true, streak: false, crack: 1 },
  tear:   { bg: 0x05060c, fog: 0x05060c, density: 0.06, amb: 0x0e1220, ambI: 0.22, lamp: 0.2, surface: true, streak: false, crack: 2 },
  fall:   { bg: 0x04050a, fog: 0x04050a, density: 0.03, amb: 0x090a12, ambI: 0.18, lamp: 0, surface: false, streak: true, crack: 0 },
  land:   { bg: 0x191408, fog: 0x191408, density: 0.055, amb: 0x33301f, ambI: 0.6, lamp: 0, surface: false, streak: false, crack: 0 },
  wake:   { bg: 0x191408, fog: 0x191408, density: 0.05, amb: 0x38331f, ambI: 0.62, lamp: 0, surface: false, streak: false, crack: 0 },
};

const ORIGIN_Y = 260; // the street set floats this high above the corridors

export class OpeningSequence {
  constructor(scene, camera, player, engine, audio, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.engine = engine;
    this.audio = audio;
    this.voice = opts.voice || null;
    this.onCard = opts.onCard || (() => {});
    this.onLine = opts.onLine || (() => {});
    this.onHint = opts.onHint || (() => {});
    this.onDone = opts.onDone || (() => {});
    this.onPhase = opts.onPhase || (() => {});

    this.phases = OPENING.phases;
    this.phaseIdx = -1;
    this.t = 0;
    this.T = 0;
    this.lineIdx = 0;
    this.typed = 0;
    this.done = false;
    this._voicedAt = -1;      // lineIdx whose voice has been played
    this._playingStreet = false;
    this._surfaceOp = 1;       // eased visibility of the surface set
    this._fired = new Set();

    this._saved = {
      bg: scene.background && scene.background.isColor ? scene.background.clone() : null,
      fogColor: scene.fog ? scene.fog.color.clone() : null,
      fogDensity: scene.fog ? scene.fog.density : 0.05,
    };
    this._baseFov = camera.fov;
    this.group = new THREE.Group();
    this.group.name = 'opening-set';
    this.group.position.set(0, ORIGIN_Y, 0);
    this.scene.add(this.group);
    this.originY = ORIGIN_Y;

    this._buildStreet();
    this._buildBody();
    this._buildStreaks();
    this._enterPhase(0, true);
  }

  // ---------------------------------------------------------------- set build
  _buildStreet() {
    const G = this.group;
    // wet asphalt + sidewalks running into the distance
    const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 420),
      new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.42, metalness: 0.12 }));
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -140); G.add(road);

    const walkMat = new THREE.MeshStandardMaterial({ color: 0x171a20, roughness: 1 });
    for (const sx of [-6.6, 6.6]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 420), walkMat);
      walk.rotation.x = -Math.PI / 2; walk.position.set(sx, 0.02, -140); G.add(walk);
    }
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 1 });
    for (const sx of [-4.4, 4.4]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 420), curbMat);
      c.position.set(sx, 0.07, -140); G.add(c);
    }

    // buildings: dark silhouettes with the odd lit window
    const bMat = new THREE.MeshStandardMaterial({ color: 0x090b10, roughness: 1 });
    for (let i = 0; i < 52; i++) {
      const side = i % 2 ? 1 : -1;
      const z = -8 - i * 9 - (i % 3) * 2;
      const w = 6 + (i * 13) % 7;
      const h = 9 + (i * 29) % 24;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8), bMat);
      b.position.set(side * (11 + (i % 4)), h / 2, z); G.add(b);
      if (i % 4 === 0) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0),
          new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
        win.position.set(side * (11 + (i % 4)) - side * (w / 2 + 0.01), 3 + (i % 5), z + 1);
        win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; G.add(win);
      }
    }

    // street lamps down the right sidewalk — the things that drift apart
    this._lamps = [];
    for (let i = 0; i < 14; i++) {
      const z = -6 - i * 16;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.8 }));
      pole.position.set(0, 2.6, 0); g.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.28),
        new THREE.MeshBasicMaterial({ color: 0xffd48a }));
      head.position.set(-0.3, 5.1, 0); g.add(head);
      const light = new THREE.PointLight(0xffc46a, 6, 13, 2);
      light.position.set(-0.3, 5.0, 0); g.add(light);
      g.position.set(6.6, 0, z); G.add(g);
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
    for (const [wx, wz] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10),
        new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.9 }));
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.32, wz); car.add(w);
    }
    car.position.set(-6.2, 0, -20); car.rotation.y = 0.05; G.add(car);
    this._car = car;

    // the figure under the next lamp: a too-still silhouette that faces you
    const fig = new THREE.Group();
    const fMat = new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 1 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.3), fMat);
    torso.position.y = 1.15; fig.add(torso);
    const fhead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), fMat);
    fhead.position.y = 1.85; fig.add(fhead);
    const flegL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.16), fMat);
    flegL.position.set(-0.13, 0.48, 0); fig.add(flegL);
    const flegR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.95, 0.16), fMat);
    flegR.position.set(0.13, 0.48, 0); fig.add(flegR);
    fig.position.set(5.4, 0, -33); fig.visible = false; G.add(fig);
    this._figure = fig;

    // the crack: a hairline of cold light opening in the sidewalk ahead
    this._crack = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 70),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, fog: false }));
    this._crack.rotation.x = -Math.PI / 2; this._crack.position.set(0, 0.04, -16); G.add(this._crack);

    // the tear: a broad, folding sheet of wrong light that opens through the road
    this._tear = new THREE.Mesh(new THREE.PlaneGeometry(6, 90, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0, fog: false, side: THREE.DoubleSide }));
    this._tear.rotation.x = -Math.PI / 2; this._tear.position.set(0, 0.05, -16); G.add(this._tear);

    this._sky = new THREE.Mesh(new THREE.SphereGeometry(160, 20, 12),
      new THREE.MeshBasicMaterial({ color: 0x0d1018, side: THREE.BackSide, fog: false }));
    G.add(this._sky);

    this._amb = new THREE.AmbientLight(0x20283a, 0.6);
    G.add(this._amb);
  }

  // a first-person body so the walk reads as "someone walking home", not a
  // camera drifting down an empty road. Parented to the camera (which is a
  // scene node) so it holds continuity through every shot.
  _buildBody() {
    const g = new THREE.Group();
    g.name = 'opening-body';
    const coat = new THREE.MeshStandardMaterial({ color: 0x14171e, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xbf9a7d, roughness: 0.8 });

    // right hand holding the camcorder (the found-footage conceit)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.16), skin);
    hand.position.set(0.2, -0.24, -0.42); g.add(hand);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.4, metalness: 0.5 }));
    cam.position.set(0.2, -0.19, -0.5); g.add(cam);
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xff3a2a }));
    rec.position.set(0.14, -0.16, -0.6); g.add(rec);
    this._recDot = rec;

    // trouser legs swinging at the bottom of frame while walking
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.42, 0.11), coat);
    legL.position.set(-0.07, -0.5, -0.32); g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.42, 0.11), coat);
    legR.position.set(0.07, -0.5, -0.32); g.add(legR);
    this._legL = legL; this._legR = legR;

    this.body = g;
    this.body.visible = false;
    this.camera.add(g);
  }

  _buildStreaks() {
    // the fall: bars of light racing past the camera, parented to it
    this._streaks = [];
    for (let i = 0; i < 52; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.05 + Math.random() * 0.08, 8 + Math.random() * 26, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x9cc0e0, transparent: true, opacity: 0, fog: false }));
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 15;
      m.position.set(Math.cos(a) * r, (Math.random() - 0.5) * 80, Math.sin(a) * r);
      this.camera.add(m);
      this._streaks.push(m);
    }
  }

  // -------------------------------------------------------------- phase logic
  _enterPhase(i, first = false) {
    const p = this.phases[i];
    if (!p) return;
    this.phaseIdx = i;
    this.t = 0;
    this.lineIdx = 0;
    this.typed = 0;
    this._voicedAt = -1;
    this._lines = openingLines(p);
    this._look = LOOKS[p.world] || LOOKS.street;
    this.onCard(p.card || null);
    if (!first) this.onPhase(p.key);

    // the sequence is skippable from the second phase on (skip the slate first)
    this.onHint(i > 0);
    this._sfx(p);
    this._voiceLine(0);
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
        case 'hum': break;
        case 'whisper': if (a.whisper) a.whisper(2.0); break;
        case 'crack': a.concreteCrack(); break;
        case 'tear': if (a.tear) a.tear(1.5); break;
        case 'subDrop': a.subDrop(46, 1.4); break;
        case 'subDrop2': a.subDrop(34, 2.2); break;
        case 'whoosh': a.fallWhoosh(2.8); break;
        case 'land': a.landing(); break;
        case 'fluores': a.fluorescentBurst(); break;
      }
    } catch (e) { /* audio must never break the cinematic */ }
  }

  // speak the current line (called when the line index advances)
  _voiceLine(idx) {
    if (!this.voice || idx === this._voicedAt) return;
    const line = this._lines && this._lines[idx];
    if (!line) return;
    this._voicedAt = idx;
    const isRadio = /RADIO|CHANNEL|…/.test(line.text) && line.voice === 'radio';
    this.voice.speak(line.text, { mood: line.voice, onEnd: null });
    // a whisper line gets an extra closeness texture under the words
    if (line.voice === 'whisper' && this.audio && this.audio.whisper) this.audio.whisper(1.2);
    void isRadio;
  }

  update(dt) {
    if (this.done) return;
    const p = this.phases[this.phaseIdx];
    this.T += dt;
    this.t += dt;

    const line = this._lines && this._lines[this.lineIdx];
    const full = line ? line.text : '';
    if (full) {
      this.typed = Math.min(full.length, this.typed + dt * 30);
      this.onLine(full.slice(0, this.typed | 0), line.voice);
    }

    if (this._lines && this.lineIdx < this._lines.length - 1) {
      const per = Math.max(1.8, (p.dur - 1.2) / this._lines.length);
      if (this.typed >= full.length && this.t >= per * (this.lineIdx + 1)) {
        this.lineIdx++; this.typed = 0;
        this._voiceLine(this.lineIdx);
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

    // surface set visibility (street) fades out during the fall
    const surfaceOp = lk.surface ? 1 : 0;
    this._surfaceOp += (surfaceOp - this._surfaceOp) * k;
    const vis = this._surfaceOp > 0.02;
    for (const c of this.group.children) {
      if (c === this._sky || c === this._amb) continue;
      c.visible = vis;
    }
    this._sky.visible = lk.surface;
    if (this._sky.visible) this._sky.material.color.lerp(new THREE.Color(lk.bg), k);
    // the figure only exists in its shot
    if (this._figure) this._figure.visible = vis && this.phases[this.phaseIdx].key === 'stare';

    // lamps: dim + drift apart as the world goes wrong
    const lampI = lk.lamp;
    for (const L of this._lamps) {
      L.light.intensity += ((lampI > 0 ? 6 * lampI : 0) - L.light.intensity) * k;
      L.head.material.color.setHex(lampI > 0 ? 0xffd48a : 0x0a0a0a);
    }
    const key = this.phases[this.phaseIdx].key;
    if (key === 'wrong' || key === 'stare') {
      const spread = key === 'stare' ? 1.9 : 0.9;
      for (let i = 0; i < this._lamps.length; i++) {
        const L = this._lamps[i];
        const want = L.base - i * spread;
        L.g.position.z += (want - L.g.position.z) * Math.min(1, dt * 0.6);
      }
    }

    if (!lk.surface && this._playingStreet) { this.audio && this.audio.stopStreetAmbience(); this._playingStreet = false; }

    // crack (opening doorway) + tear (reality ripping) share the road plane
    if (this._crack) {
      const want = lk.crack >= 1 ? 0.9 : 0;
      this._crack.material.opacity += (want - this._crack.material.opacity) * k;
      if (lk.crack) this._crack.scale.x = 1 + Math.sin(this.T * 3) * 0.4;
    }
    if (this._tear) {
      const want = lk.crack >= 2 ? 1 : 0;
      this._tear.material.opacity += (want - this._tear.material.opacity) * (1 - Math.pow(0.05, dt));
      const s = 0.2 + Math.min(1, this.t / 2) * 1.4;
      this._tear.scale.set(1, s, 1);
    }

    // streaks around the descending camera
    if (this._streaks) {
      const on = lk.streak;
      const camY = this.camera.position.y;
      for (const m of this._streaks) {
        m.material.opacity += ((on ? 0.6 : 0) - m.material.opacity) * k;
        if (on) {
          m.position.y = camY + ((Math.random() * 80) - 40 + m.position.y * 0.02);
          m.position.y += dt * (9 + Math.abs(m.position.x) % 3 * 4);
        }
      }
    }

    if (this._amb) {
      this._amb.color.lerp(new THREE.Color(lk.amb), k);
      this._amb.intensity += (lk.ambI - this._amb.intensity) * k;
    }

    // the REC dot blinks; the body reads during surface shots and the fall
    if (this._recDot) this._recDot.visible = Math.sin(this.T * 2.2) > -0.2;
    if (this.body) this.body.visible = lk.surface || lk.streak;
  }

  _animateCamera(dt) {
    const cam = this.camera;
    const key = this.phases[this.phaseIdx].key;
    const shot = this.phases[this.phaseIdx].shot;
    const oy = this.originY;
    const smooth = (a, b, s) => a + (b - a) * Math.min(1, dt * (s || 6));

    switch (shot) {
      case 'walk': {
        // steady forward walk, gentle handheld sway, head turning to the road
        const z = -1 - this.t * 1.35;
        cam.position.set(0.35 + Math.sin(this.t * 1.1) * 0.035, oy + 1.62 + Math.sin(this.t * 2.2) * 0.032, z);
        cam.rotation.set(Math.sin(this.t * 1.2) * 0.012, Math.sin(this.t * 0.35) * 0.09, Math.sin(this.t * 1.6) * 0.005);
        this._swingLegs(1);
        break;
      }
      case 'unease': {
        // slower, the head beginning to scan — a beat of unease
        const z = -22 - this.t * 0.85;
        cam.position.set(0.35 + Math.sin(this.t * 0.9) * 0.05, oy + 1.62 + Math.sin(this.t * 1.7) * 0.03, z);
        cam.rotation.set(Math.sin(this.t * 1.4) * 0.02, Math.sin(this.t * 0.45) * 0.28, Math.sin(this.t * 2.4) * 0.012);
        this._swingLegs(0.6);
        break;
      }
      case 'figure': {
        // the figure comes into view; the walk stops. turn to face it and hold.
        const k = Math.min(1, this.t / 1.6);
        const z = smooth(cam.position.z, -33.5, 6);
        const sway = (1 - k) * Math.sin(this.t * 1.6) * 0.01;
        cam.position.set(smooth(cam.position.x, 0.3, 6), oy + 1.62 + sway, z + (1 - k) * -1.4);
        // the figure is off to the right; in three.js forward = (-sin,0,-cos),
        // so a strong negative yaw turns the view toward +X to face it
        cam.rotation.set(smooth(cam.rotation.x, -0.02, 5), smooth(cam.rotation.y, -1.35, 4), sway);
        this._swingLegs(0);
        break;
      }
      case 'crack': {
        // look down at the concrete; the pattern opens
        cam.position.set(0.3, oy + 1.62, -30);
        const k = Math.min(1, this.t / 1.5);
        cam.rotation.set(smooth(cam.rotation.x, -1.28, 3), smooth(cam.rotation.y, 0.05, 4), Math.sin(this.t * 8) * 0.01 * k);
        this._swingLegs(0);
        break;
      }
      case 'tear': {
        // reality tears: the camera is yanked, rolls, and is pulled through
        const k = Math.min(1, this.t / this.phases[this.phaseIdx].dur);
        cam.position.set(0.3 + Math.sin(this.t * 18) * 0.05 * k, oy + 1.5 - k * 0.6, -30);
        cam.rotation.set(-1.0 + k * 0.4, Math.sin(this.t * 9) * 0.2 * k, Math.sin(this.t * 14) * 0.25 * k);
        if (this.engine && this.engine.bumpGlitch) this.engine.bumpGlitch(1.4 + k * 1.6);
        break;
      }
      case 'fall': {
        // descend from the high street set into the real corridors
        const p = Math.min(1, this.t / this.phases[this.phaseIdx].dur);
        const ease = p * p * (3 - 2 * p);
        const y = (oy + 1.2) * (1 - ease) + 1.2 * ease;
        cam.position.set(Math.sin(this.t * 1.3) * 1.5, y, -30 + Math.sin(this.t * 0.7) * 2);
        cam.rotation.set(this.t * 2.6, this.t * 1.7, this.t * 3.1);
        this._swingLegs(0);
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
        cam.rotation.set(smooth(cam.rotation.x, 0, 4), Math.sin(this.t * 0.3) * 0.1, Math.sin(this.t * 1.4) * 0.003);
        break;
      }
    }

    // a light dolly-in keeps the frame alive during the held shots
    if (key === 'stare' || key === 'crack') {
      const dolly = Math.min(1, this.t / this.phases[this.phaseIdx].dur) * 0.35;
      cam.position.z += dolly;
    }
    if (this.engine && this.engine.bumpGlitch && (key === 'crack')) this.engine.bumpGlitch(0.5);
  }

  _swingLegs(amount) {
    if (!this._legL) return;
    const s = Math.sin(this.T * 5.4) * 0.5 * amount;
    this._legL.rotation.x = s;
    this._legR.rotation.x = -s;
  }

  dispose() {
    this.voice && this.voice.stop();
    this.audio && this.audio.stopStreetAmbience();
    for (const m of (this._streaks || [])) {
      this.camera.remove(m);
      m.geometry.dispose(); m.material.dispose();
    }
    this._streaks = [];
    if (this.camera) this.camera.fov = this._baseFov;
    if (this.body) { this.camera.remove(this.body); this.body.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); } }); }
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
