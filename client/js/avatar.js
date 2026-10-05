// Low-poly player avatars with procedural animation: walk, run, idle sway,
// plus emotes (wave, point, laugh, sit, scared, dance). Rendered for remote
// players and synced over the network.
import * as THREE from 'three';
import { flashlightBeamMap } from './flashlight.js';

const BODY = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });

export function makeAvatar(color, name) {
  const g = new THREE.Group();
  const mat = BODY.clone();
  mat.color = new THREE.Color(color);
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });

  const parts = {};
  // torso
  parts.torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.26), mat);
  parts.torso.position.y = 1.12;
  // head
  parts.head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.26), skin);
  parts.head.position.y = 1.62;
  // camcorder held in right hand
  parts.camera = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.2), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.4 }));
  // arms (pivot at shoulder)
  parts.armL = limb(mat, -0.28, 1.36, 0, 0.13, 0.52);
  parts.armR = limb(mat, 0.28, 1.36, 0, 0.13, 0.52);
  // legs (pivot at hip)
  parts.legL = limb(mat, -0.11, 0.82, 0, 0.16, 0.82);
  parts.legR = limb(mat, 0.11, 0.82, 0, 0.16, 0.82);
  parts.camera.position.set(0, -0.5, 0.16);
  parts.armR.add(parts.camera);

  for (const k of Object.keys(parts)) if (k !== 'camera') g.add(parts[k]);

  // flashlight attached to the camcorder (held in the right hand). Shares the
  // local beam cookie so remote beams have the same hot-core / soft-rim shape.
  const fl = new THREE.SpotLight(0xffffff, 0, 22, 0.20, 0.55, 2.0);
  fl.position.set(0, 1.5, 0.22);
  fl.map = flashlightBeamMap();
  const flTarget = new THREE.Object3D();
  flTarget.position.set(0, 1.4, 8);
  g.add(fl, flTarget);
  fl.target = flTarget;
  parts.flashlight = fl;

  // nametag sprite
  const tag = makeNameTag(name, color);
  tag.position.y = 2.05;
  g.add(tag);

  return { group: g, parts, tag, phase: Math.random() * 10, emoteT: 0 };
}

function limb(mat, x, y, z, w, len) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
  m.position.y = -len / 2;
  pivot.add(m);
  return pivot;
}

function makeNameTag(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 56;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, 0, 256, 56);
  ctx.font = '28px Courier New';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(name, 128, 38);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.1, 0.24, 1);
  return s;
}

export function animateAvatar(av, dt, anim, emote) {
  const p = av.parts;
  av.phase += dt * (anim === 'run' ? 11 : anim === 'walk' ? 6.5 : 1.6);
  const t = av.phase;

  // reset base
  let legL = 0, legR = 0, armL = 0, armR = 0, headY = 0, bodyY = 0, sit = false;

  if (anim === 'walk' || anim === 'run') {
    legL = Math.sin(t) * 0.7;
    legR = -Math.sin(t) * 0.7;
    armL = -Math.sin(t) * 0.55;
    armR = Math.sin(t) * 0.55;
    bodyY = Math.abs(Math.cos(t)) * 0.03;
  } else if (anim === 'sit') {
    sit = true;
    legL = -1.5; legR = -1.5;
  } else if (anim === 'jump') {
    legL = -0.9; legR = -0.6;
    armL = -0.5; armR = -0.5;
    bodyY = 0.04;
  } else {
    armL = Math.sin(t * 0.8) * 0.04;
    armR = -Math.sin(t * 0.8) * 0.04;
    headY = Math.sin(t * 0.6) * 0.03;
  }

  // emotes override
  switch (emote) {
    case 'wave':
      armR = -2.4 + Math.sin(t * 8) * 0.4; break;
    case 'point':
      armR = -1.5; break;
    case 'laugh':
      bodyY = Math.abs(Math.sin(t * 9)) * 0.05;
      headY = Math.sin(t * 9) * 0.08; break;
    case 'sit': {
      sit = true;
      legL = -1.5; legR = -1.5;
      break;
    }
    case 'scared':
      armL = -2.6; armR = -2.6;
      headY = -0.1; break;
    case 'dance': {
      const bt = t * 1.4;
      armL = -1.2 + Math.sin(bt * 2) * 1.3;
      armR = -1.2 - Math.sin(bt * 2) * 1.3;
      legL = Math.sin(bt) * 0.35;
      legR = -Math.sin(bt) * 0.35;
      bodyY = Math.abs(Math.sin(bt * 2)) * 0.09;
      av.group.rotation.y += Math.sin(bt) * 0.02;
      break;
    }
  }

  p.legL.rotation.x = legL;
  p.legR.rotation.x = legR;
  p.armL.rotation.x = armL;
  p.armR.rotation.x = armR;
  p.torso.position.y = 1.12 + bodyY - (sit ? 0.45 : 0);
  p.head.position.y = 1.62 + bodyY + headY - (sit ? 0.45 : 0);
  p.armL.position.y = 1.36 - (sit ? 0.45 : 0);
  p.armR.position.y = 1.36 - (sit ? 0.45 : 0);
  if (sit) { p.legL.position.y = 0.82 - 0.45; p.legR.position.y = 0.82 - 0.45; }
  else { p.legL.position.y = 0.82; p.legR.position.y = 0.82; }
}

