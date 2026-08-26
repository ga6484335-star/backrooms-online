// ============================================================================
// THE BACKROOMS — main orchestrator.
// Boot → menu → lobby → game loop (player, world stream, lights, monsters,
// events, network, HUD). Quality presets + mobile controls included.
// ============================================================================
import * as THREE from 'three';
import { WorldModel, CELL } from './worldgen.js';
import { WorldManager } from './world/chunk.js';
import { LightManager } from './world/lights.js';
import { RendererEngine } from './renderer.js';
import { AudioEngine } from './audio.js';
import { PlayerController, isMobile } from './player.js';
import { RemotePlayers } from './avatar.js';
import { MonsterSystem } from './monsters/ai.js';
import { MONSTER_TYPES } from './monsters/defs.js';
import { HorrorEvents } from './monsters/index.js';
import { Network } from './network.js';
import { MobileControls } from './mobile.js';
import { MenuUI } from './menu.js';
import { Flashlight } from './flashlight.js';
import { noteText } from './notes.js';
import { getLevel, nextLevelFrom } from './levels.js';
import { rngFrom, hashStr } from './rng.js';

// ---------------------------------------------------------------------------
// boot
const canvas = document.getElementById('gl');
const engine = new RendererEngine(canvas);
const scene = engine.scene;
const camera = engine.camera;
const audio = new AudioEngine();
const net = new Network();

const player = new PlayerController(camera);
const remotePlayers = new RemotePlayers(scene, audio);

let world = null;
let worldMgr = null;
let lightMgr = null;
let monsters = null;
let events = null;
let mobile = null;
let gameState = 'menu'; // menu | lobby | playing
let isHost = false;
let settings = null;
let startTime = 0;
let doorToggles = new Map(); // "cx,cz,dir" -> boolean (net-synced; render state applied on chunk load)
let keyInventory = new Set(); // held rusty keys
let noteOverlayOpen = false;
let flash = null;
let dead = false;           // local player death state
let respawnT = 0;           // seconds until respawn allowed
let spectateIdx = 0;
let distTravelled = 0;      // metres walked this session (horror director)

// ---------------------------------------------------------------------------
// reconnection state
const SESSION_KEY = 'backrooms-session';
let reconnecting = false;
let reconnectAttempt = 0;
let reconnectTimer = null;

function saveSession(code) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, token: net.token }));
  } catch (e) { /* private mode */ }
}
function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    return s && s.code && s.token ? s : null;
  } catch (e) { return null; }
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}
function showNetBanner(text) {
  const b = E('net-banner');
  if (b) { b.textContent = text; b.classList.remove('hidden'); }
}
function hideNetBanner() {
  const b = E('net-banner');
  if (b) b.classList.add('hidden');
}

const E = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// settings
function defaultQuality() {
  if (isMobile()) return 'medium';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores >= 8 && mem >= 8) return 'ultra';
  if (cores >= 4) return 'high';
  return 'medium';
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('br_settings') || '{}');
    settings = {
      quality: s.quality || defaultQuality(),
      sens: s.sens || 1,
      volume: s.volume !== undefined ? s.volume : 0.8,
      vhs: s.vhs !== undefined ? !!s.vhs : true,
    };
  } catch (e) {
    settings = { quality: defaultQuality(), sens: 1, volume: 0.8, vhs: true };
  }
  E('set-quality').value = settings.quality;
  E('set-sens').value = settings.sens;
  E('set-volume').value = settings.volume;
  E('set-vhs').value = settings.vhs ? '1' : '0';
  applySettings(settings);
}

function applySettings(s) {
  settings = s;
  engine.setQuality(s.quality);
  engine.setVHS(s.vhs);
  player.sensitivity = s.sens;
  audio.setVolume(s.volume);
  if (worldMgr) worldMgr.setQuality(s.quality);
  if (lightMgr) lightMgr.setQuality(s.quality);
}

// ---------------------------------------------------------------------------
// menu UI
const menu = new MenuUI({
  create(name) { connectThen(() => net.createRoom(name)); },
  join(code, name) { connectThen(() => net.joinRoom(code, name)); },
  start(level) { net.startGame(level); },
  leave() { leaveToMenu(); },
  applySettings,
  resume() { togglePause(false); E('settings-panel').classList.add('hidden'); },
  quit() { togglePause(false); leaveToMenu(); },
});

