// Renderer + full post-processing chain:
// scene -> EffectComposer(Bloom -> VHS custom shader -> Output)
// The VHS shader does grain, scanlines, chromatic aberration, vignette,
// lens distortion, tracking wobble, occasional glitch displacement and
// subtle color instability. It is deliberately restrained.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VHSShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uIntensity: { value: 1.0 },
    uGrain: { value: 0.055 },
    uScan: { value: 0.5 },
    uChroma: { value: 0.0016 },
    uVig: { value: 0.42 },
    uGlitch: { value: 0.0 },
    uTracking: { value: 0.0 },
    uNoiseSeed: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uIntensity, uGrain, uScan, uChroma, uVig, uGlitch, uTracking, uNoiseSeed;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.23 + uNoiseSeed);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;

      // subtle barrel distortion
      vec2 cc = uv - 0.5;
      float r2 = dot(cc, cc);
      uv = uv + cc * r2 * 0.06 * uIntensity;

      // tracking wobble
      uv.x += sin(uv.y * 60.0 + uTime * 3.0) * 0.0006 * uIntensity * (1.0 + uTracking * 8.0);
      uv.y += sin(uv.x * 40.0 + uTime * 2.0) * 0.0002 * uIntensity;

      // horizontal glitch bands
      if (uGlitch > 0.001) {
        float band = step(0.96, fract(uv.y * 24.0 + uTime * 7.0));
        uv.x += band * (hash(vec2(uTime, uv.y)) - 0.5) * 0.06 * uGlitch;
        // occasional full-frame row shift
        float rowShift = step(0.995, fract(uTime * 0.9)) * (hash(vec2(uTime, 1.0)) - 0.5) * 0.03 * uGlitch;
        uv.x += rowShift;
      }

      // chromatic aberration (increases at edges)
      float ca = uChroma * (1.0 + r2 * 6.0) * uIntensity;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;

      // scanlines
      float scan = sin(uv.y * 900.0 + uTime * 8.0) * 0.5 + 0.5;
      col *= 1.0 - scan * 0.05 * uScan * uIntensity;

      // film grain
      float g = hash(uv * vec2(1280.0, 720.0) + fract(uTime) * 7.0);
      col += (g - 0.5) * uGrain * uIntensity;

      // color instability — slight hue wobble
      col.r *= 1.0 + sin(uTime * 0.7) * 0.012 * uIntensity;
      col.b *= 1.0 + cos(uTime * 0.9) * 0.012 * uIntensity;

      // vignette
      float vig = smoothstep(0.95, 0.35, r2 * (1.4 + uVig));
      col *= mix(1.0, vig, uVig);

      // slight black level lift like an old CCD
      col = col * 0.96 + vec3(0.012, 0.011, 0.014);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class RendererEngine {
  constructor(canvas) {
    this.canvas = canvas;
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas, antialias: false, powerPreference: 'high-performance', stencil: false,
        failIfMajorPerformanceCaveat: false,
      });
    } catch (e) {
      console.error('WebGL unavailable:', e.message);
    }
    if (!renderer) {
      // graceful fallback: show an error overlay instead of crashing the whole app
      this.failed = true;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 220);
      this.renderer = {
        setPixelRatio() {}, setSize() {}, outputColorSpace: '', toneMapping: 0,
        toneMappingExposure: 1, shadowMap: { enabled: false }, render() {}, dispose() {},
      };
      const msg = document.createElement('div');
      msg.id = 'webgl-error';
      msg.textContent = 'WEBGL UNAVAILABLE — THIS DEVICE CANNOT RENDER THE BACKROOMS';
      document.body.appendChild(msg);
      return;
    }
    this.failed = false;
    this.renderer = renderer;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    // Dynamic shadow maps are ON so the flashlight can carve real shadows out
    // of the beam (doorframes, props). Only the flashlight spot casts; the rest
    // of the world stays unlit, so the cost is one 1024² map at high/ultra and
    // nothing at low (the spot stops casting there).
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 220);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Bloom is kept only for genuine light sources (ceiling panels, sparks).
    // Strength/radius are deliberately low and the threshold high, so an
    // ordinary lit wall or the flashlight hotspot does NOT smear into a glow.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.10, 0.3, 0.95);
    this.composer.addPass(this.bloom);

    this.vhs = new ShaderPass(VHSShader);
    this.composer.addPass(this.vhs);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.quality = 'high';
    this.vhsEnabled = true;
    this.exposureTarget = 1.0;
    this.exposure = 1.0;
    this.glitchTimer = 0;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  setQuality(q) {
    if (this.failed) return;
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const scale = { low: 0.5, medium: 0.7, high: Math.min(dpr, 1.6), ultra: Math.min(dpr, 2) }[q];
    this.renderer.setPixelRatio(scale);
    this.bloom.enabled = q !== 'low';
    this.bloom.strength = q === 'ultra' ? 0.16 : 0.10;
    this.resize();
  }

  setVHS(on) {
    if (this.failed) return;
    this.vhsEnabled = on;
    this.vhs.enabled = on;
  }

  resize() {
    if (this.failed) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // exposure adapts to scene brightness estimate (0 dark .. 1 bright)
  adaptExposure(brightness, dt) {
    this.exposureTarget = THREE.MathUtils.lerp(1.3, 0.85, Math.min(1, brightness));
    this.exposure += (this.exposureTarget - this.exposure) * Math.min(1, dt * 1.5);
    this.renderer.toneMappingExposure = this.exposure;
  }

  bumpGlitch(amount = 1) { this.glitchTimer = Math.max(this.glitchTimer, amount); }

  render(dt, time) {
    if (this.failed) return;
    const u = this.vhs.uniforms;
    u.uTime.value = time;
    this.glitchTimer = Math.max(0, this.glitchTimer - dt * 2.2);
    const baseGlitch = Math.random() < dt * 0.22 ? 0.5 : 0; // rare spontaneous glitch
    u.uGlitch.value = Math.max(baseGlitch, this.glitchTimer);
    u.uTracking.value = Math.max(0, Math.sin(time * 0.13) - 0.96) * 12;
    u.uNoiseSeed.value = Math.random();
    this.composer.render();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.composer.dispose();
    this.renderer.dispose();
  }
}
