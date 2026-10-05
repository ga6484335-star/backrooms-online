// Handheld flashlight — a physically-shaped, hand-held light.
//
// The beam is REAL LIGHT, not a graphic: there is no volumetric cone mesh and
// no translucent overlay in front of the camera. Everything the player sees is
// the world being lit by three cooperating lights that share a slightly lagged
// "hand" transform:
//   1. a narrow primary SpotLight with a *cookie* (gobo) that shapes the spot
//      into a hot centre falling off softly to a dark rim;
//   2. a wider, dim spill SpotLight (with its own soft cookie) for the faint
//      throw-light a real reflector leaks, so surfaces just outside the core
//      still respond a little while the room stays genuinely dark;
//   3. a tiny point fill at the lens so the player's own feet/held items are
//      not pitch black.
// The primary spot casts a real dynamic shadow map on high/ultra, so doorframes,
// walls and props carve believable shadows out of the beam — the strongest cue
// that the light is real. True inverse-square falloff (decay 2) keeps distance
// honest: strong up close, quickly weaker with distance.
//
// The rig itself is a damped spring: the light mount and its aim trail the
// camera by a few dozen milliseconds, with a figure-8 walk bob, idle breathing,
// micro-vibration and trauma shake, so it reads as held rather than welded on.
import * as THREE from 'three';

const DRAIN_PER_SEC = 100 / 300; // ~5 minutes of light
const BATTERY_REFILL = 55;

// held-light time constants (seconds). Deliberately tiny: the light trails the
// view by a few tens of ms — felt, not consciously noticed. Aim lags a touch
// more vertically so looking up/down has its own weight.
const AIM_TAU = 0.055;
const AIM_TAU_V = 0.078;
const POS_TAU = 0.05;

// base intensity (candela). Physical falloff does the distance work.
const SPOT_BASE = 560;
const SPILL_BASE = 0;
const FILL_BASE = 0;

// ---------------------------------------------------------------------------
// Cookie (gobo) textures. One tight beam profile, one broad soft spill. Drawn
// once and shared by every flashlight (local + remote), so it is free per light.
let _beamCookie = null;
let _spillCookie = null;

function makeCookie(size, stops, facetAmp, grainAmp) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2, R = size * 0.5;

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  for (const [p, a] of stops) g.addColorStop(p, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // faint reflector faceting + a hair of grain so the hotspot is never a
  // mathematically perfect disc (that perfection is what reads as "CG")
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = (x - cx) / R, ny = (y - cy) / R;
      const r = Math.min(1, Math.hypot(nx, ny));
      const ang = Math.atan2(ny, nx);
      const ripple = 1 + facetAmp * Math.sin(ang * 6 + r * 9) * Math.min(1, r * 1.7);
      const grain = 1 - grainAmp + Math.random() * grainAmp * 2;
      const k = ripple * grain;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    }
  }
  ctx.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function beamCookie() {
  if (!_beamCookie) {
    // Concentrated hot core that falls off quickly to a fully dark rim. A real
    // narrow lamp has a small bright spot with only a little shoulder — a long
    // soft shoulder reads as a painted glow once bloom touches it.
    _beamCookie = makeCookie(256, [
      [0.00, 1.00], [0.16, 0.99], [0.30, 0.80], [0.42, 0.52],
      [0.55, 0.24], [0.70, 0.07], [0.86, 0.012], [1.00, 0.0],
    ], 0.05, 0.02);
  }
  return _beamCookie;
}

function spillCookie() {
  if (!_spillCookie) {
    // very soft, low-contrast wash for the reflector's leaked light. The outer
    // stop must reach 0 so the spill has NO hard cone edge either.
    _spillCookie = makeCookie(128, [
      [0.00, 0.9], [0.30, 0.6], [0.55, 0.3], [0.78, 0.10], [0.92, 0.02], [1.00, 0.0],
    ], 0.03, 0.03);
  }
  return _spillCookie;
}