async function connectThen(fn) {
  menu.setStatus('CONNECTING…');
  try {
    if (!net.connected) await net.connect();
    fn();
  } catch (e) {
    menu.setStatus('CONNECTION FAILED — RETRY');
  }
}

// ---------------------------------------------------------------------------
// network handlers
net.on('hello', (m) => { net.id = m.id; if (m.token) net.token = m.token; });
net.on('err', (m) => {
  if (reconnecting) { failReconnect(m.msg); return; }
  clearSession();
  menu.showJoinError(m.msg);
  menu.setStatus(m.msg);
});
net.on('room', (m) => {
  net.room = m;
  net.players.clear();
  for (const p of m.players) net.players.set(p.id, p);
  isHost = m.host === net.id;
  saveSession(m.code);
  window.__seed = m.seed; // debug hook for tests
  if (m.rejoin && gameState === 'playing') { resumeFromRejoin(m); return; }
  if (m.state === 'playing') {
    // joined (or page-refreshed) into a game already in progress
    startGame(m.seed, m.level);
    applyWorldReplay(m);
    return;
  }
  gameState = 'lobby';
  menu.showLobby();
  menu.updateLobby({ ...m, meId: net.id });
  audio.ensure();
  audio.resume();
});
net.on('peer', (m) => {
  if (m.add) {
    net.players.set(m.player.id, m.player);
    if (gameState === 'playing') remotePlayers.add(m.player.id, m.player);
  } else {
    net.players.delete(m.id);
    remotePlayers.remove(m.id);
  }
  if (net.room) {
    menu.updateLobby({ ...net.room, players: [...net.players.values()], meId: net.id });
  }
  updatePlayersHud();
});
net.on('host', (m) => {
  isHost = m.id === net.id;
  if (net.room) net.room.host = m.id;
  menu.updateLobby({ ...net.room, players: [...net.players.values()], meId: net.id });
});
net.on('start', (m) => {
  startGame(m.seed, m.level);
  // peers inherit doors the host (or earlier players) already toggled
  for (const [k, v] of Object.entries(m.doorStates || {})) {
    doorToggles.set(k, v);
    worldMgr.setDoorOpen(k, v);
  }
});
net.on('st', (m) => { if (gameState === 'playing') remotePlayers.applyState(m.list, net.id); });
net.on('ms', (m) => { if (monsters && !isHost) monsters.applySnapshot(m.list); });
net.on('ev', (m) => {
  if (gameState !== 'playing') return;
  switch (m.kind) {
    case 'emote': {
      const p = remotePlayers.players.get(m.data.id);
      if (p) { p.emote = m.data.e; }
      window.__lastRemoteEmote = m.data.e; // debug hook for tests
      break;
    }
    case 'chunkmorph': if (worldMgr) worldMgr.applyMorph(m.data); break;
    case 'lightdie': if (lightMgr) lightMgr.killFixture(m.data.key); break;
    case 'door':
      doorToggles.set(m.data.key, m.data.open);
      if (worldMgr) worldMgr.setDoorOpen(m.data.key, m.data.open);
      break;
    case 'battpickup': case 'keypickup': {
      const removed = worldMgr ? worldMgr.removeInteractable(m.data.id) : false;
      if (removed && m.kind === 'keypickup') keyInventory.add(m.data.id);
      break;
    }
    case 'noclip': levelTransition(m.data.level); break;
    case 'caught': {
      // someone was caught — if it was us, death flow runs locally via onCaught
      if (m.data.pid === -1 || m.data.pid === net.id) {
        localDeath();
      } else {
        flashText(`${net.players.get(m.data.pid)?.name || 'SOMEONE'} IS GONE`);
        audio.monsterAttack(player.pos.x + 6, 1.5, player.pos.z);
      }
      break;
    }
    case 'died': {
      if (monsters) monsters.notifyDeath();
      if (m.data.pid !== net.id) {
        flashText(`${net.players.get(m.data.pid)?.name || 'SOMEONE'} — SIGNAL LOST`);
      }
      break;
    }
    case 'respawn': {
      if (m.data.pid !== net.id) flashText(`${net.players.get(m.data.pid)?.name || 'SOMEONE'} IS BACK`);
      break;
    }
    default:
      if (events) events.fire(m.kind, player, m.data);
  }
});
net.on('close', (intentional) => {
  if (intentional || gameState === 'menu' || !net.room) return;
  if (reconnecting) { scheduleReconnect(); return; } // attempt itself dropped
  startReconnect();
});

