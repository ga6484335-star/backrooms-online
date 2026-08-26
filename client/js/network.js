// Network client — thin wrapper around the WebSocket protocol.
export class Network {
  constructor() {
    this.ws = null;
    this.id = null;
    this.token = null;   // session token for rejoin after a dropped connection
    this.room = null;    // {code, seed, level, state, host}
    this.players = new Map(); // id -> {id,name,color,host}
    this.handlers = {};
    this.sendT = 0;
    this.connected = false;
    this.intentionalClose = false; // explicit leave: suppress auto-reconnect
    this.lastMsgAt = 0;  // watchdog: silence on an open socket = dead connection
  }

  on(t, fn) { this.handlers[t] = fn; }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      this.ws = ws;
      this.intentionalClose = false;
      let settled = false;
      ws.onopen = () => { this.connected = true; this.lastMsgAt = performance.now(); settled = true; resolve(); };
      ws.onerror = (e) => { if (!settled) { settled = true; reject(e); } };
      ws.onclose = () => {
        this.connected = false;
        if (this.handlers.close) this.handlers.close(this.intentionalClose);
      };
      ws.onmessage = (ev) => {
        this.lastMsgAt = performance.now();
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        const h = this.handlers[msg.t];
        if (h) h(msg);
      };
    });
  }

  // Hard-reset a socket that looks dead but never fired onclose (mobile NATs).
  forceClose() {
    const ws = this.ws;
    if (!ws) return;
    try { ws.onclose = null; ws.close(); } catch (e) { /* already closed */ }
    this.connected = false;
    if (this.handlers.close) this.handlers.close(this.intentionalClose);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  createRoom(name) { this.send({ t: 'create', name }); }
  joinRoom(code, name) { this.send({ t: 'join', code, name }); }
  rejoin(code, token) { this.send({ t: 'rejoin', code, token }); }
  startGame(level) { this.send({ t: 'start', level }); }
  leave() {
    this.intentionalClose = true;
    this.send({ t: 'leave' });
  }

  sendState(px, py, pz, yaw, pitch, anim, emote, fl, dead) {
    this.send({
      t: 'u',
      p: [+px.toFixed(2), +py.toFixed(2), +pz.toFixed(2)],
      r: [+yaw.toFixed(3), +pitch.toFixed(3)],
      a: anim, e: emote, fl: fl ? 1 : 0, d: dead ? 1 : 0,
    });
  }

  sendEmote(e) { this.send({ t: 'emote', e }); }
  sendEvent(kind, data, target) { this.send({ t: 'ev', kind, data, target }); }
  sendMonsters(list) { this.send({ t: 'ms', list }); }
}
