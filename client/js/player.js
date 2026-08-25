// Player controller: movement, collision vs world colliders, camcorder feel.
// The camcorder camera has handheld sway, walk/run bob, inertia, micro-shake,
// focus hunting (exposure pulses) and smoothed turning.
import * as THREE from 'three';
import { CELL } from './worldgen.js';

const EYE = 1.62;
const RADIUS = 0.32;
const WALK = 2.6;
const RUN = 5.2;

export function isMobile() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return coarse || ua;
}

export class PlayerController {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(2, EYE, 2);
    this.yaw = 0; this.pitch = 0;
    this.yawTarget = 0; this.pitchTarget = 0;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.running = false;
    this.bobT = 0;
    this.swayT = 0;
    this.speedSmooth = 0;
    this.shake = 0;            // external trauma (monster near, caught)
    this.focusT = 0;           // focus hunting phase
    this.sensitivity = 1;
    this.enabled = false;
    this.mobile = isMobile();
    this.joy = { x: 0, y: 0, active: false };
    this.lookDelta = { x: 0, y: 0 };
    this.mobileRun = false;
    this.anim = 'idle';
    this.emote = '';
    this.emoteT = 0;
    this.sitting = false;
    this.colliderBuf = [];
    this.dead = false;
    this.flashOn = 0;