// ---------------------------------------------------------------------------
// auto-reconnect: keep the game alive across dropped connections
function startReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  reconnectAttempt = 0;
  showNetBanner('RECONNECTING…');
  scheduleReconnect();
}

function scheduleReconnect() {
  if (!reconnecting) return;
  reconnectAttempt++;
  showNetBanner(`RECONNECTING… (${reconnectAttempt})`);
  const delay = Math.min(15000, 1000 * 2 ** (reconnectAttempt - 1));
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(tryReconnect, delay);
}

async function tryReconnect() {
  const sess = loadSession();
  if (!sess) { failReconnect('SESSION LOST'); return; }
  try {
    await net.connect();
    net.rejoin(sess.code, sess.token);
    // if neither 'room' nor 'err' arrives, the socket is half-dead: retry
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      if (reconnecting) net.forceClose();
    }, 8000);
  } catch (e) {
    if (reconnectAttempt >= 10) { failReconnect('CONNECTION LOST'); return; }
    scheduleReconnect();
  }
}

function failReconnect(reason) {
  reconnecting = false;
  clearTimeout(reconnectTimer);
  hideNetBanner();
  clearSession();
  leaveToMenu();
  menu.setStatus(`${reason || 'CONNECTION LOST'} — COULD NOT RECONNECT`);
}

// Reattach to the running game after a successful rejoin.
function resumeFromRejoin(m) {
  reconnecting = false;
  clearTimeout(reconnectTimer);
  hideNetBanner();
  // resync remote avatars with the authoritative roster
  for (const id of [...remotePlayers.players.keys()]) {
    if (!net.players.has(id)) remotePlayers.remove(id);
  }
  for (const [id, p] of net.players) {
    if (id !== net.id && !remotePlayers.players.has(id)) remotePlayers.add(id, p);
  }
  applyWorldReplay(m);
  updatePlayersHud();
  flashText('SIGNAL RESTORED');
}

// Replay world state the server kept for us (doors, morphs, dead lights, monsters).
function applyWorldReplay(m) {
  for (const [k, v] of Object.entries(m.doorStates || {})) {
    doorToggles.set(k, v);
    if (worldMgr) worldMgr.setDoorOpen(k, v);
  }
  for (const ev of m.events || []) {
    if (!ev || !ev.kind) continue;
    if (ev.kind === 'door' && ev.data) {
      doorToggles.set(ev.data.key, ev.data.open);
      if (worldMgr) worldMgr.setDoorOpen(ev.data.key, ev.data.open);
    } else if (ev.kind === 'chunkmorph' && worldMgr) {
      worldMgr.applyMorph(ev.data);
    } else if (ev.kind === 'lightdie' && lightMgr) {
      lightMgr.killFixture(ev.data.key);
    } else if ((ev.kind === 'keypickup' || ev.kind === 'battpickup') && worldMgr && ev.data) {
      worldMgr.removeInteractable(ev.data.id);
    }
  }
  if (m.monsters && monsters && !isHost) {
    monsters.applySnapshot(Object.values(m.monsters));
  }
}

// Watchdog: a socket that goes silent (no 12 Hz state ticks) is dead even if
// the OS hasn't noticed yet — force it closed so the reconnect flow starts.
setInterval(() => {
  if (net.connected && net.room && !reconnecting
      && performance.now() - net.lastMsgAt > 20000) {
    net.forceClose();
  }
}, 5000);

