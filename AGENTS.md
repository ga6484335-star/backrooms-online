# THE BACKROOMS — project memory

## Architecture
- `client/` — Three.js ES modules, no build step; served statically by `server/index.js` (Express).
- `server/` — Express static + `ws` WebSocket rooms (`rooms.js`). Port from `PORT` env (default 12000).
- Monster builders in `client/js/monsters/defs.js` use a horror anatomy toolkit (teethRow, horrorHead, emaciatedTorso, longArm). userData animation hooks the AI needs: u.limbs, u.head, u.jaw, u.detail (LOD), u.reveal (mimic), u.setPose (tallone).
- Lethal species use `MonsterSystem.huntChase` (client/js/monsters/ai.js): sense -> chase -> attack -> sweep last-known area -> rearm (dormant/patrol/gone). Hunter/bonefiend keep custom state machines.
- Structural monster test: `node test/monsters.test.mjs` (heights, visibility, hooks).
- Sessions: `hello` carries a `token`; dropped sockets keep their slot for `REJOIN_GRACE_MS` (default 90 s) and clients rejoin with `{t:'rejoin', code, token}` (same player id). Explicit `leave` removes instantly.
- Client auto-reconnect (main.js): backoff 1→15 s, `net-banner` HUD element, session in `sessionStorage` (`backrooms-session`); page refresh mid-game auto-resumes. Watchdog: 20 s of silence while in a room => forced socket close.
- Deploy files: `Dockerfile`, `render.yaml` (Frankfurt), `fly.toml`. Production check: `docker build` verified.
- Watchdog: `/tmp/backrooms-watchdog.sh` restarts `node server/index.js` when it dies. To deploy new code: `kill $(pgrep -f "node server/index.js")` — watchdog respawns it.
- Live URL: https://work-1-aqisgfbtgpjkucrl.prod-runtime.all-hands.dev/ (port 12000).

## Tests (all must stay green)
- `node test/worldgen.test.mjs` — deterministic worldgen + monster defs (46 assertions).
- `node test/multiplayer.test.js` — server protocol, two ws clients.
- `node test/browser.test.js` — headless Chromium + CDP, single player full flow.
- `node test/browser2p.test.js` — two headless browsers, seed/emote/sit/jump sync.
- Debug hooks: `window.__dbg` in main.js (state, pos, chunks, flash, remoteAnims, remoteY), `window.__seed`, `window.__lastRemoteEmote`.

## Hard-won lessons
- Keyboard events in CDP tests MUST be dispatched as `new KeyboardEvent('keydown', {code:'KeyX'})` on `window` — handlers read `e.code`, not `e.key`.
- `togglePause` must use the `paused` variable as state-of-truth, NOT the DOM class — settings/confirm flows hide the overlay while the game stays paused.
- Headless Chrome profiles (`--user-data-dir`) cache JS modules (`maxAge` was 1h): stale code caused phantom test failures. Test wipes `/tmp/c2p1` `/tmp/c2p2`; server now sends `Cache-Control: no-cache` for js/css/html (ETag 304s still cheap).
- `require('fs')` inside try/catch silently swallowed — always check imports exist.
- Remote player record in avatar.js stores `anim` on the record root (`p.anim`), not in `p.cur`.
- Eye height is 1.62; jump apex ≈ 0.48 (v=3.6, g=13.5); remote `cur.y` includes jump offset.
- The OpenHands browser tool clicks by coordinates and can miss small corner elements; verify corner-button behavior with JS `.click()` via CDP instead.

## Monster system (16 species, monster-redesign phase)
- defs.js MONSTER_TYPES + buildMonster(type): procedural bodies with wrong anatomy; u.detail[] = fine meshes (fingers/ribs) hidden beyond 30m LOD; u.setPose (tallone) snaps discrete postures.
- ai.js: host-authoritative FSM per species; detect() returns {player, nd, seen, heard, lit, litBy, observed} — flashlight cone + gaze cone need player yaw (dx,dz point monster-to-player, so player-to-monster is -dx,-dz).
- flashReact per type: freeze (hollow) / avoid (ceiling) / enrage (bonefiend) / vanish (tallone, deepone) / reveal (walldweller, falseplayer — opacity via applyVisibility, uses m.litLocal computed per-client).
- Species flags: farSpawn (55-220m out, needs distance >= 200m), pack, levelOnly (deepone=3), ceilingHug (y=2.75, drop attack), submerged (y~-0.5), lurch (snapped movement), scareKill (hollow contact = onScare + vanish).
- Snapshot rows are 7 fields: [id, typeIdx, x, z, yaw, stateCode, y]; STATE_CODES extended (drop=16, stare=17).
- AI throttling: nearD<45 every frame, <110 at 4Hz, beyond ~1.25Hz; limb anim skipped beyond 90m.
- envInteraction(): door creaks, chase clatter, deepone splashes — runs per-client from synced positions.
- killLightNear() (walldweller) reuses the lightdie event with fixture key.
- Visual QA without GPU: ?showcase=<type> URL param spawns the species 6m ahead with flashlight on.
