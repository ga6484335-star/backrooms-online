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
import { JumpscareDirector } from './jumpscare.js';
import { Network } from './network.js';
import { MobileControls } from './mobile.js';
import { MenuUI } from './menu.js';
import { Flashlight } from './flashlight.js';
import { noteText } from './notes.js';
import { getLevel } from './levels.js';
import { ObjectiveTracker, objectiveSites, exitCellFor } from './objectives.js';
import { introFor, epilogueFor, beatFor, ambientFor, radioFor, nextStoryLevel, isFinalLevel, levelTitle } from './story.js';
import { EndingSequence } from './ending.js';
import { OpeningSequence } from './opening.js';
import { TransitionSequence } from './transitions.js';
import { VoiceEngine } from './voice.js';
import { rngFrom, hashStr } from './rng.js';

// ---------------------------------------------------------------------------
// boot
const canvas = document.getElementById('gl');
const engine = new RendererEngine(canvas);
const scene = engine.scene;
const camera = engine.camera;
// the camera is a scene node so camera-attached effects (transition sheets,
// fall streaks, flashes) render — three.js ignores cameras as draw objects
scene.add(camera);
const audio = new AudioEngine();
const voice = new VoiceEngine(audio);
const net = new Network();

const player = new PlayerController(camera);
const remotePlayers = new RemotePlayers(scene, audio);

let world = null;
let worldMgr = null;
let lightMgr = null;
let monsters = null;
let events = null;
let scares = null;
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

// ---- progression / story state (co-op; authoritative-ish, relayed) --------
let objectives = null;      // ObjectiveTracker for the current level
let exitUnlocked = false;   // gate opened (all objectives done)
let ending = null;          // EndingSequence while the finale plays
let cinematic = null;       // {lines, i, t, glyph, onDone} typewriter overlay
let opening = null;         // OpeningSequence cold-open (before the Backrooms)
let openingDone = false;    // cold-open has run (or was skipped) this session
let transition = null;      // TransitionSequence entering a new level
let objHudAcc = 0;          // objective HUD refresh accumulator
let lastCompass = 0;        // objective compass refresh accumulator
let ambientStoryIdx = 0;    // rotating ambient story pool index
let radioIdx = 0;           // rotating radio line index

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
      voice: s.voice !== undefined ? !!s.voice : true,
    };
  } catch (e) {
    settings = { quality: defaultQuality(), sens: 1, volume: 0.8, vhs: true, voice: true };
  }
  E('set-quality').value = settings.quality;
  E('set-sens').value = settings.sens;
  E('set-volume').value = settings.volume;
  E('set-vhs').value = settings.vhs ? '1' : '0';
  E('set-voice').value = settings.voice ? '1' : '0';
  applySettings(settings);
}