// ---------------------------------------------------------------------------
// game start
function startGame(seed, level) {
  gameState = 'playing';
  menu.hideAll();

  // world
  world = new WorldModel(seed, level);
  worldMgr = new WorldManager(scene, world, settings.quality);
  lightMgr = new LightManager(scene, settings.quality);
  monsters = new MonsterSystem(scene, world, worldMgr, audio, net, () => isHost);
  monsters.getLightAt = (x, z) => lightMgr.brightnessAt(x, z);
  events = new HorrorEvents(world, worldMgr, audio, engine, net);
  events.setHostFn(() => isHost);
  events.setLightMgr(lightMgr);
  events.onMessage = flashText;

  // flashlight
  if (flash) flash.dispose(scene);
  flash = new Flashlight(camera, scene, audio, settings.quality);
  dead = false;
  respawnT = 0;
  doorToggles = new Map();
  keyInventory = new Set();

  monsters.onNearCallback = (m, d) => {
    player.trauma(Math.max(0, 1 - d / 6) * 0.4);
    if (d < 3) audio.heartbeat(Math.max(0.3, 1 - d / 6));
  };
  monsters.onCaught = (m, p) => {
    net.sendEvent('caught', { pid: p.id });
    if (p.id === -1) localDeath();
  };
  monsters.lightMgr = lightMgr; // monsters can kill lights (walldweller reveal)
  monsters.onScare = () => {
    // non-lethal contact: pure dread, no death
    player.trauma(1);
    audio.heartbeat(1);
    engine.bumpGlitch(1.6);
    flashText('IT WAS NEVER THERE.');
  };

  // remote player avatars
  for (const [id, p] of net.players) {
    if (id !== net.id) remotePlayers.add(id, p);
  }

  // spawn position
  const idx = Math.max(0, net.players.size - 1);
  const [sx, sz] = world.spawnPoint(idx);
  player.teleport(sx, sz);
  player.yaw = player.yawTarget = Math.PI * 0.25;
  player.enabled = true;

  // dev/QA showcase: ?showcase=<type> spawns the species right in front of
  // the player with the flashlight on, for visual verification
  const showType = new URLSearchParams(location.search).get('showcase');
  if (showType && MONSTER_TYPES[showType]) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    const id = monsters.spawnMonster(showType, player.pos.x + fx * 6, player.pos.z + fz * 6);
    const mm = monsters.monsters.get(id);
    if (mm) mm.yaw = player.yaw + Math.PI; // face the camera
    if (flash && !flash.on) flash.toggle();
  }

  // ambience + fog
  const levelDef = getLevel(level);
  scene.fog = new THREE.FogExp2(levelDef.palette.fog, levelDef.palette.fogDensity);
  scene.background = new THREE.Color(levelDef.palette.fog);
  scene.children.filter((c) => c.isAmbientLight).forEach((c) => scene.remove(c));
  const amb = new THREE.AmbientLight(levelDef.palette.ambient, levelDef.palette.ambientI);
  amb.name = 'ambient';
  scene.add(amb);
  audio.ensure(); audio.resume();
  audio.startAmbience(levelDef);

  // HUD
  E('game-ui').classList.remove('hidden');
  E('cc-level').textContent = levelDef.name.split('—')[0].trim();
  E('cc-room').textContent = net.room ? `ROOM ${net.room.code}` : '';
  updatePlayersHud();

  if (player.mobile) {
    if (!mobile) {
      mobile = new MobileControls(player, doInteract, doEmote, togglePause);
      mobile.onFlash = () => { if (!dead && flash) flash.toggle(); };
    }
    mobile.show();
  } else {
    canvas.requestPointerLock?.().catch?.(() => {});
  }

  // intro fade
  startTime = performance.now();
  const fade = E('fade');
  fade.style.transition = 'opacity 3.5s ease';
  fade.classList.add('clear');
  audio.distantMetal(0.4);
}

function localDeath() {
  if (dead) return;
  dead = true;
  player.dead = true;
  player.enabled = false;
  player.resetState();
  togglePause(false); // ensure pause never swallows the death screen
  if (flash && flash.on) flash.setOn(false);
  if (monsters) monsters.notifyDeath(); // director: quiet mourning period
  net.sendEvent('died', { pid: net.id });
  // found-footage death: glitch hard, blackout, spectator / respawn
  engine.bumpGlitch(3.5);
  player.trauma(1);
  audio.monsterAttack(player.pos.x, 1.5, player.pos.z);
  audio.heartbeat(1);
  const fade = E('fade');
  fade.style.transition = 'opacity 0.12s ease';
  fade.classList.remove('clear');
  respawnT = 6;
  setTimeout(() => {
    if (gameState !== 'playing') return;
    E('death-overlay').classList.remove('hidden');
    E('death-sub').textContent = remotePlayers.players.size
      ? 'SPECTATING — [R] RESPAWN IN 6s'
      : 'RESPAWN IN 6s — [R]';
  }, 700);
}

function respawn() {
  dead = false;
  player.dead = false;
  const [sx, sz] = world.spawnPoint(0);
  player.teleport(sx, sz);
  player.resetState();
  player.enabled = !paused;
  player.trauma(0.4);
  if (flash) flash.battery = Math.max(flash.battery, 30); // mercy charge
  net.sendEvent('respawn', { pid: net.id });
  E('death-overlay').classList.add('hidden');
  const fade = E('fade');
  fade.style.transition = 'opacity 2.2s ease';
  fade.classList.add('clear');
}