// shared with remote-player avatars so their beams have the same shaped falloff
export function flashlightBeamMap() { return beamCookie(); }

export class Flashlight {
  constructor(camera, scene, audio, quality) {
    this.camera = camera;
    this.audio = audio;
    this.on = false;
    this.battery = 100;
    this.flickerT = 0;
    this.time = 0;
    this.quality = quality;
    this.castShadows = quality === 'high' || quality === 'ultra';
    // mobile/low keeps exactly ONE light (the primary spot). No secondary spill
    // light is used at all: a wide dim wash is exactly what painted a large warm
    // halo over the scene. One focused, neutral beam is both more physical and
    // cheaper.
    this.useSpill = false;
    this.useFill = false;

    // --- primary beam: narrow, physical falloff, soft edge, cookie-shaped ---
    // Neutral daylight-white: a real handheld lamp is not tinted, and a warm
    // tint over the already-warm Level 0 palette reads as a yellow glow.
    this.spot = new THREE.SpotLight(0xffffff, 0, 60, 0.20, 0.55, 2.0);
    this.spot.visible = false;
    this.spot.map = beamCookie();
    this.spot.castShadow = this.castShadows;
    if (this.castShadows) this._configureShadow();

    // --- spill: retained but permanently disabled (kept so setQuality/tests
    //     that reference it stay valid). A wide low-contrast wash is the single
    //     biggest source of the fake "yellow blob", so it is never shown. ---
    this.spill = new THREE.SpotLight(0xffffff, 0, 30, 0.55, 0.95, 2.0);
    this.spill.visible = false;
    this.spill.map = spillCookie();

    // --- fill: retained but permanently disabled (see above). ---
    this.fill = new THREE.PointLight(0xffffff, 0, 2.2, 2);
    this.fill.visible = false;

    scene.add(this.spot, this.spot.target, this.spill, this.spill.target, this.fill);

    // held-light state
    this._aim = new THREE.Vector3(0, 0, -1);
    this._hand = new THREE.Vector3();
    this._handInit = false;
    this._fwd = new THREE.Vector3();
    this._prevFwd = new THREE.Vector3(0, 0, -1);
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._mount = new THREE.Vector3();
    this._bobT = 0;
    this._swayT = 0;
    this._vibT = 0;
    this._rattleCd = 0;
    this._lastSpeed01 = 0;
  }

  _configureShadow() {
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.22;
    this.spot.shadow.camera.far = 60;
    this.spot.shadow.focus = 1.0;
    this.spot.shadow.bias = -0.0014;
    this.spot.shadow.normalBias = 0.03;
    this.spot.shadow.radius = 2.4; // PCF soft-shadow penumbra
  }

  toggle() {
    if (this.on) {
      this.on = false;
    } else if (this.battery > 0.5) {
      this.on = true;
    } else {
      if (this.audio.flashlight) this.audio.flashlight(false); // dead click, no light
      return;
    }
    this._click();
    this._apply();
  }

  setOn(v) {
    if (v === this.on) return;
    if (v && this.battery <= 0.5) return;
    this.on = v;
    this._click();
    this._apply();
  }

  _click() {
    if (this.audio.flashlight) this.audio.flashlight(this.on);
    else this.audio.click();
    if (this.audio.flashlightHum) this.audio.flashlightHum(this.on);
  }

  addBattery(n = BATTERY_REFILL) {
    this.battery = Math.min(100, this.battery + n);
    this.audio.batteryPickup();
  }