function applySettings(s) {
  settings = s;
  engine.setQuality(s.quality);
  engine.setVHS(s.vhs);
  player.sensitivity = s.sens;
  audio.setVolume(s.volume);
  voice.setEnabled(s.voice);
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
    // joined (or page-refreshed) into a game already in progress — no cold open
    startGame(m.seed, m.level, { midJoin: true });
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
  // scream must always be heard: monsters hunt in the lobby too (host
  // may be running ahead on a different screen), and tests need the event ring
  if (m.kind === 'scream') { /* fall through into the main switch below */ }
  else if (gameState !== 'playing') return;
  if (window.__dbg && window.__dbg._ev) { window.__dbg._ev.push(m.kind); if (window.__dbg._ev.length > 40) window.__dbg._ev.shift(); }
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
    case 'advance': {
      // a peer/host finished the level — the whole party moves on together
      if (m.data && m.data.to !== undefined && world && m.data.to !== world.level) {
        levelTransition(m.data.to);
      }
      break;
    }
    case 'obj': {
      // a peer activated an objective site (or completed the hold)
      if (!objectives || !m.data) break;
      if (m.data.kind === 'site' && m.data.key) {
        const idx = objectives.activateSite(m.data.key);
        if (idx >= 0) {
          const site = { key: m.data.key, x: player.pos.x, z: player.pos.z };
          // rebuild site coords from the key so audio is positional
          const parts = String(m.data.key).split(':')[1];
          if (parts) { const [cx, cz] = parts.split(',').map(Number); site.x = (cx + 0.5) * CELL; site.z = (cz + 0.5) * CELL; }
          onSiteActivated(site, idx, true);
        }
      } else if (m.data.kind === 'hold' && objectives.isComplete()) {
        unlockExit();
      }
      break;
    }
    case 'ending': {
      if (!ending) startEnding();
      break;
    }
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
    case 'scream': {
      const nm = net.players.get(m.data.pid);
      flashText(`${nm ? nm.name : 'SOMEONE'} SCREAMED.`);
      if (m.data.pid === net.id) break; // we already heard our own
      audio.humanScream(m.data.x, 1.6, m.data.z);
      if (monsters) {
        const pl = [{ id: m.data.pid, x: m.data.x, z: m.data.z }];
        if (remotePlayers) for (const [id, rp] of remotePlayers.players) {
          pl.push({ id, x: rp.cur.x, z: rp.cur.z });
        }
        pl.push({ id: net.id, x: player.pos.x, z: player.pos.z });
        monsters.hearScream(m.data.x, m.data.z, m.data.pid, pl);
      }
      break;
    }
    case 'scare': {
      // shared jumpscare: replay the same puppet locally (small distance
      // drift is fine — the scare reads identically)
      if (scares) scares.fire(m.data, player);
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
  // The room's `level` already reflects the latest chapter, so a replayed
  // advance chain is collapsed to its FINAL target — re-walking every level
  // would thrash chunk streaming (and play an intro per chapter) on join.
  let replayLevel = null;
  let sawEnding = false;
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
    } else if (ev.kind === 'advance' && ev.data) {
      replayLevel = ev.data.to !== undefined ? ev.data.to : ev.data.level;
    } else if (ev.kind === 'noclip' && ev.data) {
      replayLevel = ev.data.level;
    } else if (ev.kind === 'ending') {
      sawEnding = true;
    }
  }
  if (replayLevel !== null && world && replayLevel !== world.level && gameState === 'playing') {
    enterLevel(replayLevel);
    // objective events were for an earlier chapter; rebuild the tracker from
    // the current level's plan (a late joiner cannot be mid-level anyway)
    objectives = new ObjectiveTracker(replayLevel);
    exitUnlocked = false;
    updateObjectiveHud();
  }
  // objective activations belong to the *current* level — apply them last
  for (const ev of m.events || []) {
    if (!ev || ev.kind !== 'obj' || !ev.data || !objectives) continue;
    if (ev.data.kind === 'site' && ev.data.key) objectives.activateSite(ev.data.key);
    else if (ev.data.kind === 'hold') objectives.holdT = 99999;
  }
  if (objectives && objectives.isComplete()) unlockExit();
  if (sawEnding && gameState === 'playing' && !ending) startEnding();
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
function startGame(seed, level, opts = {}) {
  gameState = 'playing';
  menu.hideAll();

  // world
  world = new WorldModel(seed, level);
  worldMgr = new WorldManager(scene, world, settings.quality);
  lightMgr = new LightManager(scene, settings.quality);
  // progression + story for this level
  objectives = new ObjectiveTracker(level);
  exitUnlocked = false;
  ending = null;
  cinematic = null;
  monsters = new MonsterSystem(scene, world, worldMgr, audio, net, () => isHost);
  monsters.getLightAt = (x, z) => lightMgr.brightnessAt(x, z);
  events = new HorrorEvents(world, worldMgr, audio, engine, net);
  events.setHostFn(() => isHost);
  scares = new JumpscareDirector(monsters, lightMgr, audio, engine, player, net,
    (kind, data) => net.sendEvent(kind, data));
  scares.setHostFn(() => isHost);
  scares.onMessage = flashText;
  events.setLightMgr(lightMgr);
  events.onMessage = flashText;
  // the room occasionally speaks a story fragment instead of a generic scare
  wireAmbientStory();

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
  E('objective-title').textContent = levelTitle(level);
  updatePlayersHud();
  updateObjectiveHud();
  // the director weighs objective progress + level depth
  monsters.director.level = level;
  monsters.getPlayers = () => {
    const out = [{ id: net.id, x: player.pos.x, z: player.pos.z, yaw: player.yaw }];
    for (const [id, rp] of remotePlayers.players) out.push({ id, x: rp.cur.x, z: rp.cur.z, yaw: rp.cur.yaw || 0 });
    return out;
  };

  // ---- STORY MODE hand-off -------------------------------------------------
  // A fresh session on Level 0 opens with the cold open (normal world → fall).
  // Everything else opens with that level's own distinctive transition. Both
  // are non-interactive but non-blocking: the world streams underneath and
  // control returns when the sequence ends (or is skipped).
  const skipIntro = new URLSearchParams(location.search).has('skipintro');
  // a player joining a party already in progress should never be forced
  // through the cold open — they drop straight into the level
  const freshStart = (level === 0 && !openingDone && !opts.midJoin);
  if (!skipIntro && freshStart) {
    startOpening();
  } else if (!skipIntro && !opts.midJoin) {
    startTransition(level);
  } else {
    openingDone = true;
    player.enabled = true;
    showCinematic(introFor(level), 3, null);
  }

  // intro fade (a short black lift; the sequences own their own reveals)
  startTime = performance.now();
  if (skipIntro) {
    const fade = E('fade');
    fade.style.transition = 'opacity 3.5s ease';
    fade.classList.add('clear');
  }
  audio.distantMetal(0.4);
}

// ---- story mode: the cold open --------------------------------------------
function startOpening() {
  gameState = 'opening';
  player.enabled = false;
  if (mobile) mobile.hide();
  E('fade').classList.add('clear');
  const ov = E('opening-overlay');
  ov.classList.remove('hidden');
  E('opening-hint').classList.add('hidden');
  E('opening-card').classList.add('hidden');
  E('opening-line').textContent = '';
  E('opening-speaker').textContent = '';
  opening = new OpeningSequence(scene, camera, player, engine, audio, {
    voice,
    onCard(card) {
      const el = E('opening-card');
      if (!card) { el.classList.add('hidden'); return; }
      el.textContent = card;
      el.classList.remove('hidden', 'pop');
      void el.offsetWidth;
      el.classList.add('pop');
    },
    onLine(t, mood) {
      E('opening-line').textContent = t;
      E('opening-speaker').textContent = t ? voice.speakerFor(mood) : '';
    },
    onHint(show) { E('opening-hint').classList.toggle('hidden', !show); },
    onDone() { finishOpening(); },
  });
}

function finishOpening() {
  if (!opening) return;
  if (!opening.done) opening.done = true;
  opening.dispose();
  opening = null;
  E('opening-overlay').classList.add('hidden');
  E('opening-hint').classList.add('hidden');
  E('opening-line').textContent = '';
  E('opening-card').classList.add('hidden');
  openingDone = true;
  gameState = 'playing';
  player.resetState();
  const [sx, sz] = world.spawnPoint(0);
  player.teleport(sx, sz);
  worldMgr.ensure(player.pos.x, player.pos.z);
  player.enabled = true;
  if (player.mobile && mobile) mobile.show(); else canvas.requestPointerLock?.().catch?.(() => {});
  // the room speaks the first beat, and a radio scrap comes through
  setTimeout(() => { if (gameState === 'playing') showCinematic(introFor(0), 3, null); }, 900);
  audio.distantMetal(0.5);
  if (monsters) monsters.escalate(0.6); // the world notices you landed
}

function skipOpening() {
  if (!opening) return;
  finishOpening();
}

