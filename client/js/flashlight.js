// Camera-mounted flashlight with battery, soft cone, subtle flicker.
// The beam follows the camera every frame. Battery drains while ON and can be
// refilled from procedural pickups. Flicker intensifies as the battery dies.
// Includes a faint volumetric dust-cone so the beam reads in the darkness.
import * as THREE from 'three';

const DRAIN_PER_SEC = 100 / 300; // ~5 minutes of light
const BATTERY_REFILL = 55;

export class Flashlight {
  constructor(camera, scene, audio, quality) {
    this.camera = camera;
    this.audio = audio;
    this.on = false;
    this.battery = 100;
    this.flickerT = 0;
    this.time = 0;

    const shadows = quality === 'high' || quality === 'ultra';
    this.spot = new THREE.SpotLight(0xfff2d8, 0, 32, 0.46, 0.55, 1.2);
    this.spot.visible = false;
    this.spot.castShadow = shadows;
    if (shadows) {
      this.spot.shadow.mapSize.set(512, 512);
      this.spot.shadow.camera.near = 0.4;
      this.spot.shadow.camera.far = 32;
      this.spot.shadow.bias = -0.002;
    }
    scene.add(this.spot);
    scene.add(this.spot.target);

    // faint fill so the player's immediate surroundings aren't pitch black
    this.fill = new THREE.PointLight(0xffe9c0, 0, 4.5, 2);
    this.fill.visible = false;
    scene.add(this.fill);

    // volumetric beam: additive translucent cone aligned with the spotlight
    const coneGeo = new THREE.CylinderGeometry(0.03, 1.35, 9, 12, 1, true);
    coneGeo.translate(0, -4.5, 0);
    coneGeo.rotateX(-Math.PI / 2);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff0cf,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.beam = new THREE.Mesh(coneGeo, coneMat);
    this.beam.visible = false;
    this.beam.renderOrder = 999;
    scene.add(this.beam);
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
    this.beam.visible = this.on;
  }

  dispose(scene) {
    scene.remove(this.spot);
    scene.remove(this.spot.target);
    scene.remove(this.fill);
    scene.remove(this.beam);
    this.beam.geometry.dispose();
    this.beam.material.dispose();
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
    this.beam.position.copy(this.spot.position);
    this.beam.lookAt(this.spot.target.position);

    // subtle voltage wobble + heavy flicker when battery is low
    let f = 0.96 + Math.sin(this.time * 37) * 0.02 + Math.sin(this.time * 13.7) * 0.02;
    const low = this.battery < 22;
    if (low) {
      this.flickerT += dt;
      const panic = 1 - this.battery / 22;
      if (Math.sin(this.flickerT * (5 + panic * 14)) > 0.72 - panic * 0.3) f *= 0.35 + (1 - panic) * 0.5;
    }
    this.spot.intensity = 42 * f;
    this.fill.intensity = 0.4 * f;
    this.beam.material.opacity = 0.05 * f;
  }
}