  // retune the beam's shadow cost when the quality setting changes mid-game
  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    const shadows = q === 'high' || q === 'ultra';
    if (shadows) this._configureShadow();
    this.spot.castShadow = shadows;
    this.castShadows = shadows;
    // secondary lights stay off at every quality (they cause the warm halo)
    this.useSpill = false;
    this.useFill = false;
    this._apply();
  }

  // snap the held light back to the camera with no lag — used on respawn / level
  // start so the first frame after a hard cut is not the old aim direction
  reset() {
    this.on = false;
    this._handInit = false;
    this._aim.set(0, 0, -1);
    this._prevFwd.set(0, 0, -1);
    this.flickerT = 0;
    if (this.audio && this.audio.flashlightHum) this.audio.flashlightHum(false);
    this._apply();
  }

  _apply() {
    this.spot.visible = this.on;
    this.spill.visible = this.on && this.useSpill;
    this.fill.visible = this.on && this.useFill;
    // give the light a live base the instant it switches on, before the next
    // update() refines it with wobble/flicker (matters for that first frame)
    this.spot.intensity = this.on ? SPOT_BASE : 0;
    this.spill.intensity = this.spill.visible ? SPILL_BASE : 0;
    this.fill.intensity = this.fill.visible ? FILL_BASE : 0;
  }

  dispose(scene) {
    scene.remove(this.spot, this.spot.target, this.spill, this.spill.target, this.fill);
    if (this.audio && this.audio.flashlightHum) this.audio.flashlightHum(false);
  }

  update(dt, player) {
    this.time += dt;
    if (this.on) {
      this.battery = Math.max(0, this.battery - DRAIN_PER_SEC * dt);
      if (this.battery <= 0) {
        this.on = false;
        this._click();
        this._apply();
      }
    }
    if (!this.on) return;

    const step = Math.max(0.0001, dt);
    const cam = this.camera;
    const p = cam.position;

    // getWorldDirection refreshes the camera's world matrix; read the hand
    // basis AFTER it so the mount point uses this frame's orientation
    cam.getWorldDirection(this._fwd);
    const cf = cam.matrixWorld;
    this._right.setFromMatrixColumn(cf, 0);
    this._up.setFromMatrixColumn(cf, 1);

    // ---- movement/state inputs -------------------------------------------
    const spd = player ? (player.speedSmooth || 0) : 0;
    const run = player ? !!player.running : false;
    const shake = player ? (player.shake || 0) : 0;
    const speed01 = Math.min(1.6, spd / 6.5); // ~walk speed = 1

    this._bobT += dt * (3.4 + spd * 2.1);
    this._swayT += dt;
    this._vibT += dt;
    this._rattleCd = Math.max(0, this._rattleCd - dt);

    // ---- hand mount offset in camera-local space -------------------------
    // held right + down + a hair forward, with a figure-8 walk bob, idle
    // breathing sway and micro-vibration. All amplitudes are tiny on purpose.
    let lx = 0.15, ly = -0.10, lz = 0.015;
    const bobAmp = speed01 * (run ? 0.026 : 0.015);
    lx += Math.cos(this._bobT) * bobAmp;
    ly += Math.sin(this._bobT * 2) * bobAmp * 1.15;
    // idle breathing / weight shift
    lx += Math.sin(this._swayT * 0.9) * 0.004 + Math.sin(this._swayT * 2.1 + 0.5) * 0.0018;
    ly += Math.sin(this._swayT * 0.7 + 1.0) * 0.005;
    // micro-vibration (always present, louder under trauma)
    const vib = 0.0009 + shake * 0.006;
    lx += (Math.sin(this._vibT * 41.3) + Math.sin(this._vibT * 57.7)) * vib;
    ly += (Math.sin(this._vibT * 38.1 + 1.0) + Math.sin(this._vibT * 63.1)) * vib;

    this._mount.set(
      p.x + this._right.x * lx + this._up.x * ly + this._fwd.x * lz,
      p.y + this._right.y * lx + this._up.y * ly + this._fwd.y * lz,
      p.z + this._right.z * lx + this._up.z * ly + this._fwd.z * lz,
    );

    // position trails the camera a hair (translational inertia)
    const kp = 1 - Math.exp(-step / POS_TAU);
    if (!this._handInit) { this._hand.copy(this._mount); this._handInit = true; }
    this._hand.x += (this._mount.x - this._hand.x) * kp;
    this._hand.y += (this._mount.y - this._hand.y) * kp;
    this._hand.z += (this._mount.z - this._hand.z) * kp;
    const hx = this._hand.x, hy = this._hand.y, hz = this._hand.z;

    // ---- aim: trails the view (rotational inertia) -----------------------
    // target direction = camera forward + a little hand drift, so the beam
    // wanders almost imperceptibly instead of being pinned to screen centre
    const driftX = Math.sin(this._swayT * 0.83) * 0.004 + Math.sin(this._swayT * 2.7 + 2.0) * 0.0018;
    const driftY = Math.sin(this._swayT * 0.67 + 1.0) * 0.003;
    const tx = this._fwd.x + this._right.x * driftX + this._up.x * driftY;
    const ty = this._fwd.y + this._right.y * driftX + this._up.y * driftY;
    const tz = this._fwd.z + this._right.z * driftX + this._up.z * driftY;

    const kaxz = 1 - Math.exp(-step / AIM_TAU);
    const kay = 1 - Math.exp(-step / AIM_TAU_V);
    this._aim.x += (tx - this._aim.x) * kaxz;
    this._aim.y += (ty - this._aim.y) * kay;
    this._aim.z += (tz - this._aim.z) * kaxz;
    this._aim.normalize();

    // ---- drive the lights: all originate at the hand, aimed down the beam --
    const tgtX = hx + this._aim.x * 24, tgtY = hy + this._aim.y * 24, tgtZ = hz + this._aim.z * 24;
    this.spot.position.set(hx, hy, hz);
    this.spot.target.position.set(tgtX, tgtY, tgtZ);
    this.spill.position.set(hx, hy, hz);
    this.spill.target.position.set(tgtX, tgtY, tgtZ);
    this.fill.position.set(p.x, p.y - 0.06, p.z);

    // ---- brightness: voltage wobble, drain curve, low-battery flicker ----
    const b01 = this.battery / 100;
    // output holds near-full then sags as the cell dies (not just at the end)
    const batt = b01 > 0.4 ? 1 : 0.55 + (b01 / 0.4) * 0.45;
    let f = batt * (0.965
      + Math.sin(this.time * 37) * 0.012
      + Math.sin(this.time * 13.7 + 1.0) * 0.014
      + Math.sin(this.time * 2.3) * 0.010);
    // a hair of dimming when the hand is moving fast
    f *= 1 - Math.min(0.05, speed01 * 0.02);
    const low = this.battery < 22;
    if (low) {
      this.flickerT += dt;
      const panic = 1 - this.battery / 22;
      if (Math.sin(this.flickerT * (5 + panic * 14)) > 0.72 - panic * 0.3) {
        f *= 0.35 + (1 - panic) * 0.5;
      }
    }
    this.spot.intensity = SPOT_BASE * f;
    this.spill.intensity = this.useSpill ? SPILL_BASE * f : 0;
    this.fill.intensity = this.useFill ? FILL_BASE * f : 0;

    // ---- hand-motion rattle: the light taps against the grip when turning --
    const dot = Math.max(-1, Math.min(1,
      this._fwd.x * this._prevFwd.x + this._fwd.y * this._prevFwd.y + this._fwd.z * this._prevFwd.z));
    const turnRate = Math.acos(dot) / step; // rad/s
    this._prevFwd.copy(this._fwd);
    const moveAccel = Math.abs(speed01 - this._lastSpeed01) / step;
    this._lastSpeed01 = speed01;
    const want = Math.max(
      turnRate > 1.4 ? Math.min(0.6, (turnRate - 1.4) * 0.25) : 0,
      moveAccel > 8 ? 0.25 : 0,
      shake * 0.5);
    if (want > 0.05 && this._rattleCd <= 0) {
      this._rattleCd = 0.12;
      if (this.audio.flashlightRattle) this.audio.flashlightRattle(want);
    }
  }
}