// ---- story mode: a level's own transition ---------------------------------
function startTransition(level) {
  gameState = 'transition';
  player.enabled = false;
  if (mobile) mobile.hide();
  E('fade').classList.add('clear');
  const ov = E('opening-overlay');
  ov.classList.remove('hidden');
  E('opening-rec').classList.add('hidden');
  E('opening-hint').classList.add('hidden');
  E('opening-line').textContent = '';
  E('opening-speaker').textContent = '';
  const cardEl = E('opening-card');
  cardEl.classList.add('hidden');
  transition = new TransitionSequence(scene, camera, player, engine, audio, level, {
    voice,
    onCard(card) {
      if (!card) { cardEl.classList.add('hidden'); return; }
      cardEl.textContent = card;
      cardEl.classList.remove('hidden', 'pop');
      void cardEl.offsetWidth;
      cardEl.classList.add('pop');
    },
    onLine(t, mood) {
      E('opening-line').textContent = t;
      E('opening-speaker').textContent = t ? voice.speakerFor(mood) : '';
    },
    onHint(show) { E('opening-hint').classList.toggle('hidden', !show); },
    onDone() { finishTransition(level); },
  });
}

function finishTransition(level) {
  if (!transition) return;
  if (!transition.done) transition.done = true;
  transition.dispose();
  transition = null;
  const ov = E('opening-overlay');
  ov.classList.add('hidden');
  E('opening-rec').classList.remove('hidden');
  E('opening-hint').classList.add('hidden');
  E('opening-line').textContent = '';
  E('opening-card').classList.add('hidden');
  gameState = 'playing';
  player.enabled = true;
  if (player.mobile && mobile) mobile.show(); else canvas.requestPointerLock?.().catch?.(() => {});
  showCinematic(introFor(level), 3, null);
  if (monsters) {
    monsters.escalate(1.0); // arrival is loud; the world reacts
    // every level greets you with something once you are standing — a distant
    // reveal, never a spawn in the view cone
    if (isHost) monsters.stageEncounter(null, player.pos.x, player.pos.z);
  }
}

function skipTransition() {
  if (!transition) return;
  finishTransition(transition.level);
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
  // epilogue cinematic for the level we are leaving, then settle in
  showCinematic(epilogueFor(world.level), 2.6, () => enterLevel(level));
}

// actually swap the world to a new level (called after the epilogue, or on a
// relayed peer 'advance'/'noclip'). Rebuilds surroundings and progression.
function enterLevel(level) {
  if (!world) return;
  world.setLevel(level);
  // rebuild surroundings — door state and keys belong to the old level
  for (const key of [...worldMgr.chunks.keys()]) worldMgr.unload(key);
  doorToggles = new Map();
  keyInventory = new Set();
  objectives = new ObjectiveTracker(level);
  exitUnlocked = false;
  monsters.director.level = level;
  const levelDef = getLevel(level);
  scene.fog = new THREE.FogExp2(levelDef.palette.fog, levelDef.palette.fogDensity);
  scene.background = new THREE.Color(levelDef.palette.fog);
  const amb = scene.getObjectByName('ambient');
  if (amb) { amb.color.set(levelDef.palette.ambient); amb.intensity = levelDef.palette.ambientI; }
  audio.stopAmbience();
  audio.startAmbience(levelDef);
  E('cc-level').textContent = levelDef.name.split('—')[0].trim();
  E('objective-title').textContent = levelTitle(level);
  engine.bumpGlitch(2);
  player.resetState(); // new level = fresh, safe posture
  // spawn on the new level's spawn and stream its surroundings immediately
  const [sx, sz] = world.spawnPoint(0);
  player.teleport(sx, sz);
  worldMgr.ensure(player.pos.x, player.pos.z);
  updateObjectiveHud();
  // each level begins its own way — a door, a lurch, a flood, a lift…
  startTransition(level);
  flashText(levelDef.name);
}

// ---------------------------------------------------------------------------
// interaction
let currentInteract = null;

function findInteractable() {
  if (!worldMgr) return null;
  const it = worldMgr.nearestInteractable(
    player.pos.x, player.pos.z,
    (key) => (objectives && objectives.activated.has(key)) || (key.startsWith('exit:') && !exitUnlocked),
  );
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
  } else if (it.type === 'site') {
    activateSite(it.data);
  } else if (it.type === 'exit') {
    useExit(it.data);
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
    // a noclip door is an illegal shortcut: the Archivist rewinds you instead
    // of letting you skip the level. It now punishes level-skipping.
    const cell = world.cellAt(d.cx, d.cz);
    const sp = cell.special;
    if (sp && sp.type === 'noclipdoor' && isHost) {
      const rng = rngFrom(hashStr(world.seed, `noclip:${d.cx},${d.cz}`));
      const dest = (rng() < 0.5 ? 2 : 3); // shuffle between the machine decks
      if (dest !== world.level) {
        net.sendEvent('noclip', { level: dest });
        levelTransition(dest);
      }
    }
  }
}

// ---- objective sites: force the Archivist to replay a story fragment --------
// The room's own voice: a rotating pool of story fragments + radio scraps per
// level. Reads world.level at call time so it tracks level changes automatically.
let _ambIdx = 0, _ambLevel = -1;
function wireAmbientStory() {
  if (!events) return;
  // HorrorEvents owns the rare-ambience scheduler; give it the level's lines.
  events.ambientLine = () => {
    if (!world) return null;
    const lv = world.level;
    if (lv !== _ambLevel) { _ambLevel = lv; _ambIdx = 0; }
    return ambientFor(lv, _ambIdx++);
  };
  // and a separate pool of radio scraps, surfaced as their own event
  events.radioLine = () => {
    if (!world) return null;
    return radioFor(world.level, radioIdx++);
  };
}

