// Camera-mounted flashlight with battery, soft cone, subtle flicker.
// The beam follows the camera every frame. Battery drains while ON and can be
// refilled from procedural pickups. Flicker intensifies as the battery dies.
import * as THREE from 'three';

const DRAIN_PER_SEC = 100 / 300; // ~5 minutes of light
const BATTERY_REFILL = 55;

export class Flashlight {
  constructor(camera, scene, audio, quality) {
    this.camera = camera;
    this.audio = audio;
    this.on = false;
    this.battery = 100;
    this.enabled = true;
    this.flickerT = 0;
    this.time = 0;

    this.spot = new THREE.SpotLight(0xfff2d8, 0, 30, 0.46, 0.55, 1.4);
    this.spot.visible = false;
    this.spot.castShadow = false;
    scene.add(this.spot);
    scene.add(this.spot.target);

    // faint fill so the player's immediate surroundings aren't pitch black
    this.fill = new THREE.PointLight(0xffe9c0, 0, 4, 2);
    this.fill.visible = false;
    scene.add(this.fill);
  }

  toggle() {
    if (this.on) {
      this.on = false;
    } else if (this.battery > 0.5) {
      this.on = true;
    } else {
      this.audio.click(); // dead click, no light
      return;
    }
    this.audio.click();
    this._apply();
  }

  setOn(v) {
    if (v === this.on) return;
    if (v && this.battery <= 0.5) return;
    this.on = v;
    this.audio.click();
    this._apply();
  }

  addBattery(n = BATTERY_REFILL) {
    this.battery = Math.min(100, this.battery + n);
    this.audio.batteryPickup();
  }

  _apply() {
    this.spot.visible = this.on;
    this.fill.visible = this.on;
  }

  update(dt) {
    this.time += dt;
    if (this.on) {
      this.battery = Math.max(0, this.battery - DRAIN_PER_SEC * dt);
      if (this.battery <= 0) {
        this.on = false;
        this.audio.click();
        this._apply();
      }
    }
    if (!this.on) return;

    // position at camera, slightly right/down like a handheld
    const p = this.camera.position;
    this.spot.position.set(p.x, p.y - 0.08, p.z);
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    this.spot.target.position.set(p.x + fwd.x * 10, p.y + fwd.y * 10, p.z + fwd.z * 10);
    this.fill.position.set(p.x, p.y, p.z);

    // subtle voltage wobble + heavy flicker when battery is low
    let f = 0.96 + Math.sin(this.time * 37) * 0.02 + Math.sin(this.time * 13.7) * 0.02;
    const low = this.battery < 22;
    if (low) {
      this.flickerT += dt;
      const panic = 1 - this.battery / 22;
      if (Math.sin(this.flickerT * (5 + panic * 14)) > 0.72 - panic * 0.3) f *= 0.35 + (1 - panic) * 0.5;
    }
    this.spot.intensity = 26 * f;
    this.fill.intensity = 0.35 * f;
  }
}
