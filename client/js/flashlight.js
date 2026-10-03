// Handheld flashlight: a tight, warm pocket of light with real inverse-square
// falloff, a hot core plus a soft spill halo, a faint volumetric beam and a
// subtle aim lag so it feels physically held. Battery drains while ON and can
// be refilled from procedural pickups; flicker intensifies as it dies.
//
// The beam is a camera-mounted SpotLight whose aim trails the camera by ~70ms,
// so looking left/right leaves the light behind for a heartbeat the way a real
// hand does — small enough to feel cinematic, never enough to hurt aiming.
import * as THREE from 'three';

const DRAIN_PER_SEC = 100 / 300; // ~5 minutes of light
const BATTERY_REFILL = 55;

// aim / position smoothing time constants (seconds). Tiny on purpose.
const AIM_TAU = 0.07;
const POS_TAU = 0.045;

export class Flashlight {
  constructor(camera, scene, audio, quality) {
    this.camera = camera;
    this.audio = audio;
    this.on = false;
    this.battery = 100;
    this.flickerT = 0;
    this.time = 0;
    this.quality = quality;

    const shadows = quality === 'high' || quality === 'ultra';

    // --- primary beam: narrow, physical falloff, soft edge ---
    // A tight hot core (≈9°) with a long throw. Penumbra keeps the rim soft so
    // the spot never reads as a hard, flat disc; decay 2 is true inverse-square.
    this.spot = new THREE.SpotLight(0xfff2d6, 0, 72, 0.165, 0.68, 2.0);
    this.spot.visible = false;
    this.spot.castShadow = shadows;
    if (shadows) {
      this.spot.shadow.mapSize.set(1024, 1024);
      this.spot.shadow.camera.near = 0.3;
      this.spot.shadow.camera.far = 72;
      this.spot.shadow.bias = -0.0016;
      this.spot.shadow.radius = 1.6;
    }
    scene.add(this.spot);
    scene.add(this.spot.target);

    // --- spill halo: a wider, dimmer second cone gives the beam a soft edge
    //     and a little throw light, so surfaces respond naturally instead of
    //     the single flat cone the old light produced. Kept deliberately weak
    //     so the darkness outside the beam stays dark. ---
    this.spill = new THREE.SpotLight(0xffe6bd, 0, 30, 0.44, 0.92, 2.0);
    this.spill.visible = false;
    scene.add(this.spill);
    scene.add(this.spill.target);

    // faint, tight fill so the player's own feet/held items are not pitch black
    this.fill = new THREE.PointLight(0xffe9c0, 0, 2.4, 2);
    this.fill.visible = false;
    scene.add(this.fill);

    // volumetric beam: a translucent cone with a length + edge gradient so it
    // reads as a shaft of light, not a solid cone. Additive, no depth write.
    const beamGeo = new THREE.CylinderGeometry(0.015, 0.42, 8.0, 20, 1, true);
    beamGeo.translate(0, -4.0, 0);
    beamGeo.rotateX(-Math.PI / 2);
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uColor: { value: new THREE.Color(0xfff0d0) },
        uOpacity: { value: 0.0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          // fade along the length (brightest near the lens) and toward the edge
          float len = clamp(vUv.y, 0.0, 1.0);
          float along = pow(len, 2.0);
          float edge = smoothstep(0.0, 0.5, 1.0 - abs(vUv.x - 0.5) * 2.0);
          float a = uOpacity * along * mix(0.2, 1.0, edge);
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.visible = false;
    this.beam.renderOrder = 999;
    scene.add(this.beam);

    // held-light state: the smoothed hand position and aim direction
    this._aim = new THREE.Vector3(0, 0, -1);
    this._hand = new THREE.Vector3();
    this._handInit = false;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
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
  }

  addBattery(n = BATTERY_REFILL) {
    this.battery = Math.min(100, this.battery + n);
    this.audio.batteryPickup();
  }

  // snap the held light back to the camera with no lag — used on respawn / level
  // start so the first frame after a hard cut is not the old aim direction
  reset() {
    this.on = false;
    this._handInit = false;
    this._aim.set(0, 0, -1);
    this.flickerT = 0;
    this._apply();
  }

  _apply() {
    this.spot.visible = this.on;
    this.spill.visible = this.on;
    this.fill.visible = this.on;
    this.beam.visible = this.on;
    // give the light a live base the instant it switches on, before the next
    // update() refines it with wobble/flicker (matters for that first frame)
    this.spot.intensity = this.on ? 340 : 0;
    this.spill.intensity = this.on ? 52 : 0;
    this.fill.intensity = this.on ? 0.3 : 0;
    this.beam.material.uniforms.uOpacity.value = this.on ? 0.024 : 0;
  }

  dispose(scene) {
    scene.remove(this.spot);
    scene.remove(this.spot.target);
    scene.remove(this.spill);
    scene.remove(this.spill.target);
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
        this._click();
        this._apply();
      }
    }
    if (!this.on) return;