function activateSite(site) {
  if (!objectives || !world) return;
  const beatIdx = objectives.activateSite(site.key);
  if (beatIdx < 0) return;         // already known
  net.sendEvent('obj', { kind: 'site', key: site.key, index: beatIdx, level: world.level });
  onSiteActivated(site, beatIdx, false);
}

// shared client-side reaction (also used when a PEER activates a site)
function onSiteActivated(site, beatIdx, remote) {
  updateObjectiveHud();
  flashText(remote ? 'A NODE WENT QUIET' : 'INTAKE NODE ACTIVATED');
  audio.keyPick();
  audio.buzz(site.x, site.z, 0.8);
  engine.bumpGlitch(1.0);
  // reading a node is loud — the Backrooms comes to listen
  audio.distantMetal(0.9);
  if (monsters) {
    monsters.alertArea(site.x, site.z, 34);
    monsters.escalate(1);
  }
  if (!remote) showCinematic([beatFor(world.level, beatIdx)], 2, null);
  // if this completed every objective, open the way
  if (objectives.isComplete()) unlockExit();
  else if (isHost && monsters && Math.random() < 0.5) {
    // half the time, activating a node wakes something nearby — an encounter
    // tied to the story beat rather than to a random timer
    monsters.stageEncounter(null, site.x, site.z);
  }
}

function unlockExit() {
  if (exitUnlocked) return;
  exitUnlocked = true;
  E('objective-title').textContent = 'EXIT UNLOCKED';
  flashText('THE WAY DOWN IS OPEN');
  audio.doorSlam(player.pos.x + 4, player.pos.z);
  engine.bumpGlitch(1.4);
  audio.heartbeat(1);
  if (monsters) {
    monsters.escalate(2);
    // opening the way makes a sound the whole level hears — something is
    // always waiting to see who walks through
    if (isHost) monsters.stageEncounter(null, player.pos.x, player.pos.z);
  }
}

// ---- exit gate: advance the whole party together ----------------------------
function useExit(it) {
  if (!exitUnlocked) { flashText('SEALED — OBJECTIVES REMAIN'); audio.doorLocked(it.x, it.z); return; }
  if (!isHost) { flashText('WAITING FOR THE PARTY'); return; }
  if (isFinalLevel(world.level)) {
    net.sendEvent('ending', { level: world.level });
    startEnding();
  } else {
    const dest = nextStoryLevel(world.level);
    if (dest === null) return;
    net.sendEvent('advance', { from: world.level, to: dest });
    levelTransition(dest);
  }
}

function openNote(n) {
  noteOverlayOpen = true;
  E('note-text').textContent = noteText(world.seed, world.level, n.id);
  E('note-overlay').classList.remove('hidden');
  audio.paper();
}
function closeNote() {
  if (!noteOverlayOpen) return;
  noteOverlayOpen = false;
  E('note-overlay').classList.add('hidden');
  audio.paper();
  if (player.mobile && mobile) mobile.show(); // restore touch controls
}

// note close controls: X button, CLOSE button, tapping the dark backdrop,
// and keyboard (E handled via doInteract; Esc/X here). Mobile buttons use
// touchstart so they respond even while pointer lock is unavailable.
for (const id of ['note-close-btn', 'note-x']) {
  const el = E(id);
  el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeNote(); });
  el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); closeNote(); }, { passive: false });
}
E('note-overlay').addEventListener('touchstart', (e) => {
  if (e.target === E('note-overlay')) { e.preventDefault(); closeNote(); }
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (noteOverlayOpen && (e.code === 'Escape' || e.code === 'KeyX')) {
    e.preventDefault();
    closeNote();
  }
});

function doEmote(e) {
  if (dead) return;
  player.triggerEmote(e);
  // network: reflect the ACTUAL resulting state (sit toggles on/off)
  net.sendEmote(player.emote || (player.sitting ? 'sit' : ''));
}

