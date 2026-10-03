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
- `node test/objectives.test.mjs` — pure-Node progression/story/ending logic (157 assertions).
- `node test/browser-objectives.test.js` — headless full progression + finale flow.
- Debug hooks: `window.__dbg` in main.js (state, pos, chunks, flash, remoteAnims, remoteY, plus level/objectives/sites/exitPos/cinematicActive/skipCinematic/endingActive/completeObjectives/startEnding/endEnding/interact/nearInteractable/teleport), `window.__seed`, `window.__lastRemoteEmote`.
- KNOWN HEADLESS FLAKE: the `jump`/`jump height synced` assertions in browser.test.js / browser2p.test.js are flaky in SwiftShader (baseline fails too). Not a regression.

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
- Progression reactivity: `monsters.director.level` / `.objectives` feed spawn odds (ai.js hostSpawnLogic); `escalate(n)` raises `tension` (spawn odds + decay); `alertArea(x,z,r)` sends nearby monsters to search a noise. `LEVEL_POOLS[6]` = the finale deck.
- `monsters.ambientLine` is a `() => string` the horror scheduler calls ~28% of the time to surface a story fragment (`storyline`), wired via `wireAmbientStory()`.

## Progression / story / ending (implemented)
- `client/js/story.js` — PURE data: `STORY[level]` (title/intro/beats/epilogue/ambient), `ENDING` stages+tail, helpers `introFor/epilogueFor/beatsFor/beatFor/ambientFor/levelTitle/nextStoryLevel/isFinalLevel`, `LEVEL_ORDER=[0..6]`, `FINAL_LEVEL=6`.
- `client/js/objectives.js` — PURE logic: `OBJECTIVE_PLANS` per level, `planFor/siteGoal/siteCells/siteCenter/siteKey/objectiveSites/exitCellFor`, `ObjectiveTracker` (activateSite -> beat index, update(dt) for `survive`, snapshot/apply for late joiners, hudLines/progress/isComplete).
- `client/js/ending.js` — `EndingSequence` (self-contained outdoor set + camera dolly + `tickAnimation`/`tickEnvironment`); `ENV_PRESETS` normal/dawn/day/dusk/dread/crack/void.
- Premise: the Backrooms are a RECORDING; the ARCHIVIST catalogs visitors by replaying their last recorded moments; objective "intake nodes" force a fragment out. Twist: after escaping to the surface, the REC light is still on — the players are the playback, not the arrivals.
- World: `chunk.js buildObjectiveSite()` (black monolith pedestal + twin tape reels) and the exit gate (archive doorframe w/ cold light) are placed per `objectiveSites`/`exitCellFor`; chunks expose `interactables`; `WorldManager.nearestInteractable(px,pz,isUsed)`.
- Flow: sites -> `objectives.isComplete()` -> `unlockExit()` -> `useExit()` -> host `advance` (or `ending` on FINAL_LEVEL) -> `levelTransition` (epilogue cinematic) -> `enterLevel`. Non-blocking.

## HARD RULE — co-op/relay behaviour must be identical on every client
- Every client runs the SAME code from the SHARED SEED. Spawning is HOST-ONLY (`hostSpawnLogic`); clients only receive snapshots/LOD. `monsters.update()` MUST be called identically on host and clients.
- `objectiveSites(world, level)` and `exitCellFor(world, level)` MUST stay array-index deterministic — per-site `rngFrom(seed,...)` consumes the shared PRNG stream. NEVER call them in a different order on different clients (map/filter must preserve index order).
- Do NOT centralise progression on the server: rooms.js only relays/replays events. Adding replay requires putting the kind in `WORLD_EVENTS` (obj/advance/ending/noclip are now included).
- Story cinematics are NON-BLOCKING (`player.enabled` stays true) so co-op players can keep moving.
- The finale is per-client (each player watches their own ending); `ending` is relayed so the party enters it together.
