# THE BACKROOMS — Multiplayer Found-Footage Horror

A complete browser-based multiplayer Backrooms horror game. Players join rooms
through the website, explore a deterministic infinite procedural world together,
and try to survive.

## Quick start

```bash
npm install
npm start          # listens on PORT (default 12000)
```

Open `http://localhost:12000` in a browser. Create a room, share the 6-letter
code, and up to 8 players can join from any device.

## Features

- **Real multiplayer** — WebSocket rooms with 8-player capacity, host migration,
  position/rotation/emote synchronization, shared deterministic world seed.
- **Infinite procedural world** — deterministic seeded chunk engine; corridors,
  rooms, strange geometry, rarity levels (common → rare → anomalous); chunks
  stream in and unload automatically.
- **Multiple levels** — Level 0 (yellow offices), Level 1 (industrial),
  Level 2 (mechanical dark), Level 3 (flooded), Level 4 (abandoned offices),
  Level 5 (hotel), each with its own materials, lighting, fog, sounds, and
  procedural rules.
- **Found-footage rendering** — Three.js WebGL with VHS post-processing
  (grain, scanlines, chromatic aberration, vignette, lens distortion, tracking
  wobble, occasional glitches), handheld camcorder motion with sway, inertia,
  micro-shake, focus hunting and exposure adaptation.
- **Lighting** — realistic fluorescent fixtures that flicker, buzz, dim, fail,
  and come back on; darkness is part of the gameplay.
- **Positional 3D audio** — WebAudio spatial sound: fluorescent hum, footsteps
  per-surface, AC drones, water drips, distant metal, electrical arcs, and
  unexplained sounds behind you.
- **Monsters** — five distinct entities (Watcher, Stalker, Runner, Mimic,
  Shadow) with unique appearance, sounds, movement, AI, spawn conditions, and
  behaviour. Encounters are rare and frightening; important monsters are
  synchronized across the room while some hallucinations are individual.
- **Psychological horror events** — lights dying, doors appearing, corridors
  changing, distant figures, impossible geometry, objects moving.
- **Interaction** — doors, notes, keys, hidden mechanisms; exploration and
  survival, no weapons or combat.
- **Emotes** — wave, point, laugh, sit, scared reaction, and dance; all
  synchronized through the server in real time.
- **Mobile support** — automatic device detection, virtual joystick (left),
  touch look (right), RUN / INTERACT / EMOTE / DANCE buttons, multi-touch,
  dynamic resolution, and automatic quality scaling (LOW / MEDIUM / HIGH /
  ULTRA).

## Project layout

```
server/index.js    WebSocket room manager + static file server
server/rooms.js    Room lifecycle, player state, monster relay
client/index.html  Menu / lobby / HUD markup
client/css/        Styles
client/js/         Client modules
  main.js          Game orchestrator
  worldgen.js      Deterministic seeded world model
  world/chunk.js   Chunk streaming + geometry builder
  world/lights.js  Fluorescent fixtures, flicker, failure
  renderer.js      Post-processing (VHS shader, bloom, exposure)
  player.js        Camcorder-style FPS controller
  avatar.js        Remote player models + emotes
  audio.js         Spatial audio engine
  monsters/        Monster AI + shared/individual horror events
  mobile.js        Touch controls
  menu.js          Menu / lobby / settings UI
  network.js       WebSocket client
  levels.js        Level definitions
  rng.js           Seeded PRNG
  notes.js         Note text content
test/
  multiplayer.test.js   Node-level WebSocket room/seed/monster tests
  browser.test.js       Single-client headless Chromium smoke test
  browser2p.test.js     Two-client headless Chromium multiplayer test
```

## Tests

```bash
npm test            # server-level multiplayer tests (fast, no browser)
npm run test:browser  # headless Chromium single-client UI test
npm run test:2p       # headless Chromium two-client multiplayer test
npm run test:all      # all of the above
```

Browser tests need a Chromium binary at `/usr/bin/chromium` (or set
`CHROME_PATH`).

## Deployment

The server is self-contained. Host it on any Node.js-capable platform:

```bash
PORT=80 npm start
```

Requirements: Node.js 18+, no external services. The WebSocket endpoint is on
the same origin as the site, so a single domain/port is enough. For public
hosting, put it behind a TLS-terminating reverse proxy (nginx, Caddy, etc.) —
the client automatically uses `wss://` when the page is served over `https://`.

## Controls

| Input          | Action              |
| -------------- | ------------------- |
| WASD           | Move                |
| Mouse          | Look                |
| Shift          | Sprint              |
| E              | Interact            |
| Esc            | Pause / menu        |
| Mobile         | Virtual joystick + touch look |

## Graphics settings

Settings are in the main menu. Quality presets automatically scale resolution,
bloom, and draw distance. The default is chosen from device heuristics
(mobile → medium, 8-core desktop → ultra).
