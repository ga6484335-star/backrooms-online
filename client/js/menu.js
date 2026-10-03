import * as THREE from "three";
import { buildMonster, MONSTER_TYPES } from "./monsters/defs.js";
// Menu / lobby UI wiring + animated VHS static backgrounds.
export class MenuUI {
  constructor(cb) {
    this.cb = cb; // {create(name), join(code,name), start(level), leave(), applySettings(s), resume(), quit()}
    this.el = (id) => document.getElementById(id);
    this.settingsFromGame = false; // settings opened from pause → back returns to game

    this._bindButtons();
    this._startStatic();
    this._monsterCards = null;
    this._monsterTypes = MONSTER_TYPES;
  }

  _bindButtons() {
    const E = this.el;
    E('btn-create').onclick = () => { this._hideAll(); this.cb.create(this._name()); };
    E('btn-join').onclick = () => { this._show('join-panel'); E('join-error').textContent = ''; };
    E('btn-join-go').onclick = () => {
      const code = E('join-code').value.trim().toUpperCase();
      if (code.length !== 6) { E('join-error').textContent = 'CODE MUST BE 6 CHARACTERS'; return; }
      this.cb.join(code, this._name());
    };
    E('btn-join-back').onclick = () => this._show('menu');
    E('btn-settings').onclick = () => { this.settingsFromGame = false; E('settings-hint').classList.add('hidden'); this._show('settings-panel'); };
    E('btn-monsters').onclick = () => { this._show('monsters-panel'); this._buildMonsterCards(); };
    E('btn-monsters-back').onclick = () => this._show('menu');
    E('btn-settings-back').onclick = () => {
      this._applySettings();
      if (this.settingsFromGame) {
        this.settingsFromGame = false;
        E('settings-panel').classList.add('hidden');
        E('settings-hint').classList.add('hidden');
        this.cb.resume(); // back returns straight into gameplay
      } else {
        this._show('menu');
      }
    };
    E('btn-start').onclick = () => {
      const lv = parseInt(E('lobby-level').value, 10);
      this.cb.start(lv < 0 ? (Math.random() * 7) | 0 : lv);
    };
    E('btn-leave-lobby').onclick = () => this.cb.leave();
    E('set-fullscreen').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    };
    // in-game pause menu
    E('btn-resume').onclick = () => this.cb.resume();
    E('btn-pause-settings').onclick = () => {
      this.settingsFromGame = true;
      E('settings-hint').classList.remove('hidden');
      E('pause-overlay').classList.add('hidden');
      E('settings-panel').classList.remove('hidden');
    };
    E('btn-quit').onclick = () => {
      // confirm before leaving the server
      E('pause-overlay').classList.add('hidden');
      E('leave-confirm').classList.remove('hidden');
    };
    E('btn-leave-cancel').onclick = () => {
      E('leave-confirm').classList.add('hidden');
      E('pause-overlay').classList.remove('hidden');
    };
    E('btn-leave-go').onclick = () => {
      E('leave-confirm').classList.add('hidden');
      this.cb.quit();
    };
    E('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') E('btn-join-go').click(); });
    E('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') E('btn-create').click(); });

    // load persisted settings
    try {
      const s = JSON.parse(localStorage.getItem('br_settings') || '{}');
      if (s.quality) E('set-quality').value = s.quality;
      if (s.sens) E('set-sens').value = s.sens;
      if (s.volume !== undefined) E('set-volume').value = s.volume;
      if (s.vhs !== undefined) E('set-vhs').value = String(s.vhs);
      if (s.voice !== undefined) E('set-voice').value = String(s.voice ? '1' : '0');
      if (s.name) E('name-input').value = s.name;
    } catch (e) {}
  }

  _name() {
    const v = this.el('name-input').value.trim().toUpperCase() || 'EXPLORER';
    try {
      const s = JSON.parse(localStorage.getItem('br_settings') || '{}');
      s.name = v;
      localStorage.setItem('br_settings', JSON.stringify(s));
    } catch (e) {}
    return v;
  }

  readSettings() {
    const E = this.el;
    return {
      quality: E('set-quality').value,
      sens: parseFloat(E('set-sens').value),
      volume: parseFloat(E('set-volume').value),
      vhs: E('set-vhs').value === '1',
      voice: E('set-voice').value === '1',
    };
  }

  _applySettings() {
    const s = this.readSettings();
    try { localStorage.setItem('br_settings', JSON.stringify({ ...s, name: this._name() })); } catch (e) {}
    this.cb.applySettings(s);
  }

  _hideAll() {
    for (const id of ['menu', 'join-panel', 'settings-panel', 'lobby']) {
      this.el(id).classList.add('hidden');
    }
  }
  _show(id) {
    this._hideAll();
    this.el(id).classList.remove('hidden');
  }

  showMenu() { this._show('menu'); }
  showLobby() { this._show('lobby'); }
  hideAll() { this._hideAll(); }

  setStatus(text) { this.el('menu-status').textContent = text; }

  showJoinError(msg) {
    this.el('join-error').textContent = msg;
    this._show('join-panel');
  }

  updateLobby(room) {
    const E = this.el;
    E('lobby-code').textContent = room.code;
    E('lobby-count').textContent = `PLAYERS: ${room.players.length}/8`;
    const ul = E('lobby-players');
    ul.innerHTML = '';
    for (const p of room.players) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot" style="background:${p.color}"></span>${escapeHtml(p.name)}${p.host ? '<span class="hosttag">HOST</span>' : ''}`;
      ul.appendChild(li);
    }
    // only host sees START
    const me = room.players.find((p) => p.id === room.meId);
    E('btn-start').style.display = me && me.host ? '' : 'none';
    E('lobby-level').disabled = !(me && me.host);
  }

  _buildMonsterCards() {
    if (this._monsterCards) return; // built once per session
    this._monsterCards = true;
    const grid = this.el('monster-grid');
    if (!grid) return;
    // static data about each monster: what it does + how to survive it
    const GUIDE = {
      watcher:   { d: 'Watches from a distance. Creeps closer when you look away.', e: 'Keep your eyes on it; it retreats if you stare.', danger: 'LOW' },
      stalker:   { d: 'Follows from the shadows and freezes when seen.', e: 'Spot it and back away slowly.', danger: 'MEDIUM' },
      hunter:    { d: 'Fast pack predator. Hears footsteps.', e: 'Run. Close doors. Break line of sight.', danger: 'HIGH' },
      ambusher:  { d: 'Sits motionless in darkness. Lunges when close.', e: 'Keep your distance; it won’t chase far.', danger: 'MEDIUM' },
      mimic:     { d: 'Looks like furniture until you touch it.', e: 'Don’t sit on things that aren’t chairs.', danger: 'MEDIUM' },
      shadow:    { d: 'A hole in the light. It watches.', e: 'It cannot hurt you — but it marks you.', danger: 'LOW' },
      runner:    { d: 'Very fast. Screams, then sprints.', e: 'Turn corners. It outruns stamina, not walls.', danger: 'HIGH' },
      crawler:   { d: 'Low, fast, many legs. Hunts sound in narrow spaces.', e: 'Stay quiet; move through open rooms.', danger: 'HIGH' },
      siren:     { d: 'Stands far away and sings.', e: 'Walk away. It is only luring you into the dark.', danger: 'LOW' },
      tallone:   { d: 'A silhouette at the end of a corridor.', e: 'It only moves when you aren’t looking. Keep walking.', danger: 'LOW' },
      hollow:    { d: 'Freezes in your flashlight. Lurches in the dark.', e: 'Light freezes it. Never lose sight of it.', danger: 'MEDIUM' },
      bonefiend: { d: 'White, wrong-jointed, hunts by sound.', e: 'Stay silent; it cannot see you, only hear you.', danger: 'HIGH' },
      walldweller: { d: 'A stain on the wall until you brush past.', e: 'Don’t touch the walls.', danger: 'HIGH' },
      deepone:   { d: 'Flooded areas only. Submerges under light.', e: 'Flashlight makes it dive. Cross quickly in the dark.', danger: 'HIGH' },
      ceiling:   { d: 'Hangs upside down. Drops when you linger below.', e: 'Don’t stand underneath it for more than 3 seconds.', danger: 'MEDIUM' },
      falseplayer: { d: 'Looks like your friend from far away.', e: 'If it walks wrong, run. It is not them.', danger: 'MEDIUM' },
      theunstoppable: { d: 'UNSTOPPABLE. CANNOT BE DEFEATED. ONLY ESCAPE.', e: 'RUN. Turn corners. Close doors. Break line of sight. It never stops.', danger: 'MAXIMUM' },
      leech:     { d: 'Low crawler. Lives in the dark and the flood.', e: 'Watch the floor. It is under you before you see it.', danger: 'MEDIUM' },
      king:      { d: '5m tall. Sees far, slow, crown of ribs.', e: 'Outrun it. It is slow — but it does not forget.', danger: 'HIGH' },
      flicker:   { d: 'Only exists between frames.', e: 'Blink. It teleports closer when you do.', danger: 'HIGH' },
      drifter:   { d: 'Only faces you sideways. Slides through doorways.', e: 'Keep it in your periphery. It hates direct light.', danger: 'MEDIUM' },
      statue:    { d: 'Perfectly still while watched. Closes distance when you blink.', e: 'Keep looking at it. Don’t blink.', danger: 'MEDIUM' },
      swarm:     { d: 'Many small things. Pile into the light.', e: 'Stay together. Alone they are slow.', danger: 'HIGH' },
      spitter:   { d: 'Waits at a doorway. Does not follow.', e: 'Don’t walk through the doorway it is guarding.', danger: 'MEDIUM' },
      drummer:   { d: 'Blind. Pounds walls. Hunts by sound only.', e: 'Stop walking. Turn off the flashlight.', danger: 'HIGH' },
      worm:      { d: 'Flooded levels only. Long, blind, moves through water.', e: 'Move slowly. Splashing tells it where you are.', danger: 'HIGH' },
      null:      { d: 'No voice. No footsteps. Stands where you were.', e: 'Never stop walking. It is always a step behind.', danger: 'MEDIUM' },
      thresher:  { d: 'Blade-arms. Cuts through corridors.', e: 'Turn into rooms. It can’t stop mid-corridor.', danger: 'HIGH' },
      rememberer: { d: 'Memorises rooms it has seen you in. Walks them in order.', e: 'Never backtrack. It knows the last room.', danger: 'HIGH' },
    };
    const grid2 = this.el('monster-grid');
    for (const [type, def] of Object.entries(this._monsterTypes || window.MONSTER_TYPES || {})) {
      if (type === 'shadow') continue; // hallucinations stay hidden
      const info = GUIDE[type] || { d: def.name + ' — behaviour unclassified.', e: 'Run.', danger: def.lethal ? 'HIGH' : 'LOW' };
      const card = document.createElement('div');
      card.className = 'monster-card' + (def.unstoppable ? ' unstoppable' : '');
      card.innerHTML = `<div class="mc-name">${def.name}</div><canvas></canvas>
        <div class="mc-tag">${def.lethal ? 'LETHAL' : 'WATCHES'}</div>
        <div class="mc-desc">${info.d}</div>
        <div class="mc-desc" style="margin-top:4px;"><em>Escape:</em> ${info.e}</div>
        <div class="mc-danger">${info.danger}</div>`;
      grid2.appendChild(card);
      // live 3D portrait: render the actual monster model in a tiny canvas
      const cvs = card.querySelector('canvas');
      try {
        const r = new THREE.WebGLRenderer({ canvas: cvs, alpha: true, antialias: false });
        r.setSize(180, 120, false);
        r.setPixelRatio(1);
        const sc = new THREE.Scene();
        sc.background = null;
        const cam = new THREE.PerspectiveCamera(50, 180 / 120, 0.1, 30);
        cam.position.set(0, 1.2, 4.2);
        cam.lookAt(0, 1.1, 0);
        sc.add(new THREE.AmbientLight(0x403828, 0.6));
        const key = new THREE.PointLight(0xc8b890, 18, 12);
        key.position.set(2, 2.5, 2);
        sc.add(key);
        const rim = new THREE.PointLight(0x6a7a8a, 8, 12);
        rim.position.set(-2, 1.6, -2);
        sc.add(rim);
        const mesh = buildMonster(type);
        // auto-frame the monster by its bounding box
        const box = new THREE.Box3().setFromObject(mesh);
        const h = box.max.y - box.min.y;
        const s2 = 2.4 / Math.max(h, 0.8);
        mesh.scale.setScalar(s2);
        mesh.position.y = -(box.min.y) * s2 - 0.1;
        sc.add(mesh);
        const clock = { t: Math.random() * 10 };
        const tick = () => {
          if (!cvs.isConnected) { r.dispose(); return; } // card was removed
          clock.t += 0.016;
          mesh.rotation.y = clock.t * 0.4;
          r.render(sc, cam);
          requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        // WebGL unavailable in headless/menu contexts: blank canvas is fine
        cvs.style.background = '#0a0804';
      }
    }
  }

  _startStatic() {
    // animated VHS static behind menu + lobby
    const mk = (canvasId) => {
      const c = this.el(canvasId);
      const ctx = c.getContext('2d');
      c.width = 160; c.height = 90;
      return () => {
        const img = ctx.createImageData(160, 90);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = (Math.random() * 255) | 0;
          d[i] = d[i + 1] = d[i + 2] = v * 0.16;
          d[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      };
    };
    const draws = [mk('menu-static'), mk('lobby-static')];
    let t = 0;
    const loop = () => {
      t++;
      if (t % 3 === 0) for (const d of draws) d();
      requestAnimationFrame(loop);
    };
    loop();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