// ---------------------------------------------------------------------------
// Remote player record: target state + interpolation + emote sync
export class RemotePlayers {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.players = new Map(); // id -> {avatar, target:{pos,rot,anim,emote}, name, color}
    this.stepTimer = new Map();
  }

  add(id, info) {
    if (this.players.has(id)) return;
    const av = makeAvatar(info.color, info.name);
    this.scene.add(av.group);
    this.players.set(id, {
      av, name: info.name, color: info.color,
      cur: { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 },
      tgt: { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0 },
      anim: 'idle', emote: '',
      lastSeen: performance.now(),
    });
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.scene.remove(p.av.group);
    this.players.delete(id);
  }

  applyState(list, selfId) {
    for (const row of list) {
      const [id, x, y, z, yaw, pitch, anim, emote, fl, dead] = row;
      if (id === selfId) continue;
      const p = this.players.get(id);
      if (!p) continue;
      p.tgt.x = x; p.tgt.y = y; p.tgt.z = z; p.tgt.yaw = yaw; p.tgt.pitch = pitch;
      p.anim = anim; p.emote = emote;
      p.cur.fl = fl; p.cur.dead = !!dead;
      p.lastSeen = performance.now();
    }
  }

  update(dt, camPos) {
    const k = Math.min(1, dt * 12);
    for (const [id, p] of this.players) {
      p.cur.x += (p.tgt.x - p.cur.x) * k;
      p.cur.y += (p.tgt.y - p.cur.y) * k;
      p.cur.z += (p.tgt.z - p.cur.z) * k;
      let dy = p.tgt.yaw - p.cur.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.cur.yaw += dy * k;
      p.cur.pitch += (p.tgt.pitch - p.cur.pitch) * k;

      // vertical offset: cur.y is the eye height (includes jump); base eye = 1.62
      const yOff = Math.max(-0.7, (p.cur.y || 1.62) - 1.62);
      p.av.group.position.set(p.cur.x, yOff, p.cur.z);
      p.av.group.rotation.y = p.cur.yaw + Math.PI;
      p.av.parts.head.rotation.x = -p.cur.pitch * 0.7;
      animateAvatar(p.av, dt, p.anim, p.emote);

      // remote flashlight beam
      const fl = p.av.parts.flashlight;
      if (fl) {
        fl.intensity = p.cur.fl ? 18 : 0;
        // aim where the head points (pitch)
        fl.target.position.set(0, 1.4 - Math.sin(p.cur.pitch) * 6, 8 * Math.cos(p.cur.pitch));
      }
      // dead players lie on the floor
      p.av.group.rotation.x = p.cur.dead ? -Math.PI / 2 * 0.9 : 0;

      // positional footsteps for others
      if (p.anim !== 'idle') {
        const last = this.stepTimer.get(id) || 0;
        const now = performance.now();
        if (now - last > (p.anim === 'run' ? 270 : 430)) {
          this.stepTimer.set(id, now);
          this.audio.footstep('carpet', p.anim === 'run', p.cur.x, 1.5, p.cur.z, 0.6);
        }
      }
    }
  }

  nearestDistance(px, pz) {
    let d = 1e9;
    for (const p of this.players.values()) {
      d = Math.min(d, Math.hypot(p.cur.x - px, p.cur.z - pz));
    }
    return d;
  }
}
