// Network client — thin wrapper around the WebSocket protocol.
export class Network {
  constructor() {
    this.ws = null;
    this.id = null;
    this.room = null;    // {code, seed, level, state, host}
    this.players = new Map(); // id -> {id,name,color,host}
    this.handlers = {};
    this.sendT = 0;
    this.connected = false;
  }

  on(t, fn) { this.handlers[t] = fn; }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      this.ws = ws;
      ws.onopen = () => { this.connected = true; resolve(); };
      ws.onerror = (e) => reject(e);
      ws.onclose = () => { this.connected = false; if (this.handlers.close) this.handlers.close(); };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        const h = this.handlers[msg.t];
        if (h) h(msg);
      };
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  createRoom(name) { this.send({ t: 'create', name }); }
  joinRoom(code, name) { this.send({ t: 'join', code, name }); }
  startGame(level) { this.send({ t: 'start', level }); }
  leave() { this.send({ t: 'leave' }); }

  sendState(px, py, pz, yaw, pitch, anim, emote) {
    this.send({ t: 'u', p: [+px.toFixed(2), +py.toFixed(2), +pz.toFixed(2)], r: [+yaw.toFixed(3), +pitch.toFixed(3)], a: anim, e: emote });
  }

  sendEmote(e) { this.send({ t: 'emote', e }); }
  sendEvent(kind, data, target) { this.send({ t: 'ev', kind, data, target }); }
  sendMonsters(list) { this.send({ t: 'ms', list }); }
}