function levelTransition(level) {
  if (!world) return;
  world.setLevel(level);
  // rebuild surroundings — door state and keys belong to the old level
  for (const key of [...worldMgr.chunks.keys()]) worldMgr.unload(key);
  doorToggles = new Map();
  keyInventory = new Set();
  const levelDef = getLevel(level);
  scene.fog = new THREE.FogExp2(levelDef.palette.fog, levelDef.palette.fogDensity);
  scene.background = new THREE.Color(levelDef.palette.fog);
  const amb = scene.getObjectByName('ambient');
  if (amb) { amb.color.set(levelDef.palette.ambient); amb.intensity = levelDef.palette.ambientI; }
  audio.stopAmbience();
  audio.startAmbience(levelDef);
  E('cc-level').textContent = levelDef.name.split('—')[0].trim();
  flashText(levelDef.name);
  engine.bumpGlitch(2);
  player.resetState(); // new level = fresh, safe posture
}

// ---------------------------------------------------------------------------
// interaction
let currentInteract = null;

function findInteractable() {
  if (!worldMgr) return null;
  const it = worldMgr.nearestInteractable(player.pos.x, player.pos.z);
  return it;
}

function doorPromptText(d) {
  const key = `${d.cx},${d.cz},${d.dir}`;
  if (d.locked) return keyInventory.has(`key:${key}`) ? 'UNLOCK DOOR' : 'LOCKED — REQUIRES KEY';
  const open = doorToggles.has(key) ? doorToggles.get(key) : d.open;
  return open ? 'CLOSE DOOR' : 'OPEN DOOR';
}

function doInteract() {
  if (dead) return;
  if (noteOverlayOpen) { closeNote(); return; }
  const it = currentInteract;
  if (!it) return;
  if (it.type === 'note') {
    openNote(it.data);
  } else if (it.type === 'battery') {
    flash.addBattery();
    worldMgr.removeInteractable(it.data.id);
    net.sendEvent('battpickup', { id: it.data.id }); // other clients remove it too
    flashText('BATTERY FOUND');
  } else if (it.type === 'key') {
    keyInventory.add(it.data.id);
    worldMgr.removeInteractable(it.data.id);
    net.sendEvent('keypickup', { id: it.data.id });
    audio.keyPick();
    flashText('RUSTY KEY FOUND');
  } else if (it.type === 'door') {
    const d = it.data;
    const key = `${d.cx},${d.cz},${d.dir}`;
    if (d.locked && !keyInventory.has(`key:${key}`)) {
      audio.doorLocked(d.x, d.z);
      flashText('LOCKED');
      return;
    }
    const open = !(doorToggles.has(key) ? doorToggles.get(key) : d.open);
    doorToggles.set(key, open);
    worldMgr.setDoorOpen(key, open);
    net.sendEvent('door', { key, open });
    if (open) audio.doorCreak(d.x, d.z); else audio.doorSlam(d.x, d.z);
    // is this a noclip door? (special room door)
    const cell = world.cellAt(d.cx, d.cz);
    const sp = cell.special;
    if (sp && sp.type === 'noclipdoor' && isHost) {
      const rng = rngFrom(hashStr(world.seed, `noclip:${d.cx},${d.cz}`));
      const dest = nextLevelFrom(rng, world.level);
      net.sendEvent('noclip', { level: dest });
      levelTransition(dest);
    }
  }
}

function openNote(n) {
  noteOverlayOpen = true;
  E('note-text').textContent = noteText(world.seed, world.level, n.id);
  E('note-overlay').classList.remove('hidden');
  audio.paper();
}
function closeNote() {
  noteOverlayOpen = false;
  E('note-overlay').classList.add('hidden');
}

function doEmote(e) {
  if (dead) return;
  player.triggerEmote(e);
  // network: reflect the ACTUAL resulting state (sit toggles on/off)
  net.sendEmote(player.emote || (player.sitting ? 'sit' : ''));
}

let paused = false;
function togglePause(force) {
  // state-of-truth is `paused`, not the DOM class — the pause overlay can be
  // hidden by other flows (settings, leave-confirm) while the game stays paused
  const wantShow = force !== undefined ? force : !paused;
  if (wantShow === paused) return;
  if (wantShow && dead) return; // death screen owns the screen
  paused = wantShow;
  E('pause-overlay').classList.toggle('hidden', !wantShow);
  // freeze local input while paused; world/net/monsters keep running
  player.enabled = !wantShow && !dead;
  if (mobile) mobile.enabled = !wantShow;
  if (wantShow) {
    player.keys.clear();
    document.exitPointerLock();
  } else if (!player.mobile) {
    canvas.requestPointerLock?.().catch?.(() => {});
  }
}