    const cam = this.camera;
    const p = cam.position;

    // getWorldDirection refreshes the camera's world matrix; read the hand
    // basis AFTER it so the mount point uses this frame's orientation
    cam.getWorldDirection(this._fwd);
    const cf = cam.matrixWorld;
    this._right.setFromMatrixColumn(cf, 0);
    this._up.setFromMatrixColumn(cf, 1);
    const mountX = p.x + this._right.x * 0.16 - this._up.x * 0.11;
    const mountY = p.y + this._right.y * 0.16 - this._up.y * 0.11;
    const mountZ = p.z + this._right.z * 0.16 - this._up.z * 0.11;

    // position lags the camera a hair (translational inertia)
    const step = Math.max(0.0001, dt);
    const kp = 1 - Math.exp(-step / POS_TAU);
    if (!this._handInit) { this._hand.set(mountX, mountY, mountZ); this._handInit = true; }
    this._hand.x += (mountX - this._hand.x) * kp;
    this._hand.y += (mountY - this._hand.y) * kp;
    this._hand.z += (mountZ - this._hand.z) * kp;
    const hx = this._hand.x, hy = this._hand.y, hz = this._hand.z;

    // aim lags the view (rotational inertia) — the core of the "held" feel
    const ka = 1 - Math.exp(-step / AIM_TAU);
    this._aim.x += (this._fwd.x - this._aim.x) * ka;
    this._aim.y += (this._fwd.y - this._aim.y) * ka;
    this._aim.z += (this._fwd.z - this._aim.z) * ka;
    this._aim.normalize();

    // primary + spill share the same aim; spill is wider and dimmer
    this.spot.position.set(hx, hy, hz);
    this.spot.target.position.set(hx + this._aim.x * 20, hy + this._aim.y * 20, hz + this._aim.z * 20);
    this.spill.position.set(hx, hy, hz);
    this.spill.target.position.copy(this.spot.target.position);
    this.fill.position.set(p.x, p.y - 0.05, p.z);
    this.beam.position.set(hx, hy, hz);
    this.beam.lookAt(this.spot.target.position);

    // subtle voltage wobble + heavy flicker when the battery is low
    let f = 0.96 + Math.sin(this.time * 37) * 0.02 + Math.sin(this.time * 13.7) * 0.02;
    const low = this.battery < 22;
    if (low) {
      this.flickerT += dt;
      const panic = 1 - this.battery / 22;
      if (Math.sin(this.flickerT * (5 + panic * 14)) > 0.72 - panic * 0.3) f *= 0.35 + (1 - panic) * 0.5;
    }
    this.spot.intensity = 340 * f;
    this.spill.intensity = 52 * f;
    this.fill.intensity = 0.3 * f;
    this.beam.material.uniforms.uOpacity.value = 0.024 * f;
  }
}
