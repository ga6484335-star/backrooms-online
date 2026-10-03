'use strict';

const crypto = require('crypto');

const MAX_PLAYERS = 8;
// How long a dropped player's slot is kept so they can rejoin with their token.
const REJOIN_GRACE_MS = parseInt(process.env.REJOIN_GRACE_MS || '90000', 10);
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no ambiguous chars
const ROOM_TTL_IDLE = 1000 * 60 * 30;      // 30 min with no players
const ROOM_TTL_LOBBY = 1000 * 60 * 60 * 3; // 3 h lobby lifetime max

function makeCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  return c;
}

let nextPlayerId = 1;

class Room {
  constructor(code) {
    this.code = code;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.level = 0;
    this.hostId = null;
    this.players = new Map(); // id -> Player
    this.state = 'lobby';     // lobby | playing
    this.createdAt = Date.now();
    this.eventSeq = 0;
    this.eventLog = [];       // recent world events for late joiners
    this.doorStates = new Map(); // door key -> open boolean (authoritative)
    this.monsterState = {};   // last reported monster snapshot per monster id
  }

  addPlayer(ws, name) {
    if (this.players.size >= MAX_PLAYERS) return null;
    const id = nextPlayerId++;
    const player = {
      id, ws,
      token: crypto.randomBytes(12).toString('hex'),
      disconnected: false,
      dcTimer: null,
      name: (name || 'EXPLORER').toString().slice(0, 16).toUpperCase() || 'EXPLORER',
      pos: [0, 0, 0],
      rot: [0, 0],
      anim: 'idle',
      emote: '',
      fl: 0,
      dead: false,
      joined: Date.now(),
      color: pickColor(this.players.size),
    };
    this.players.set(id, player);
    if (this.hostId === null) this.hostId = id;
    return player;
  }

  // Socket dropped: keep the slot for REJOIN_GRACE_MS so the player can return.
  markDisconnected(id) {
    const p = this.players.get(id);
    if (!p || p.disconnected) return;
    p.disconnected = true;
    p.ws = null;
    p.dcTimer = setTimeout(() => {
      if (p.disconnected) {
        this.relayEvent(id, 'peerleft', {});
        this.removePlayer(id);
        this.broadcast({ t: 'peer', add: false, id });
      }
    }, REJOIN_GRACE_MS);
    if (p.dcTimer.unref) p.dcTimer.unref();
  }

  // Reattach a new socket to a previously disconnected player (same id/token).
  reattach(ws, token) {
    for (const p of this.players.values()) {
      if (p.token === token && p.disconnected) {
        p.ws = ws;
        p.disconnected = false;
        if (p.dcTimer) { clearTimeout(p.dcTimer); p.dcTimer = null; }
        return p;
      }
    }
    return null;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p && p.dcTimer) clearTimeout(p.dcTimer);
    this.players.delete(id);
    if (this.hostId === id) {
      const next = this.players.keys().next();
      this.hostId = next.done ? null : next.value;
      if (this.hostId !== null) {
        this.broadcast({ t: 'host', id: this.hostId });
      }
    }
  }

  getPlayer(id) { return this.players.get(id); }

  roster() {
    const list = [];
    for (const p of this.players.values()) {
      list.push({ id: p.id, name: p.name, color: p.color, host: p.id === this.hostId });
    }
    return list;
  }

  statePacket() {
    const list = [];
    for (const p of this.players.values()) {
      list.push([p.id, p.pos[0], p.pos[1], p.pos[2], p.rot[0], p.rot[1], p.anim, p.emote, p.fl, p.dead ? 1 : 0]);
    }
    return { t: 'st', list };
  }

  broadcast(msg, exceptId) {
    const raw = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (exceptId !== undefined && p.id === exceptId) continue;
      sendSafe(p.ws, raw);
    }
  }

  // Relay a world event. targetId (optional) makes it private (hallucinations).
  relayEvent(fromId, kind, data, targetId) {
    this.eventSeq++;
    const msg = { t: 'ev', seq: this.eventSeq, kind, data, from: fromId };
    const raw = JSON.stringify(msg);
    if (targetId !== undefined && targetId !== null) {
      const t = this.players.get(targetId);
      if (t) sendSafe(t.ws, raw);
    } else {
      for (const p of this.players.values()) {
        if (p.id === fromId) continue;
        sendSafe(p.ws, raw);
      }
    }
    // Remember a small window of world-affecting events so late joiners can catch up
    if (kind === 'door' && data && data.key !== undefined) {
      this.doorStates.set(String(data.key), !!data.open);
    } else if (WORLD_EVENTS.has(kind)) {
      this.eventLog.push(msg);
      if (this.eventLog.length > 64) this.eventLog.shift();
    }
    // keep the room's nominal level in step so a fresh start/late join begins
    // at the right chapter (the event log still replays intermediate state)
    if ((kind === 'advance' || kind === 'noclip') && data && Number.isFinite(data.to ?? data.level)) {
      this.level = Number.isFinite(data.to) ? data.to : data.level;
    }
    return this.eventSeq;
  }

  isEmpty() { return this.players.size === 0; }
}

// Events that change persistent world/level state must be replayed to late
// joiners and reconnecting players. Progression events (objective sites, level
// advances, the finale) are included so co-op state never desyncs.
const WORLD_EVENTS = new Set(['reldoor', 'chunkmorph', 'lightdie', 'spawnmonster', 'caught', 'died', 'respawn', 'door', 'keypickup', 'battpickup', 'obj', 'cache', 'loot', 'advance', 'ending', 'noclip']);

function pickColor(i) {
  const colors = ['#d9b46c', '#8fa3c7', '#a3c78f', '#c78f8f', '#b48fd9', '#7ec8c8', '#c7b1a0', '#9ec78f'];
  return colors[i % colors.length];
}

function sendSafe(ws, data) {
  if (ws && ws.readyState === 1) {
    try { ws.send(data); } catch (e) { /* closed socket raced */ }
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map(); // code -> Room
    this.gcTimer = setInterval(() => this.gc(), 60000);
    this.gcTimer.unref();
  }

  create() {
    let code;
    do { code = makeCode(); } while (this.rooms.has(code));
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code) { return this.rooms.get(String(code || '').trim().toUpperCase()); }

  gc() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.isEmpty() && now - room.createdAt > (room.state === 'lobby' ? ROOM_TTL_LOBBY : ROOM_TTL_IDLE)) {
        this.rooms.delete(code);
      }
    }
  }
}

module.exports = { RoomManager, MAX_PLAYERS, sendSafe, REJOIN_GRACE_MS };
