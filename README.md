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

## Deployment (permanent, production)

The server is self-contained: it serves the website AND the WebSocket
multiplayer endpoint from one process, so a single host is enough. It never
depends on OpenHands, your Mac, or any local terminal once deployed.

### Option A — Render (recommended: free, no credit card, WebSocket support)

1. Push this repository to GitHub.
2. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
3. Point it at the repo. `render.yaml` is detected automatically:
   Node runtime, Frankfurt region, health check on `/health`.
4. Deploy. You get a permanent URL like `https://backrooms-online.onrender.com`.

Free tier notes: the service sleeps after ~15 min of inactivity and takes
~30 s to wake on the first visit — the in-game auto-reconnect handles this,
but for an always-on room list upgrade to a paid plan.

### Option B — Fly.io

```bash
fly launch        # detects fly.toml (Frankfurt, always-on, 512 MB)
fly deploy
```

### Option C — Any VPS with Docker

```bash
docker build -t backrooms .
docker run -d -p 80:12000 --restart unless-stopped backrooms
```

Put it behind Caddy/nginx for TLS. WebSocket upgrade config for nginx:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:12000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;   # keep idle game sockets open
}
```

### Network behaviour

- HTTPS pages automatically use WSS; HTTP pages use WS. No config needed.
- The client reconnects automatically with exponential backoff and rejoins
  its room with a session token (slots survive a 90 s dropout).
- A page refresh mid-game also resumes the session automatically.
- No geographic blocking: any IP can connect. There are no region locks.
- `/health` returns `{ok, rooms}` for uptime monitors (e.g. UptimeRobot).

Requirements: Node.js 18+, no external services, no database.

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
