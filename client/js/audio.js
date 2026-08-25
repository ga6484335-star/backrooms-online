// Procedural Web Audio engine — no audio files. Everything (footsteps,
// fluorescent buzz, HVAC, drips, distant metal, creature vocals) is
// synthesized. Positional via PannerNode relative to the camera.
import { rngFrom } from './rng.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.listener = null;
    this.started = false;
    this.volume = 0.8;
    this.ambientNodes = [];
    this.loops = new Map();   // name -> stop fn
    this.stepBuffers = {};
    this._noiseBuf = null;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.listener = this.ctx.listener;
      this._noiseBuf = this._makeNoise(2.0);
      return true;
    } catch (e) { return false; }
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  _makeNoise(sec) {
    const len = (this.ctx.sampleRate * sec) | 0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- ambient bed ----------
  startAmbience(levelDef) {
    if (!this.ensure()) return;
    this.stopAmbience();
    const ctx = this.ctx;

    // electrical hum (fundamental + harmonics), very quiet
    const hum = ctx.createGain(); hum.gain.value = 0.014;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = levelDef.hum;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = levelDef.hum * 3;
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    // slow amplitude wobble
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.4;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.004;
    lfo.connect(lfoG).connect(hum.gain);
    o1.connect(hum); o2.connect(g2).connect(hum);
    hum.connect(this.master);
    o1.start(); o2.start(); lfo.start();

    // HVAC: filtered brown-ish noise, very low
    const hvac = ctx.createGain(); hvac.gain.value = 0.02;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 40;
    src.connect(lp).connect(hp).connect(hvac).connect(this.master);
    src.start();

    // flooded levels: sparse drips scheduler
    let dripTimer = null;
    if (levelDef.water) {
      const drip = () => {
        this.drip(Math.random() * 20 - 10, Math.random() * 20 - 10);
        dripTimer = setTimeout(drip, 400 + Math.random() * 2600);
      };
      dripTimer = setTimeout(drip, 1000);
    }

    this.ambientNodes = [o1, o2, lfo, src];
    this._ambientGains = [hum, hvac];
    this._dripTimer = dripTimer;
  }

  stopAmbience() {
    for (const n of this.ambientNodes) { try { n.stop(); } catch (e) {} }
    for (const g of (this._ambientGains || [])) { try { g.disconnect(); } catch (e) {} }
    if (this._dripTimer) clearTimeout(this._dripTimer);
    this.ambientNodes = []; this._ambientGains = [];
  }

  // ---------- one-shots ----------
  _env(gain, t0, a, d, peak = 1) {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  panner(x, y, z, refDist = 3) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else {
      p.setPosition(x, y, z);
    }
    return p;
  }

  setListener(x, y, z, yaw, pitch) {
    if (!this.ctx) return;
    const L = this.listener;
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(x, y, z);
      L.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  footstep(surface, run, x = 0, y = 0, z = 0, vol = 1) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
    src.playbackRate.value = 0.9 + Math.random() * 0.3;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    let freq, dur, peak;
    switch (surface) {
      case 'metal': freq = 900; dur = 0.09; peak = 0.32; break;
      case 'tile': freq = 1400; dur = 0.06; peak = 0.3; break;
      case 'concrete': freq = 600; dur = 0.08; peak = 0.28; break;
      case 'water': freq = 800; dur = 0.16; peak = 0.36; break;
      default: freq = 380; dur = 0.09; peak = 0.2; break; // carpet — quiet
    }
    f.type = surface === 'water' ? 'bandpass' : 'lowpass';
    f.frequency.value = freq * (0.85 + Math.random() * 0.4);
    f.Q.value = 1.2;
    this._env(g, t, 0.004, dur, peak * vol * (run ? 1.35 : 1));
    src.connect(f).connect(g);
    let out = g;
    if (x || z) { const p = this.panner(x, y, z); g.connect(p); out = p; }
    out.connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
    if (surface === 'water') {
      // splash tail
      const s2 = ctx.createBufferSource(); s2.buffer = this._noiseBuf;
      const f2 = ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 2000;
      const g2 = ctx.createGain();
      this._env(g2, t + 0.03, 0.01, 0.22, 0.12 * vol);
      s2.connect(f2).connect(g2).connect(this.master);
      s2.start(t + 0.03, Math.random(), 0.25);
    }
  }

  drip(x, z) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1800 + Math.random() * 800, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
    const g = ctx.createGain();
    this._env(g, t, 0.002, 0.12, 0.12);
    const p = this.panner(x, 2.5, z);
    o.connect(g).connect(p).connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }

  // distant metallic impact — the backrooms classic
  distantMetal(intensity = 1) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const a = Math.random() * Math.PI * 2;
    const dist = 14 + Math.random() * 20;
    const x = Math.cos(a) * dist, z = Math.sin(a) * dist;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
    src.playbackRate.value = 0.4;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = 300 + Math.random() * 500; f.Q.value = 6;
    const g = ctx.createGain();
    this._env(g, t, 0.005, 1.4, 0.5 * intensity);
    const p = this.panner(x, 1, z, 6);
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(t, Math.random(), 1.6);
  }

  creak() {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(90 + Math.random() * 60, t);
    o.frequency.linearRampToValueAtTime(60 + Math.random() * 40, t + 0.7);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 8;
    const g = ctx.createGain();
    this._env(g, t, 0.1, 0.8, 0.07);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); o.stop(t + 1.1);
  }

  buzz(x, z, duration = 1.2) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 120;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain();
    this._env(g, t, 0.05, duration, 0.05);
    const p = this.panner(x, 2.6, z);
    o.connect(f).connect(g).connect(p).connect(this.master);
    o.start(t); o.stop(t + duration + 0.2);
  }

  // behind-the-player unexplained sound
  behindYou() {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
    src.playbackRate.value = 0.25;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
    const g = ctx.createGain();
    this._env(g, t, 0.4, 2.2, 0.35);
    const p = this.panner(0, 1.5, 4, 2); // fixed behind; world-space placement done by caller
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(t, Math.random(), 3);
  }

  // ---------- monster voices ----------
  monsterVoice(type, x, y, z, intensity = 1) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(x, y, z, 4);
    const g = ctx.createGain();
    g.connect(p).connect(this.master);
    switch (type) {
      case 'watcher': {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
        const trem = ctx.createOscillator(); trem.frequency.value = 7;
        const tg = ctx.createGain(); tg.gain.value = 20;
        trem.connect(tg).connect(o.frequency);
        this._env(g, t, 0.6, 2.5, 0.22 * intensity);
        o.connect(g); o.start(t); o.stop(t + 3.2); trem.start(t); trem.stop(t + 3.2);
        break;
      }
      case 'stalker': {
        const src = ctx.createBufferSource(); src.buffer = this._noiseBuf; src.playbackRate.value = 0.5;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 4;
        this._env(g, t, 0.2, 1.2, 0.3 * intensity);
        src.connect(f).connect(g); src.start(t, Math.random(), 1.5);
        break;
      }
      case 'runner': {
        // shriek
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(300, t);
        o.frequency.exponentialRampToValueAtTime(1900, t + 0.5);
        o.frequency.exponentialRampToValueAtTime(200, t + 1.1);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2;
        this._env(g, t, 0.05, 1.2, 0.5 * intensity);
        o.connect(f).connect(g); o.start(t); o.stop(t + 1.3);
        break;
      }
      case 'shadow': {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 38;
        this._env(g, t, 1.2, 3.0, 0.3 * intensity);
        o.connect(g); o.start(t); o.stop(t + 4.4);
        break;
      }
      case 'crawler': {
        // rapid chittering clicks
        const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
        src.playbackRate.value = 2.4;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 6;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 22;
        const lg = ctx.createGain(); lg.gain.value = 0.12 * intensity;
        lfo.connect(lg).connect(g.gain);
        this._env(g, t, 0.04, 0.9, 0.14 * intensity);
        src.connect(f).connect(g); src.start(t, Math.random(), 1.0);
        lfo.start(t); lfo.stop(t + 1);
        break;
      }
      case 'siren': {
        // a distant, almost-musical wail — wrong notes, drifting pitch
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(392, t);
        o.frequency.linearRampToValueAtTime(415, t + 1.4);
        o.frequency.linearRampToValueAtTime(370, t + 2.8);
        const o2 = ctx.createOscillator(); o2.type = 'sine';
        o2.frequency.setValueAtTime(392 * 1.06, t); // beating detune
        o2.frequency.linearRampToValueAtTime(440, t + 2.8);
        this._env(g, t, 1.6, 3.4, 0.16 * intensity);
        o.connect(g); o2.connect(g);
        o.start(t); o.stop(t + 5.2); o2.start(t); o2.stop(t + 5.2);
        break;
      }
      case 'hunter': {
        // low guttural growl with pitch drop
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(90, t);
        o.frequency.exponentialRampToValueAtTime(48, t + 0.9);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 3;
        this._env(g, t, 0.12, 1.0, 0.4 * intensity);
        o.connect(f).connect(g); o.start(t); o.stop(t + 1.3);
        break;
      }
      case 'ambusher': {
        // sudden wet screech
        const o = ctx.createOscillator(); o.type = 'square';
        o.frequency.setValueAtTime(1400, t);
        o.frequency.exponentialRampToValueAtTime(300, t + 0.35);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000; f.Q.value = 1.5;
        this._env(g, t, 0.02, 0.5, 0.35 * intensity);
        o.connect(f).connect(g); o.start(t); o.stop(t + 0.6);
        break;
      }
      case 'mimic': {
        // furniture creaking the wrong way
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(70, t);
        o.frequency.linearRampToValueAtTime(160, t + 0.7);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 5;
        this._env(g, t, 0.1, 0.8, 0.2 * intensity);
        o.connect(f).connect(g); o.start(t); o.stop(t + 1.0);
        break;
      }
      case 'tallone': {
        // a sub-bass presence you feel in your teeth, with a slow wavering
        // overtone like air moving through a very long throat
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 31;
        const o2 = ctx.createOscillator(); o2.type = 'sine';
        o2.frequency.setValueAtTime(124, t);
        o2.frequency.linearRampToValueAtTime(117, t + 3.5);
        const g2 = ctx.createGain(); g2.gain.value = 0.25;
        this._env(g, t, 2.0, 3.0, 0.34 * intensity);
        o.connect(g); o2.connect(g2).connect(g);
        o.start(t); o.stop(t + 5.2); o2.start(t); o2.stop(t + 5.2);
        break;
      }
      case 'hollow': {
        // many breaths at once, slightly out of phase — a congregation exhaling
        for (let i = 0; i < 3; i++) {
          const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
          src.playbackRate.value = 0.32 + i * 0.05;
          const f = ctx.createBiquadFilter(); f.type = 'bandpass';
          f.frequency.value = 300 + i * 90; f.Q.value = 2.5;
          const gg = ctx.createGain(); gg.connect(f);
          this._env(gg, t + i * 0.3, 0.5, 1.1, 0.12 * intensity);
          src.connect(f).connect(g);
          src.start(t + i * 0.3, Math.random(), 1.8);
        }
        break;
      }
      case 'bonefiend': {
        // dry knocking: bone on tile, irregular rhythm, too many joints
        const n = 4 + ((Math.random() * 4) | 0);
        for (let i = 0; i < n; i++) {
          const dt = i * (0.09 + Math.random() * 0.14);
          const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
          src.playbackRate.value = 1.8 + Math.random();
          const f = ctx.createBiquadFilter(); f.type = 'bandpass';
          f.frequency.value = 800 + Math.random() * 900; f.Q.value = 9;
          const gg = ctx.createGain(); gg.connect(f);
          this._env(gg, t + dt, 0.002, 0.07, 0.22 * intensity);
          src.connect(f).connect(g);
          src.start(t + dt, Math.random(), 0.1);
        }
        break;
      }
      case 'walldweller': {
        // slow drag of something flat against plaster
        const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
        src.playbackRate.value = 0.22;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.4;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 2.2;
        const lg = ctx.createGain(); lg.gain.value = 0.1 * intensity;
        lfo.connect(lg).connect(g.gain);
        this._env(g, t, 0.4, 1.6, 0.2 * intensity);
        src.connect(f).connect(g); src.start(t, Math.random(), 2.2);
        lfo.start(t); lfo.stop(t + 2.2);
        break;
      }
      case 'deepone': {
        // wet gurgle rising out of water, then a heavy swallow
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(55, t);
        o.frequency.linearRampToValueAtTime(95, t + 0.7);
        o.frequency.exponentialRampToValueAtTime(40, t + 1.3);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 6;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 9;
        const lg = ctx.createGain(); lg.gain.value = 0.14 * intensity;
        lfo.connect(lg).connect(g.gain);
        this._env(g, t, 0.25, 1.4, 0.32 * intensity);
        o.connect(f).connect(g); o.start(t); o.stop(t + 1.8);
        lfo.start(t); lfo.stop(t + 1.8);
        break;
      }
      case 'ceiling': {
        // dry ticking from directly above — nails tapping the ceiling tiles
        const n = 3 + ((Math.random() * 4) | 0);
        for (let i = 0; i < n; i++) {
          const dt = i * (0.16 + Math.random() * 0.2);
          const o = ctx.createOscillator(); o.type = 'square';
          o.frequency.value = 2400 + Math.random() * 1200;
          const gg = ctx.createGain(); gg.connect(g);
          this._env(gg, t + dt, 0.001, 0.04, 0.12 * intensity);
          o.connect(gg);
          o.start(t + dt); o.stop(t + dt + 0.06);
        }
        break;
      }
      case 'falseplayer': {
        // a voice almost forming words — chopped, pitched wrong, backwards-feeling
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(180, t);
        o.frequency.linearRampToValueAtTime(140, t + 0.3);
        o.frequency.linearRampToValueAtTime(210, t + 0.6);
        o.frequency.linearRampToValueAtTime(120, t + 0.9);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 3;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 6;
        const lg = ctx.createGain(); lg.gain.value = 0.16 * intensity;
        lfo.connect(lg).connect(g.gain);
        this._env(g, t, 0.1, 1.1, 0.24 * intensity);
        o.connect(f).connect(g); o.start(t); o.stop(t + 1.3);
        lfo.start(t); lfo.stop(t + 1.3);
        break;
      }
    }
  }

  // heavy splash — something big moving through standing water
  splash(x, z, intensity = 1) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(x, 0.3, z);
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
    src.playbackRate.setValueAtTime(1.4, t);
    src.playbackRate.exponentialRampToValueAtTime(0.35, t + 0.5);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.8;
    const g = ctx.createGain();
    this._env(g, t, 0.01, 0.7, 0.4 * intensity);
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(t, Math.random(), 1.0);
  }

  heartbeat(intensity = 1) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const dt of [0, 0.32]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
      const g = ctx.createGain();
      this._env(g, t + dt, 0.01, 0.18, 0.5 * intensity * (dt ? 0.7 : 1));
      o.connect(g).connect(this.master);
      o.start(t + dt); o.stop(t + dt + 0.3);
    }
  }

  doorCreak(x, z) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140 + Math.random() * 80, t);
    o.frequency.linearRampToValueAtTime(90, t + 0.9);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 4;
    const g = ctx.createGain();
    this._env(g, t, 0.08, 1.0, 0.14);
    const p = this.panner(x, 1.2, z);
    o.connect(f).connect(g).connect(p).connect(this.master);
    o.start(t); o.stop(t + 1.2);
  }

  doorSlam(x, z) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(x, 1.2, z);
    // low boom + rattle
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const g = ctx.createGain();
    this._env(g, t, 0.005, 0.5, 0.55);
    o.connect(g).connect(p).connect(this.master);
    o.start(t); o.stop(t + 0.6);
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
    const g2 = ctx.createGain();
    this._env(g2, t + 0.02, 0.005, 0.3, 0.2);
    src.connect(f).connect(g2).connect(p).connect(this.master);
    src.start(t, Math.random(), 0.4);
  }

  metalClatter(x, z) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(x, 1.0, z);
    for (let i = 0; i < 3 + ((Math.random() * 3) | 0); i++) {
      const dt = i * (0.06 + Math.random() * 0.09);
      const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
      src.playbackRate.value = 1.2 + Math.random() * 1.4;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 1400 + Math.random() * 2400; f.Q.value = 7;
      const g = ctx.createGain();
      this._env(g, t + dt, 0.003, 0.16, 0.16 * (1 - i * 0.18));
      src.connect(f).connect(g).connect(p).connect(this.master);
      src.start(t + dt, Math.random(), 0.2);
    }
  }

  paper() {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2400;
    const g = ctx.createGain();
    this._env(g, t, 0.02, 0.18, 0.12);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), 0.25);
  }

  // ---------- flashlight / pickups / death ----------
  click() {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, 0.01, 0.06);
  }

  batteryPickup() {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f0, dt] of [[660, 0], [990, 0.07]]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f0;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.1, t + dt + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.14);
      o.connect(g).connect(this.master);
      o.start(t + dt); o.stop(t + dt + 0.16);
    }
  }

  distantScream(intensity = 1) {
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner((Math.random() - 0.5) * 40, 1.5, -30 - Math.random() * 20, 12);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(380, t + 1.1);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.Q.value = 2.2;
    f.frequency.exponentialRampToValueAtTime(500, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11 * intensity, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    const v = ctx.createOscillator(); v.frequency.value = 9;
    const vg = ctx.createGain(); vg.gain.value = 22;
    v.connect(vg).connect(o.frequency);
    o.connect(f).connect(g).connect(p);
    o.start(t); o.stop(t + 1.4); v.start(t); v.stop(t + 1.4);
  }

  distantFootsteps(count = 4) {
    if (!this.ensure()) return;
    let dt = 0;
    const px = (Math.random() - 0.5) * 30, pz = -18 - Math.random() * 14;
    for (let i = 0; i < count; i++) {
      this._thumpAt(px + i * 0.7, pz, 0.05, 90 + Math.random() * 30, dt);
      dt += 0.5 + Math.random() * 0.25;
    }
  }

  _thumpAt(x, z, vol, freq, delay) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const p = this.panner(x, 0.3, z, 8);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g).connect(p);
    o.start(t); o.stop(t + 0.16);
  }

  monsterAttack(x, y, z) {
    // loud in-your-face screech for the kill moment
    if (!this.ensure()) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(x, y, z, 2);
    const s = ctx.createBufferSource(); s.buffer = this._noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.7);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    s.connect(f).connect(g); o.connect(g);
    g.connect(p);
    s.start(t); s.stop(t + 0.9); o.start(t); o.stop(t + 0.9);
  }
}
