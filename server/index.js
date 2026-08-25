'use strict';
// Backrooms online server: serves the client and runs the multiplayer protocol.
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { RoomManager, MAX_PLAYERS, sendSafe } = require('./rooms');

const PORT = parseInt(process.env.PORT || '12000', 10);
const ROOT = path.join(__dirname, '..');

const app = express();
app.use(express.static(path.join(ROOT, 'client'), { maxAge: '1h' }));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three'), { maxAge: '1d' }));
app.get('/health', (req, res) => res.json({ ok: true, rooms: roomManager.rooms.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const roomManager = new RoomManager();

// ---- protocol ------------------------------------------------------------
// client -> server
//  {t:'create', name}                 create a room, become host
//  {t:'join', code, name}             join an existing room
//  {t:'start'}                        host starts the game (seeds level)
//  {t:'u', p:[x,y,z], r:[yaw,pitch], a, e}  kinematic update
//  {t:'emote', e}                     trigger emote/dance
//  {t:'ev', kind, data, target?}      world event (relayed, seq'd)
//  {t:'ms', list}                     host monster snapshot relay
//  {t:'leave'}                        leave room
// server -> client
//  {t:'hello', id}
//  {t:'room', code, seed, level, state, host, players:[roster]}
//  {t:'peer', add|remove, player|id}
//  {t:'host', id}
//  {t:'err', msg}
//  {t:'st', list}                     tick: player kinematics
//  {t:'ev', ...}                      relayed world event
//  {t:'ms', list}                     monster snapshot from host
// ---------------------------------------------------------------------------

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let room = null;
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    if (typeof msg.t !== 'string') return;

    switch (msg.t) {
      case 'create': {
        if (room) break;
        room = roomManager.create();
        player = room.addPlayer(ws, msg.name);
        ws.send(JSON.stringify({ t: 'hello', id: player.id }));
        ws.send(JSON.stringify({
          t: 'room', code: room.code, seed: room.seed, level: room.level,
          state: room.state, host: room.hostId, players: room.roster(),
        }));
        break;
      }
      case 'join': {
        if (room) break;
        const target = roomManager.get(msg.code);
        if (!target) { ws.send(JSON.stringify({ t: 'err', msg: 'ROOM NOT FOUND' })); break; }
        if (target.players.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'err', msg: 'ROOM IS FULL' })); break; }
        room = target;
        player = room.addPlayer(ws, msg.name);
        if (!player) { ws.send(JSON.stringify({ t: 'err', msg: 'ROOM IS FULL' })); room = null; break; }
        ws.send(JSON.stringify({ t: 'hello', id: player.id }));
        ws.send(JSON.stringify({
          t: 'room', code: room.code, seed: room.seed, level: room.level,
          state: room.state, host: room.hostId, players: room.roster(), events: room.eventLog,
          monsters: room.monsterState,
        }));
        room.broadcast({ t: 'peer', add: true, player: { id: player.id, name: player.name, color: player.color, host: player.id === room.hostId } }, player.id);
        break;
      }
      case 'start': {
        if (!room || room.hostId !== player.id) break;
        room.state = 'playing';
        room.level = (msg.level | 0) || 0;
        room.broadcast({ t: 'start', level: room.level, seed: room.seed });
        break;
      }
      case 'u': {
        if (!room || !player) break;
        const p = msg.p, r = msg.r;
        if (Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) player.pos = p;
        if (Array.isArray(r) && r.length === 2 && r.every(Number.isFinite)) player.rot = r;
        if (typeof msg.a === 'string') player.anim = msg.a.slice(0, 16);
        if (typeof msg.e === 'string') player.emote = msg.e.slice(0, 16);
        break;
      }
      case 'emote': {
        if (!room || !player) break;
        player.emote = String(msg.e || '').slice(0, 16);
        room.relayEvent(player.id, 'emote', { id: player.id, e: player.emote });
        break;
      }
      case 'ev': {
        if (!room || !player) break;
        const kind = String(msg.kind || '').slice(0, 24);
        room.relayEvent(player.id, kind, msg.data, msg.target);
        break;
      }
      case 'ms': { // host-authoritative monster snapshots
        if (!room || !player || room.hostId !== player.id) break;
        // bound the payload
        const list = Array.isArray(msg.list) ? msg.list.slice(0, 24) : [];
        const out = { t: 'ms', list };
        const rawOut = JSON.stringify(out);
        for (const p of room.players.values()) {
          if (p.id === player.id) continue;
          sendSafe(p.ws, rawOut);
        }
        for (const m of list) if (m && m[0] !== undefined) room.monsterState[m[0]] = m;
        // prune monsters no longer reported
        const seen = new Set(list.map((m) => m && m[0]));
        for (const k of Object.keys(room.monsterState)) if (!seen.has(Number(k))) delete room.monsterState[k];
        break;
      }
      case 'leave': cleanup(); break;
    }
  });

  ws.on('close', () => cleanup());

  function cleanup() {
    if (!room || !player) return;
    room.relayEvent(player.id, 'peerleft', {});
    room.removePlayer(player.id);
    room.broadcast({ t: 'peer', add: false, id: player.id });
    room = null; player = null;
  }
});

// heartbeat: drop dead sockets
const hb = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* closed */ }
  }
}, 15000);
hb.unref();

// state tick: 12 Hz per non-empty room
const tick = setInterval(() => {
  for (const room of roomManager.rooms.values()) {
    if (room.players.size) room.broadcast(room.statePacket());
  }
}, 83);
tick.unref();

server.listen(PORT, () => {
  console.log(`[backrooms] server listening on http://0.0.0.0:${PORT}`);
});
