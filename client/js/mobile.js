// Mobile touch controls: virtual joystick (left), look area (right),
// RUN / INTERACT / EMOTE / DANCE buttons. Multi-touch capable.
export class MobileControls {
  constructor(player, onInteract, onEmote, onMenu) {
    this.player = player;
    this.onInteract = onInteract;
    this.onEmote = onEmote;
    this.onMenu = onMenu;
    this.enabled = false;

    this.root = document.getElementById('mobile-controls');
    this.joyZone = document.getElementById('joy-zone');
    this.joyBase = document.getElementById('joy-base');
    this.joyStick = document.getElementById('joy-stick');
    this.lookZone = document.getElementById('look-zone');

    this.joyId = null;
    this.lookId = null;
    this.lookLast = null;
    this.emoteIdx = 0;
    this.emotes = ['wave', 'point', 'laugh', 'sit', 'scared'];

    this._bind();
  }

  show() { this.root.classList.remove('hidden'); this.enabled = true; }
  hide() { this.root.classList.add('hidden'); this.enabled = false; }

  _bind() {
    // ---- joystick ----
    const startJoy = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (this.joyId === null) {
          this.joyId = t.identifier;
          const r = this.joyBase.getBoundingClientRect();
          this.joyCX = t.clientX; this.joyCY = t.clientY;
          this.joyBase.style.left = (t.clientX - 59) + 'px';
          this.joyBase.style.top = (t.clientY - 59) + 'px';
          this.joyBase.style.bottom = 'auto';
          this.joyBase.classList.add('on');
        }
      }
      e.preventDefault();
    };
    const moveJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          const dx = t.clientX - this.joyCX, dy = t.clientY - this.joyCY;
          const d = Math.hypot(dx, dy);
          const max = 48;
          const k = d > max ? max / d : 1;
          this.joyStick.style.left = (33 + dx * k) + 'px';
          this.joyStick.style.top = (33 + dy * k) + 'px';
          this.player.setJoystick((dx * k) / max, (-dy * k) / max); // up = forward
        } else if (t.identifier === this.lookId && this.lookLast) {
          this.player.addLook(t.clientX - this.lookLast.x, t.clientY - this.lookLast.y);
          this.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    };
    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          this.joyId = null;
          this.player.clearJoystick();
          this.joyStick.style.left = '33px'; this.joyStick.style.top = '33px';
          this.joyBase.classList.remove('on');
        }
        if (t.identifier === this.lookId) { this.lookId = null; this.lookLast = null; }
      }
    };

    this.joyZone.addEventListener('touchstart', startJoy, { passive: false });
    window.addEventListener('touchmove', moveJoy, { passive: false });
    window.addEventListener('touchend', endJoy);
    window.addEventListener('touchcancel', endJoy);

    // ---- look area ----
    this.lookZone.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (this.lookId === null) {
          this.lookId = t.identifier;
          this.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });

    // ---- buttons ----
    const run = document.getElementById('mb-run');
    run.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.player.mobileRun = !this.player.mobileRun;
      run.classList.toggle('on', this.player.mobileRun);
    }, { passive: false });

    document.getElementById('mb-interact').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.onInteract();
    }, { passive: false });

    document.getElementById('mb-scream').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.onScream) this.onScream();
    }, { passive: false });

    document.getElementById('mb-emote').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.onEmote(this.emotes[this.emoteIdx % this.emotes.length]);
      this.emoteIdx++;
    }, { passive: false });

    document.getElementById('mb-dance').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.onEmote('dance');
    }, { passive: false });

    const fb = document.getElementById('mb-flash');
    fb.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.onFlash) { this.onFlash(); fb.classList.toggle('on'); }
    }, { passive: false });

    const flb = document.getElementById('mb-flare');
    if (flb) flb.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.onFlare) this.onFlare();
    }, { passive: false });

    document.getElementById('mb-jump').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.player.jump();
    }, { passive: false });

    const sb = document.getElementById('mb-sit');
    sb.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.onEmote('sit'); // toggle: sit → stand
      sb.classList.toggle('on', this.player.sitting);
      sb.textContent = this.player.sitting ? 'STAND' : 'SIT';
    }, { passive: false });

    document.getElementById('mb-menu').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.onMenu();
    }, { passive: false });
  }
}