    if (!this.mobile) this._bindDesktop();
  }

  _bindDesktop() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.running = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.running = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement === null) return;
      const s = 0.0021 * this.sensitivity;
      this.yawTarget -= e.movementX * s;
      this.pitchTarget -= e.movementY * s;
      this.pitchTarget = THREE.MathUtils.clamp(this.pitchTarget, -1.45, 1.45);
    });
  }

  // virtual joystick input from mobile UI
  setJoystick(x, y) { this.joy.x = x; this.joy.y = y; this.joy.active = true; }
  clearJoystick() { this.joy.x = 0; this.joy.y = 0; this.joy.active = false; }
  addLook(dx, dy) { this.lookDelta.x += dx; this.lookDelta.y += dy; }

  teleport(x, z) {
    this.pos.set(x, EYE, z);
    this.vel.set(0, 0, 0);
  }

  // current noise signature in meters (how far footsteps carry)
  noiseLevel() {
    if (this.dead || this.sitting) return 0;
    if (this.anim === 'run') return 24;
    if (this.anim === 'walk') return 8;
    return 0;
  }

  eyeHeight() { return this.sitting ? 1.0 : EYE; }

  update(dt, world, worldMgr) {
    if (!this.enabled) return;

    // ---- input vector ----
    let ix = 0, iz = 0;
    if (this.mobile) {
      ix = this.joy.x; iz = this.joy.y;
      this.running = this.mobileRun;
      // touch look
      const s = 0.0035 * this.sensitivity;
      this.yawTarget -= this.lookDelta.x * s;
      this.pitchTarget -= this.lookDelta.y * s;
      this.pitchTarget = THREE.MathUtils.clamp(this.pitchTarget, -1.45, 1.45);
      this.lookDelta.x = 0; this.lookDelta.y = 0;
    } else {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iz += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iz -= 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
    }
    const inputMag = Math.min(1, Math.hypot(ix, iz));
    const moving = inputMag > 0.05;

    // smooth turning with inertia
    const turnSpeed = 14;
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * turnSpeed);
    this.pitch += (this.pitchTarget - this.pitch) * Math.min(1, dt * turnSpeed);

    // ---- movement ----
    const speed = this.sitting ? 0 : (this.running ? RUN : WALK) * inputMag;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = -sin, fz = -cos;
    const rx = cos, rz = -sin;
    const wantX = (fx * -iz * -1 + rx * ix);
    const wantZ = (fz * -iz * -1 + rz * ix);
    // normalize
    const wl = Math.hypot(wantX, wantZ) || 1;
    const tx = (wantX / wl) * speed;
    const tz = (wantZ / wl) * speed;
    const accel = this.running ? 10 : 8;
    this.vel.x += (tx - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (tz - this.vel.z) * Math.min(1, dt * accel);

    // integrate + collide (axis separated for sliding)
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const cols = worldMgr ? worldMgr.nearbyColliders(this.pos.x, this.pos.z) : this.colliderBuf;
    this.pos.x = this.collideAxis(nx, this.pos.z, cols, true);
    this.pos.z = this.collideAxis(this.pos.x, nz, cols, false);

    this.speedSmooth += (this.vel.length() - this.speedSmooth) * Math.min(1, dt * 6);
    const spd = this.speedSmooth;
    this.anim = spd > 4 ? 'run' : spd > 0.3 ? 'walk' : 'idle';
    if (this.sitting) this.anim = 'sit';

    // ---- camcorder ----
    this.bobT += dt * (3 + spd * 2.2);
    this.swayT += dt;
    this.focusT += dt;
    const bobAmp = Math.min(1, spd / WALK) * (this.running ? 0.035 : 0.02);
    const bobY = Math.sin(this.bobT * 2) * bobAmp;
    const bobX = Math.cos(this.bobT) * bobAmp * 0.6;

    // handheld sway (perlin-ish layered sines)
    const t = this.swayT;
    const swayYaw = (Math.sin(t * 0.53) * 0.4 + Math.sin(t * 1.7 + 1.3) * 0.25 + Math.sin(t * 4.1) * 0.1) * 0.006;
    const swayPitch = (Math.sin(t * 0.61 + 2) * 0.35 + Math.sin(t * 2.3) * 0.2) * 0.005;
    const swayRoll = (Math.sin(t * 0.47 + 4) * 0.3 + Math.sin(t * 1.9 + 1) * 0.2) * 0.008;
    // micro shake
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const micro = 0.0012 + this.shake * 0.01;
    const mx = (Math.sin(t * 31.7) + Math.sin(t * 47.3)) * micro;
    const my = (Math.sin(t * 28.3 + 1) + Math.sin(t * 52.1)) * micro;

    // focus hunting: subtle fov breathing
    const focusPulse = Math.sin(this.focusT * 0.9) * 0.5 + Math.sin(this.focusT * 0.23) * 0.5;
    const fov = 72 + focusPulse * 0.6;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // emote handling (sit adjusts eye height; others are avatar-only)
    if (this.emoteT > 0) {
      this.emoteT -= dt;
      if (this.emoteT <= 0) {
        if (this.emote === 'sit') this.sitting = false;
        this.emote = '';
      }
    }

    // camera placement (camera is world-anchored; player group is for avatar)
    const eyeH = this.eyeHeight();
    this.camera.position.set(
      this.pos.x + bobX * 0.3,
      eyeH + bobY + Math.sin(t * 0.8) * 0.004,
      this.pos.z
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + swayYaw + mx;
    this.camera.rotation.x = this.pitch + swayPitch + my;
    this.camera.rotation.z = swayRoll * 0.6 + bobX * 0.15;

    // NOTE: this.pos.y stores the eye height target for networking;
    // we keep it constant-ish here (flat world for now)
    this.pos.y = eyeH;
  }

  collideAxis(x, z, cols, isX) {
    // walls as AABBs/circles; simple push-out
    for (const c of cols) {
      if (c.r !== undefined) {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz);
        const minD = c.r + RADIUS;
        if (d < minD && d > 0.0001) {
          const push = (minD - d) / d;
          if (isX) x += dx * push; else z += dz * push;
        }
      } else {
        const hw = c.hw + RADIUS, hd = c.hd + RADIUS;
        const dx = x - c.x, dz = z - c.z;
        if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
          if (isX) {
            x = c.x + (dx > 0 ? hw : -hw);
          } else {
            z = c.z + (dz > 0 ? hd : -hd);
          }
        }
      }
    }
    return isX ? x : z;
  }

  triggerEmote(e) {
    this.emote = e;
    this.emoteT = e === 'dance' ? 8 : e === 'sit' ? 600 : 2.6;
    if (e === 'sit') { this.sitting = true; this.emoteT = 600; }
  }

  trauma(a) { this.shake = Math.min(1, this.shake + a); }
}