// ---- THE SCREAM (Q): loud human scream, broadcast, monsters hunt you
let screamCooldown = 0;
function doScream(force = false) {
  if (dead || paused || (!force && screamCooldown > 0) || gameState !== 'playing') return;
  screamCooldown = 12; // seconds
  audio.ensure();
  audio.resume();
  audio.humanScream(player.pos.x, 1.6, player.pos.z);
  player.trauma(0.3);
  engine.bumpGlitch(0.4);
  flashText('SCREAM!');
  net.sendEvent('scream', { x: player.pos.x, z: player.pos.z, pid: net.id });
  // host: local monsters respond immediately (broadcast kicks in on the wire)
  if (monsters) {
    const pl = [{ id: net.id, x: player.pos.x, z: player.pos.z }];
    if (remotePlayers) for (const [id, rp] of remotePlayers.players) {
      pl.push({ id, x: rp.cur.x, z: rp.cur.z });
    }
    monsters.hearScream(player.pos.x, player.pos.z, net.id, pl);
  }
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

// ending return button (also skipped by E/Space/Enter while the prompt is up)
const _endBtn = E('ending-continue');
if (_endBtn) _endBtn.addEventListener('click', () => endEnding());

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
  // before gameplay: the cold open and level transitions are skippable
  if (gameState === 'opening') {
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
      e.preventDefault(); skipOpening();
    }
    return;
  }
  if (gameState === 'transition') {
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
      e.preventDefault(); skipTransition();
    }
    return;
  }
  // during the finale, Enter/E/Space returns to the menu once it has finished
  if (gameState === 'ending') {
    if (!ending || ending.done) {
      if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space' || e.code === 'Escape') {
        e.preventDefault(); endEnding();
      }
    }
    return;
  }
  if (gameState !== 'playing') return;
  // a running story cinematic swallows input; E/Space/Enter skips it
  if (cinematic && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) {
    e.preventDefault(); skipCinematic(); return;
  }
  if (paused) {
    if (e.code === 'Escape') togglePause(false);
    return;
  }
  if (e.code === 'KeyE') doInteract();
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyQ') doScream();
  if (e.code === 'KeyC') doEmote('sit'); // sit/stand toggle
  if (e.code === 'KeyF' && !dead && flash) flash.toggle();
  if (e.code === 'KeyR' && dead && respawnT <= 0) respawn();
});
canvas.addEventListener('click', () => {
  // tap/click skips the cold open or a level transition (touch has no E key)
  if (gameState === 'opening') { skipOpening(); return; }
  if (gameState === 'transition') { skipTransition(); return; }
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

// ---- objective HUD ---------------------------------------------------------
function updateObjectiveHud() {
  const panel = E('objective-panel');
  const list = E('objective-list');
  if (!panel || !list || !objectives) return;
  panel.classList.remove('hidden');
  list.innerHTML = '';
  for (const line of objectives.hudLines()) {
    const li = document.createElement('li');
    li.className = 'obj-line' + (line.done ? ' done' : '');
    li.innerHTML = `<span class="obj-label">${escapeHtmlMini(line.label)}</span>`
      + `<span class="obj-val">${escapeHtmlMini(line.value)}</span>`;
    list.appendChild(li);
  }
  const ring = E('objective-progress');
  if (ring) {
    const pct = Math.round(objectives.progress() * 100);
    ring.style.background = `conic-gradient(var(--obj-accent) ${pct}%, rgba(255,255,255,0.08) ${pct}%)`;
    ring.textContent = `${pct}%`;
  }
  if (exitUnlocked) E('objective-title').textContent = 'EXIT UNLOCKED';
  else E('objective-title').textContent = levelTitle(world ? world.level : 0);
}
function escapeHtmlMini(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- objective compass -----------------------------------------------------
// Always points at the next actionable objective (nearest un-activated site, or
// the exit once unlocked), so nobody has to wander blindly. When the target is
// on screen the arrow sits on it; when it is off to the side the arrow pins to
// the screen edge and rotates. Pure UI — no world state changes.
function updateObjectiveCompass(dt) {
  const box = E('objective-compass');
  if (!box) return;
  if (!world || !objectives || gameState !== 'playing' || dead || ending || cinematic) {
    box.classList.add('hidden'); return;
  }
  let target = null, label = 'OBJECTIVE';
  if (exitUnlocked) {
    label = 'EXIT';
    const p = window.__dbg && window.__dbg.exitPos ? window.__dbg.exitPos() : null;
    if (p) target = p;
  } else {
    const sites = objectiveSites(world, world.level);
    const next = sites.find((s) => !objectives.activated.has(s.key));
    if (next) target = { x: (next.cx + 0.5) * CELL, z: (next.cz + 0.5) * CELL };
  }
  if (!target) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');

  const dx = target.x - player.pos.x, dz = target.z - player.pos.z;
  const dist = Math.hypot(dx, dz);
  // bearing of the target relative to the player's facing (yaw 0 = -Z)
  const fwd = Math.atan2(-dx, -dz);
  let rel = fwd - player.yaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;

  const arrow = E('oc-arrow');
  const edge = Math.abs(rel) > 0.6;
  box.classList.toggle('edge', edge);
  box.classList.toggle('near', dist < 8);
  const r = 44;
  const ox = Math.sin(rel) * r;
  const oy = -Math.cos(rel) * r;
  arrow.style.transform = `translate(${ox}px, ${oy}px) rotate(${rel}rad)`;
  E('oc-label').textContent = label;
  E('oc-dist').textContent = exitUnlocked
    ? (dist < 8 ? 'THE WAY OUT' : `${Math.round(dist)}m`)
    : `${Math.round(dist)}m`;
}

// ---- cinematic typewriter overlay ------------------------------------------
// Shows `lines` one at a time typed out; after the last line + a beat, calls
// `onDone`. Gameplay continues underneath (menus/HUD stay interactive after).
function showCinematic(lines, pace = 3, onDone = null, mood = 'machine') {
  if (!lines || !lines.length) { if (onDone) onDone(); return; }
  cinematic = {
    lines: lines.slice(), i: 0, t: 0, typed: 0,
    cps: 34, minT: 1.6 + pace, onDone, mood, spoken: -1,
  };
  const ov = E('cinematic-overlay');
  if (ov) ov.classList.remove('hidden');
  E('cinematic-line').textContent = '';
  E('cinematic-speaker').textContent = '';
  E('cinematic-hint').classList.add('hidden');
  // NOTE: deliberately non-blocking — in co-op you must keep moving even while
  // the story narrates. The overlay is atmospheric, not a cutscene prison.
}

function updateCinematic(dt) {
  if (!cinematic) return;
  const c = cinematic;
  const full = c.lines[c.i] || '';
  if (c.spoken !== c.i) {
    c.spoken = c.i;
    voice.speak(full, { mood: c.mood });
    E('cinematic-speaker').textContent = full ? voice.speakerFor(c.mood) : '';
  }
  c.t += dt;
  c.typed = Math.min(full.length, c.typed + dt * c.cps);
  E('cinematic-line').textContent = full.slice(0, c.typed | 0);
  const shown = (c.typed | 0) >= full.length;
  if (shown) E('cinematic-hint').classList.remove('hidden');
  if (shown && c.t > c.minT) {
    c.i++;
    c.t = 0; c.typed = 0;
    if (c.i >= c.lines.length) {
      const cb = c.onDone;
      cinematic = null;
      E('cinematic-overlay').classList.add('hidden');
      if (!dead && gameState === 'playing' && !paused && !ending) player.enabled = true;
      if (cb) cb();
    } else {
      E('cinematic-line').textContent = '';
      E('cinematic-speaker').textContent = '';
      E('cinematic-hint').classList.add('hidden');
    }
  }
}

function skipCinematic() {
  if (!cinematic) return;
  const cb = cinematic.onDone;
  cinematic = null;
  voice.stop();
  E('cinematic-overlay').classList.add('hidden');
  if (!dead && gameState === 'playing' && !paused && !ending) player.enabled = true;
  if (cb) cb();
}

// ---- the ending ------------------------------------------------------------
function startEnding() {
  if (ending) return;
  // a level transition or cold open may still be on screen — clear it
  if (opening) { opening.dispose(); opening = null; }
  if (transition) { transition.dispose(); transition = null; }
  E('opening-overlay') && E('opening-overlay').classList.add('hidden');
  E('opening-hint') && E('opening-hint').classList.add('hidden');
  E('opening-line') && (E('opening-line').textContent = '');
  E('opening-card') && E('opening-card').classList.add('hidden');
  E('objective-compass') && E('objective-compass').classList.add('hidden');
  audio.stopStreetAmbience();
  gameState = 'ending';
  paused = false;
  player.enabled = false;
  player.dead = false;
  dead = false;
  E('game-ui').classList.add('hidden');
  E('objective-panel').classList.add('hidden');
  E('cinematic-overlay').classList.add('hidden');
  E('death-overlay').classList.add('hidden');
  E('pause-overlay').classList.add('hidden');
  if (mobile) mobile.hide();
  if (flash && flash.on) flash.setOn(false);
  audio.stopAmbience();
  E('ending-overlay').classList.remove('hidden');
  E('ending-tail').classList.add('hidden');
  E('ending-tail').innerHTML = '';
  ending = new EndingSequence(scene, camera, player, engine, audio, {
    voice,
    onCard(card, st) { showEndingCard(card, st); },
    onTail(lines) {
      const el = E('ending-tail');
      el.innerHTML = lines.map((l) => `<div>${escapeHtmlMini(l)}</div>`).join('');
      el.classList.remove('hidden');
    },
    onDone() { finishEnding(); },
  });
  // fade the found-footage overlay back in
  const fade = E('fade');
  fade.style.transition = 'opacity 1.2s ease';
  fade.classList.remove('clear');
  setTimeout(() => { fade.style.transition = 'opacity 2.4s ease'; fade.classList.add('clear'); }, 1400);
}

function showEndingCard(card, st) {
  const el = E('ending-card');
  el.textContent = card;
  el.classList.remove('hidden');
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  if (st && st.glitch) engine.bumpGlitch(st.glitch);
}

function finishEnding() {
  E('ending-prompt').classList.remove('hidden');
}

function endEnding() {
  if (ending) { ending.dispose(); ending = null; }
  E('ending-overlay').classList.add('hidden');
  E('ending-prompt').classList.add('hidden');
  E('ending-card').classList.add('hidden');
  E('ending-tail').classList.add('hidden');
  gameState = 'playing';
  leaveToMenu();
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
      // never register more fixtures than the light pool can drive —
      // extra entries only cost update time without producing light
      if (lightMgr.fixtures.size >= lightMgr.pool.length * 2) break;
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
// development-only monster inspector: ?debug=1 (never shown in production)
const DEBUG = new URLSearchParams(location.search).has('debug');
let debugEl = null, debugT = 0;
if (DEBUG) {
  debugEl = document.createElement('pre');
  debugEl.id = 'debug-panel';
  debugEl.style.cssText = 'position:fixed;top:8px;left:8px;z-index:99;color:#7f7;'
    + 'background:rgba(0,0,0,.55);font:10px monospace;padding:6px;pointer-events:none;'
    + 'max-width:340px;white-space:pre-wrap;';
  document.body.appendChild(debugEl);
}
function debugUpdate(dt) {
  if (!DEBUG || !debugEl) return;
  debugT += dt;
  if (debugT < 0.25) return;
  debugT = 0;
  if (!window.__fps) return;
  if (gameState !== 'playing' || !monsters) { debugEl.textContent = `state=${gameState}`; return; }
  const lines = [`fps=${(window.__fps || 0).toFixed(0)} state=${gameState} ms=${monsters.monsters.size}`];
  for (const m of monsters.monsters.values()) {
    const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
    lines.push(
      `#${m.id} ${m.type} [${m.x.toFixed(0)},${m.z.toFixed(0)}] ${m.state}`
      + ` d=${d.toFixed(0)} vis=${m.mesh.visible}${m.private ? ' PRIV' : ''}${m.target ? ' tgt=' + m.target.id : ''}`);
  }
  debugEl.textContent = lines.join('\n');
}

let diagAccum = 0;
function monsterDiagLogger(dt) {
  if (!DEBUG) return;
  diagAccum += dt;
  if (diagAccum < 8) return;
  diagAccum = 0;
  if (!monsters || monsters.monsters.size === 0) {
    console.log('[monsters] none spawned yet (encounters=%s, dist=%s, t=%ss)',
      monsters.encounters,
      distTravelled.toFixed(0),
      ((performance.now() - startTime) / 1000).toFixed(0));
    return;
  }
  for (const m of monsters.monsters.values()) {
    const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
    console.log('[monsters] #%d %s [%f,%f] state=%s d=%f target=%s vis=%s life=%s',
      m.id, m.type, m.x, m.z, m.state, d,
      m.target ? m.target.id : 'none',
      (m.mesh.parent ? 'YES' : 'NO'),
      m.life.toFixed(0));
  }
}

// ---------------------------------------------------------------------------
// main loop
let last = performance.now();
let sendAcc = 0;
let fpsFrames = 0, fpsTime = 0, fpsValue = 60, lowFpsT = 0, autoDropped = false;

function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // fps meter + one-step auto quality safeguard (never below LOW)
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 1) { fpsValue = fpsFrames / fpsTime; fpsFrames = 0; fpsTime = 0; window.__fps = fpsValue; }
  if (!autoDropped && settings) {
    if (fpsValue < 24) {
      lowFpsT += dt;
      if (lowFpsT > 12) {
        autoDropped = true;
        const order = ['low', 'medium', 'high', 'ultra'];
        const i = order.indexOf(settings.quality);
        if (i > 0) {
          applySettings({ ...settings, quality: order[i - 1] });
          console.warn(`[perf] sustained low fps (${fpsValue.toFixed(0)}) — quality auto-dropped to ${settings.quality}`);
        }
      }
    } else lowFpsT = Math.max(0, lowFpsT - dt * 2);
  }

  // the finale owns the camera and the scene — run it and stop here
  if (gameState === 'ending') {
    if (ending) { ending.tickAnimation(dt); ending.update(dt); }
    engine.render(dt, now / 1000);
    return;
  }

  // the cold open / level transitions are story mode: camera is scripted, the
  // world keeps streaming underneath, gameplay is suspended until they finish
  if (gameState === 'opening' || gameState === 'transition') {
    if (opening) opening.update(dt);
    if (transition) transition.update(dt);
    if (worldMgr && world) worldMgr.ensure(player.pos.x, player.pos.z);
    if (worldMgr) worldMgr.updateDoors(dt);
    registerChunkLights();
    if (lightMgr && world) lightMgr.update(dt, player.pos.x, player.pos.z, camera);
    remotePlayers.update(dt, camera.position);
    engine.render(dt, now / 1000);
    return;
  }

  if (gameState !== 'playing' || !world) return;

  // story cinematics advance regardless of pause/death (they gate gameplay)
  if (cinematic) updateCinematic(dt);

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
      monsters.director.objects = objectives ? objectives.activated.size : 0;
      monsters.director.objectives = objectives ? objectives.progress() : 0;
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
  if (scares && !dead) scares.update(dt, player, remotePlayers);
  debugUpdate(dt);
  monsterDiagLogger(dt);
  morphLogic(dt);

  // progression: tick survive-style objectives, refresh HUD, unlock when done
  if (objectives) {
    const before = objectives.isComplete();
    objectives.update(dt);
    const nowDone = objectives.isComplete();
    objHudAcc += dt;
    if (objHudAcc > 0.5) {
      objHudAcc = 0;
      if (gameState === 'playing' && !ending) updateObjectiveHud();
    }
    if (!before && nowDone) {
      // the survive objective just finished — the party can leave
      if (isHost) net.sendEvent('obj', { kind: 'hold', level: world.level });
      unlockExit();
    }
  }

  // objective guidance: a compass to the next goal (throttled to ~5Hz)
  lastCompass += dt;
  if (lastCompass > 0.2) { lastCompass = 0; updateObjectiveCompass(dt); }

  screamCooldown = Math.max(0, screamCooldown - dt);
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
      : currentInteract.type === 'site' ? 'ACTIVATE INTAKE NODE'
      : currentInteract.type === 'exit' ? (exitUnlocked ? 'ENTER THE EXIT' : 'SEALED — OBJECTIVES REMAIN')
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
  E('objective-panel').classList.add('hidden');
  E('cinematic-overlay').classList.add('hidden');
  E('ending-overlay').classList.add('hidden');
  noteOverlayOpen = false;
  cinematic = null;
  voice.stop();
  objectives = null;
  exitUnlocked = false;
  // re-arm the cold open for the next fresh session
  openingDone = false;
  if (ending) { ending.dispose(); ending = null; }
  if (opening) { opening.dispose(); opening = null; }
  if (transition) { transition.dispose(); transition = null; }
  E('opening-overlay') && E('opening-overlay').classList.add('hidden');
  E('objective-compass') && E('objective-compass').classList.add('hidden');
  audio.stopAmbience();
  audio.stopStreetAmbience();
  if (worldMgr) {
    for (const key of [...worldMgr.chunks.keys()]) worldMgr.unload(key);
    worldMgr = null;
  }
  if (lightMgr) { lightMgr.fixtures.clear(); }
  if (monsters) {
    for (const id of [...monsters.monsters.keys()]) monsters.remove(id);
    monsters = null;
  }
  scares = null;
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
  level: () => (world ? world.level : -1),
  objectives: () => (objectives ? {
    activated: [...objectives.activated],
    complete: objectives.isComplete(),
    progress: objectives.progress(),
    holdT: objectives.holdT,
  } : null),
  exitUnlocked: () => exitUnlocked,
  sites: () => (world ? objectiveSites(world, world.level).map((s) => ({ key: s.key, x: (s.cx + 0.5) * 4, z: (s.cz + 0.5) * 4, index: s.index })) : []),
  exitPos: () => {
    if (!world) return null;
    const [cx, cz] = exitCellFor(world, world.level);
    return { cx, cz, x: (cx + 0.5) * 4, z: (cz + 0.5) * 4 };
  },
  cinematicActive: () => !!cinematic,
  skipCinematic: () => skipCinematic(),
  openingActive: () => !!opening,
  openingPhase: () => (opening ? opening.phases[opening.phaseIdx].key : null),
  startOpening: () => startOpening(),
  skipOpening: () => skipOpening(),
  transitionActive: () => !!transition,
  transitionKind: () => (transition ? transition.kind : null),
  startTransition: (lv) => startTransition(lv !== undefined ? lv : (world ? world.level : 0)),
  skipTransition: () => skipTransition(),
  compass: () => {
    const box = E('objective-compass');
    if (!box) return null;
    return {
      visible: !box.classList.contains('hidden'),
      label: E('oc-label') ? E('oc-label').textContent : null,
      dist: E('oc-dist') ? E('oc-dist').textContent : null,
    };
  },
  endingActive: () => !!ending,
  // test helper: walk the whole objective chain without moving the player
  completeObjectives: () => {
    if (!objectives) return false;
    const sites = objectiveSites(world, world.level);
    for (const s of sites) {
      if (objectives.activated.has(s.key)) continue;
      const idx = objectives.activateSite(s.key);
      onSiteActivated({ key: s.key, x: (s.cx + 0.5) * 4, z: (s.cz + 0.5) * 4 }, idx, false);
    }
    // satisfy any survive objective
    for (const o of objectives.plan) if (o.kind === 'survive') objectives.holdT = (o.seconds || 0) + 1;
    if (objectives.isComplete()) unlockExit();
    return objectives.isComplete();
  },
  startEnding: () => startEnding(),
  endEnding: () => endEnding(),
  flash: () => (flash ? { on: flash.on, battery: flash.battery } : null),
  // flashlight shape + held-lag state (for tests: the beam must be narrow and
  // must trail the camera)
  flashlightCone: () => (flash ? {
    angle: flash.spot.angle,
    penumbra: flash.spot.penumbra,
    distance: flash.spot.distance,
    decay: flash.spot.decay,
    spillAngle: flash.spill.angle,
    aim: [flash._aim.x, flash._aim.y, flash._aim.z],
  } : null),
  voiceSpeaking: () => voice.speaking,
  voiceSupported: () => voice.supported,
  voiceEnabled: () => voice.enabled,
  speaking: () => voice.speaking,
  speakerFor: (mood) => voice.speakerFor(mood),
  // story-mode internals (tests drive these deterministically; rAF is throttled
  // in headless runs, so a harness needs to advance the sequences by hand)
  cinematicActive: () => !!cinematic,
  openActive: () => !!opening,
  transitionActive: () => !!transition,
  openState: () => (opening ? { phase: opening.phaseIdx, key: opening.phases[opening.phaseIdx].key, shot: opening.phases[opening.phaseIdx].shot, t: opening.t, line: opening.lineIdx, card: opening.phases[opening.phaseIdx].card } : null),
  _tickOpen: (n, dt) => { for (let i = 0; i < n && opening && !opening.done; i++) opening.update(dt); },
  _tickTransition: (n, dt) => { for (let i = 0; i < n && transition && !transition.done; i++) transition.update(dt); },
  monsters: () => (monsters ? monsters.monsters.size : 0),
  monsterTypes: () => (monsters ? [...monsters.monsters.values()].map((m) => `${m.type}:${m.state}`) : []),
  monsterIds: () => (monsters ? [...monsters.monsters.keys()] : []),
  monsterDiag: () => {
    if (!monsters) return null;
    return [...monsters.monsters.values()].map((m) => {
      let vis = 0, tot = 0;
      m.mesh.traverse((o) => { if (o.isMesh) { tot++; if (o.visible) vis++; } });
      const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
      return {
        id: m.id, type: m.type, state: m.state,
        pos: [+m.x.toFixed(1), +(m.y || 0).toFixed(2), +m.z.toFixed(1)],
        dist: +d.toFixed(1),
        inScene: !!m.mesh.parent,
        visible: vis > 0, meshCt: tot, private: !!m.private,

        target: m.target ? m.target.id : null,
        life: +m.life.toFixed(1), despawnDist: m.def.despawnDist,
        dead: player.dead,
        hasLOS: monsters.hasLOS(player.pos.x, player.pos.z, m.x, m.z),
      };
    });
  },
  scream: () => doScream(true),
  respawn: () => respawn(),
  _ev: [], // ring of recent event kinds seen (debug/test)
  placeNote: (dx, dz) => {
    if (!worldMgr) return null;
    // place note right under the player (dx=0, dz=0) so its distance (0m)
    // beats any nearby door (doors are always >= 1.5m away at cell walls)
    const n = { x: player.pos.x + dx, z: player.pos.z + dz, id: `note:test:${Date.now()}` };
    const pcx = Math.floor(player.pos.x / 16), pcz = Math.floor(player.pos.z / 16);
    const chunk = worldMgr.chunks.get(`${pcx},${pcz}`) || [...worldMgr.chunks.values()][0];
    if (!chunk) return null;
    chunk.notes.push(n);
    return n.id;
  },
  monsterInfo: (id) => {
    if (!monsters) return null;
    const m = [...monsters.monsters.values()].find((mm) => mm.id === id);
    if (!m) return null;
    let vis = 0, total = 0;
    m.mesh.traverse((o) => { if (o.isMesh) { total++; if (o.visible) vis++; } });
    return {
      type: m.type, state: m.state, pos: [m.x, m.y || 0, m.z],
      inScene: !!m.mesh.parent, visibleMeshes: vis, meshCount: total,
      hasLOS: monsters.hasLOS(player.pos.x, player.pos.z, m.x, m.z),
      dead: player.dead, anim: player.anim,
    };
  },
  scareT: () => (scares && scares.active ? scares.active.type : null),
  spawnMonster: (type, dx = 5, dz = 5) => {
    if (!monsters) return -1;
    const m = monsters.spawnMonster(type, player.pos.x + dx, player.pos.z + dz);
    m.tolerantMove = true; // protected from despawn while too far from players
    return m.id;
  },
  doors: () => (worldMgr ? [...worldMgr.doorIndex.values()].map((d) => ({
    key: `${d.cx},${d.cz},${d.dir}`, x: d.x, z: d.z, locked: d.locked, open: d.open,
    rot: d.pivot ? d.pivot.rotation.y : null,
    dist: Math.hypot(d.x - player.pos.x, d.z - player.pos.z),
  })) : []),
  keys: () => [...keyInventory],
  interact: () => { currentInteract = findInteractable(); doInteract(); return currentInteract ? currentInteract.type : null; },
  prompt: () => (E('interact-text') ? E('interact-text').textContent : null),
  nearInteractable: () => findInteractable(),
  placedNotes: () => {
    let out = [];
    if (worldMgr) for (const c of worldMgr.chunks.values()) out = out.concat(c.notes);
    return out;
  },
  teleport: (x, z, yaw = 0) => { player.pos.x = x; player.pos.z = z; player.yaw = player.yawTarget = yaw; },
  step: (dt) => { player.update(dt, world, worldMgr); },
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
      mobile.onScream = doScream;
      mobile.show();
    }
  }
}, { once: true });