let lastHudMenuToggle = 0;
E('btn-hud-menu').addEventListener('click', () => {
  // hybrid/touch devices can fire click twice (tap + synthesized mouse click)
  const now = performance.now();
  if (now - lastHudMenuToggle < 350) return;
  lastHudMenuToggle = now;
  if (gameState === 'playing') togglePause();
});

E('emote-bar').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (b) doEmote(b.dataset.emote);
});

window.addEventListener('keydown', (e) => {
  if (gameState !== 'playing') return;
  if (paused) {
    if (e.code === 'Escape') togglePause(false);
    return;
  }
  if (e.code === 'KeyE') doInteract();
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyQ') doEmote('wave');
  if (e.code === 'KeyC') doEmote('sit'); // sit/stand toggle
  if (e.code === 'KeyF' && !dead && flash) flash.toggle();
  if (e.code === 'KeyR' && dead && respawnT <= 0) respawn();
});
canvas.addEventListener('click', () => {
  if (gameState === 'playing' && !player.mobile && !document.pointerLockElement) {
    canvas.requestPointerLock?.().catch?.(() => {});
  }
});

// ---------------------------------------------------------------------------
// HUD helpers
function updatePlayersHud() {
  const el = E('players-hud');
  el.innerHTML = '';
  for (const [id, p] of net.players) {
    const div = document.createElement('div');
    div.textContent = (id === net.id ? '▸ ' : '') + p.name;
    div.style.color = p.color;
    el.appendChild(div);
  }
}

