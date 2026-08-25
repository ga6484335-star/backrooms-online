// Menu / lobby UI wiring + animated VHS static backgrounds.
export class MenuUI {
  constructor(cb) {
    this.cb = cb; // {create(name), join(code,name), start(level), leave(), applySettings(s), resume(), quit()}
    this.el = (id) => document.getElementById(id);

    this._bindButtons();
    this._startStatic();
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
    E('btn-settings').onclick = () => this._show('settings-panel');
    E('btn-settings-back').onclick = () => { this._applySettings(); this._show('menu'); };
    E('btn-start').onclick = () => {
      const lv = parseInt(E('lobby-level').value, 10);
      this.cb.start(lv < 0 ? (Math.random() * 6) | 0 : lv);
    };
    E('btn-leave-lobby').onclick = () => this.cb.leave();
    E('set-fullscreen').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    };
    E('btn-resume').onclick = () => this.cb.resume();
    E('btn-quit').onclick = () => this.cb.quit();
    E('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') E('btn-join-go').click(); });
    E('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') E('btn-create').click(); });

    // load persisted settings
    try {
      const s = JSON.parse(localStorage.getItem('br_settings') || '{}');
      if (s.quality) E('set-quality').value = s.quality;
      if (s.sens) E('set-sens').value = s.sens;
      if (s.volume !== undefined) E('set-volume').value = s.volume;
      if (s.vhs !== undefined) E('set-vhs').value = String(s.vhs);
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