let flashTimer = null;
function flashText(t) {
  const el = E('event-text');
  el.textContent = t;
  el.classList.remove('hidden');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function formatTime(ms) {
  const s = (ms / 1000) | 0;
  const mm = String(((s / 60) | 0) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const ff = String(((ms % 1000) / 40) | 0).padStart(2, '0');
  return `00:${mm}:${ss}:${ff}`;
}

// battery HUD — camcorder-style segmented indicator, only when relevant
function updateBatteryHud() {
  const el = E('cc-batt');
  if (!flash) { el.textContent = ''; return; }
  if (!flash.on && flash.battery > 99) { el.textContent = ''; return; } // pristine & off: hide
  const segs = Math.round(flash.battery / 25);
  el.textContent = '▮'.repeat(segs) + '▯'.repeat(4 - segs);
  el.classList.toggle('low', flash.battery < 25);
}

// spectator camera: hover near the next living teammate (found-footage style)
function spectateCamera(dt) {
  const alive = [...remotePlayers.players.values()].filter((p) => !p.cur.dead);
  if (!alive.length) {
    // no one left: slow orbit over death spot
    const t = performance.now() * 0.0002;
    camera.position.set(player.pos.x + Math.cos(t) * 3, 3.2, player.pos.z + Math.sin(t) * 3);
    camera.lookAt(player.pos.x, 0.5, player.pos.z);
    return;
  }
  const spec = alive[spectateIdx % alive.length];
  const t = performance.now() * 0.001;
  const ox = Math.cos(t * 0.3) * 2.2, oz = Math.sin(t * 0.3) * 2.2;
  camera.position.lerp(new THREE.Vector3(spec.cur.x + ox, 2.1, spec.cur.z + oz), Math.min(1, dt * 3));
  camera.lookAt(spec.cur.x, 1.3, spec.cur.z);
}

// ---------------------------------------------------------------------------
// light management from chunks
function registerChunkLights() {
  if (!worldMgr || !lightMgr) return;
  for (const [key, chunk] of worldMgr.chunks) {
    if (chunk._lightsRegistered) continue;
    chunk._lightsRegistered = true;
    for (const f of chunk.lights) {
      lightMgr.addFixture(f, `${key}:${f.cx},${f.cz}`);
    }
  }
  // note: fixtures from unloaded chunks linger — purge cheaply
  for (const [key, f] of lightMgr.fixtures) {
    const ckey = key.split(':')[0];
    if (!worldMgr.chunks.has(ckey)) lightMgr.fixtures.delete(key);
  }
}

// ---------------------------------------------------------------------------
// morph events: host occasionally mutates corridors players aren't watching
let morphTimer = 45;
function morphLogic(dt) {
  if (!isHost || !worldMgr) return;
  morphTimer -= dt;
  if (morphTimer <= 0) {
    morphTimer = 90 + Math.random() * 120;
    // pick a loaded chunk that is NOT near any player and flip its variant
    const px = player.pos.x, pz = player.pos.z;
    for (const [key, chunk] of worldMgr.chunks) {
      const d = Math.hypot(chunk.chunkX * 16 + 8 - px, chunk.chunkZ * 16 + 8 - pz);
      if (d > 30 && d < 90) {
        const variant = (world.morphVariant(chunk.chunkX, chunk.chunkZ) + 1) % 3;
        const data = { cx: chunk.chunkX, cz: chunk.chunkZ, variant };
        net.sendEvent('chunkmorph', data);
        worldMgr.applyMorph(data);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// main loop
let last = performance.now();
let sendAcc = 0;

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (gameState !== 'playing' || !world) return;

  if (!dead) {
    // horror director telemetry: distance travelled, time, party size
    const px0 = player.pos.x, pz0 = player.pos.z;
    player.update(dt, world, worldMgr);
    distTravelled += Math.hypot(player.pos.x - px0, player.pos.z - pz0);
    if (monsters) {
      const t = monsters.nearestThreat;
      if (t) player.flinch = Math.min(1, (24 - t.d) / 24 * (t.def.lethal ? 1 : 0.55));
      monsters.director.distance = distTravelled;
      monsters.director.timePlayed = (now - startTime) / 1000;
      monsters.director.players = net.players.size;
    }
    if (events) events.director.distance = distTravelled;
  } else {
    // dead: spectate nearest living teammate, or float at death spot
    spectateCamera(dt);
    if (respawnT > 0) {
      respawnT -= dt;
      if (respawnT <= 0) E('death-sub').textContent = 'PRESS [R] TO RESPAWN';
      else E('death-sub').textContent = `RESPAWN IN ${Math.ceil(respawnT)}s`;
    }
  }
  player.flashOn = flash && flash.on ? 1 : 0;
  worldMgr.ensure(player.pos.x, player.pos.z);
  worldMgr.updateDoors(dt);
  registerChunkLights();
  lightMgr.update(dt, player.pos.x, player.pos.z, camera);
  if (flash) flash.update(dt);
  updateBatteryHud();
  remotePlayers.update(dt, camera.position);
  monsters.update(dt, player, remotePlayers, null);
  events.update(dt, player);
  morphLogic(dt);

  // host streams monsters at 8Hz
  if (isHost && monsters.monsters.size) {
    sendAcc += dt;
    if (sendAcc > 0.12) {
      sendAcc = 0;
      net.sendMonsters(monsters.hostSnapshot());
    }
  }

  // send own state at ~20Hz
  player._sendAcc = (player._sendAcc || 0) + dt;
  if (net.connected && player._sendAcc > 0.05) {
    player._sendAcc = 0;
    net.sendState(player.pos.x, player.pos.y, player.pos.z, player.yaw, player.pitch, player.anim, player.emote, player.flashOn, dead);
  }

  // interact prompt
  currentInteract = dead ? null : findInteractable();
  const prompt = E('interact-prompt');
  if (currentInteract && !noteOverlayOpen) {
    prompt.classList.remove('hidden');
    E('interact-text').textContent =
      currentInteract.type === 'note' ? 'READ NOTE'
      : currentInteract.type === 'battery' ? 'TAKE BATTERY'
      : currentInteract.type === 'key' ? 'TAKE RUSTY KEY'
      : doorPromptText(currentInteract.data);
  } else {
    prompt.classList.add('hidden');
  }

  // audio listener + exposure adaptation
  audio.setListener(player.pos.x, 1.6, player.pos.z, player.yaw, player.pitch);
  const brightness = lightMgr.brightnessAt(player.pos.x, player.pos.z);
  engine.adaptExposure(brightness, dt);

  // footsteps
  if ((player.anim === 'walk' || player.anim === 'run')) {
    player._stepAcc = (player._stepAcc || 0) + dt * (player.anim === 'run' ? 2.6 : 1.6);
    if (player._stepAcc > 1) {
      player._stepAcc = 0;
      const cx = Math.floor(player.pos.x / CELL), cz = Math.floor(player.pos.z / CELL);
      audio.footstep(world.surfaceAt(cx, cz), player.anim === 'run');
    }
  }

  // HUD timecode
  E('timecode').textContent = formatTime(now - startTime);

  // ambient darkness heartbeat (tension when pitch black)
  if (brightness < 0.05) {
    player._darkT = (player._darkT || 0) + dt;
    if (player._darkT > 9) {
      player._darkT = 0;
      audio.heartbeat(0.4);
    }
  } else player._darkT = 0;

  engine.render(dt, now / 1000);
}

// ---------------------------------------------------------------------------
// boot
function leaveToMenu() {
  gameState = 'menu';
  reconnecting = false;
  clearTimeout(reconnectTimer);
  hideNetBanner();
  clearSession();
  net.leave();
  player.enabled = false;
  player.dead = false;
  dead = false;
  paused = false;
  player.resetState();
  if (mobile) mobile.hide();
  document.exitPointerLock && document.exitPointerLock();
  E('game-ui').classList.add('hidden');
  E('pause-overlay').classList.add('hidden');
  E('leave-confirm').classList.add('hidden');
  E('death-overlay').classList.add('hidden');
  E('settings-panel').classList.add('hidden');
  E('note-overlay').classList.add('hidden');
  noteOverlayOpen = false;
  audio.stopAmbience();
  if (worldMgr) {
    for (const key of [...worldMgr.chunks.keys()]) worldMgr.unload(key);
    worldMgr = null;
  }
  if (lightMgr) { lightMgr.fixtures.clear(); }
  if (monsters) {
    for (const id of [...monsters.monsters.keys()]) monsters.remove(id);
    monsters = null;
  }
  for (const id of [...remotePlayers.players.keys()]) remotePlayers.remove(id);
  menu.showMenu();
  menu.setStatus('SIGNAL OK');
}

loadSettings();
loop();

// debug/testing hooks (harmless in production; used by the test suite)
window.__dbg = {
  chunks: () => (worldMgr ? worldMgr.chunks.size : 0),
  pos: () => [player.pos.x, player.pos.y, player.pos.z],
  player,
  state: () => ({ gameState, dead, paused, sitting: player.sitting, grounded: player.grounded, yOff: player.yOff }),
  flash: () => (flash ? { on: flash.on, battery: flash.battery } : null),
  monsters: () => (monsters ? monsters.monsters.size : 0),
  monsterTypes: () => (monsters ? [...monsters.monsters.values()].map((m) => `${m.type}:${m.state}`) : []),
  spawnMonster: (type, dx = 5, dz = 5) => (monsters ? monsters.spawnMonster(type, player.pos.x + dx, player.pos.z + dz).id : -1),
  doors: () => (worldMgr ? [...worldMgr.doorIndex.values()].map((d) => ({
    key: `${d.cx},${d.cz},${d.dir}`, x: d.x, z: d.z, locked: d.locked, open: d.open,
    rot: d.pivot ? d.pivot.rotation.y : null,
    dist: Math.hypot(d.x - player.pos.x, d.z - player.pos.z),
  })) : []),
  keys: () => [...keyInventory],
  interact: () => { currentInteract = findInteractable(); doInteract(); return currentInteract ? currentInteract.type : null; },
  prompt: () => (E('interact-text') ? E('interact-text').textContent : null),
  nearInteractable: () => findInteractable(),
  teleport: (x, z, yaw = 0) => { player.pos.x = x; player.pos.z = z; player.yaw = yaw; },
  remoteAnims: () => (remotePlayers ? [...remotePlayers.players.values()].map((p) => p.anim) : []),
  remoteY: () => (remotePlayers ? [...remotePlayers.players.values()].map((p) => p.cur.y) : []),
};
// boot message fades only after at least one frame has run, so we know
// the module graph actually executed (not a bare module-load failure).
requestAnimationFrame(() => E('boot-msg').classList.add('gone'));
setTimeout(() => {
  const f = E('fade');
  f.style.transition = 'opacity 2s ease';
  f.classList.add('clear');
}, 300);

// resume a dropped session after a page refresh (mobile browsers kill tabs)
(function resumeSessionOnLoad() {
  const sess = loadSession();
  if (!sess) return;
  menu.setStatus('RESUMING SESSION…');
  net.connect()
    .then(() => net.rejoin(sess.code, sess.token))
    .catch(() => { clearSession(); menu.setStatus('SIGNAL OK'); });
})();

// auto-detect touch changes (e.g. tablets)
window.addEventListener('touchstart', () => {
  if (!player.mobile) {
    player.mobile = true;
    if (gameState === 'playing' && !mobile) {
      mobile = new MobileControls(player, doInteract, doEmote, togglePause);
      mobile.show();
    }
  }
}, { once: true });
