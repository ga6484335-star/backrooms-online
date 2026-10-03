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
- `node test/objectives.test.mjs` — pure-Node progression/story/ending/opening logic (186 assertions).
- `node test/browser-objectives.test.js` — headless full progression + finale flow.
- `node test/browser-opening.test.js` — headless cold open: shot order, voice engine, flashlight beam shape, hand-off (drives `__dbg._tickOpen`).
- `node test/pages.test.js` — Pages-style boot check (now self-hosts the server on :13500; pass a URL to test an external target).
- Debug hooks: `window.__dbg` in main.js (state, pos, chunks, flash, flashlightCone, remoteAnims, remoteY, plus level/objectives/sites/exitPos/cinematicActive/skipCinematic/endingActive/completeObjectives/startEnding/endEnding/interact/nearInteractable/teleport, openActive/openState/transitionActive/_tickOpen/_tickTransition, voiceSupported/voiceEnabled/speakerFor), `window.__seed`, `window.__lastRemoteEmote`.
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

## Opening cinematic + story experience
- `client/js/opening.js` — `OpeningSequence`: a real cold-open FILM, not a walk. 8 shots (`street → wrong → stare → crack → tear → fall → land → wake`) built from `OPENING.phases`. Owns its own set (wet road, drifting street lamps, a "hasn't moved" car, the figure under the lamp, the concrete crack, the reality tear), a first-person body (hand+camcorder+REC dot, swinging legs, parented to the camera), fall streaks, atmosphere and DOM card.
  - `group.position.y = originY (260)` so the street floats ABOVE the Backrooms (pre-streaming at ground level); the `fall` shot sinks the camera from the stage to y≈1.2 to land in the real corridors. Surface props fade out via `_surfaceOp` as the fall begins.
  - Camera is scripted per `phase.shot` (`walk/unease/figure/crack/tear/fall/land/wake`) with handheld sway, leg swing, roll, and `engine.bumpGlitch` on the tear. First-person continuity is kept throughout.
  - `stare` shot: the figure is at +X (`fig.position.set(5.4,...)`), so the camera yaw goes strongly NEGATIVE (three.js forward = `(-sin,0,-cos)`; negative yaw looks toward +X). Don't "fix" this to positive — that looks away.
- `camera` is added to `scene` at boot (`scene.add(camera)`) so camera-parented effects render (transition sheets/streaks/body).
- `client/js/voice.js` — `VoiceEngine`: spoken dialogue via the Web Speech API (the game ships no audio files). Moods (`calm/tired/uneasy/dread/whisper/radio/machine`) colour rate/pitch/volume and map to a subtitle speaker via `speakerFor()`. Falls back to a radio-static/whisper texture (from AudioEngine) when speech is unavailable, and a `_gen` guard ignores stale cancelled-utterance callbacks. Toggle with the VOICE DIALOGUE setting (`set-voice`, persisted in `br_settings.voice`). Purely local/presentational — never touches the network.
- `client/js/flashlight.js` — realistic handheld beam: a tight primary SpotLight + a wider dimmer spill halo + a tight point fill + an additive volumetric cone shader (length+edge gradient). Aim/position LAG the camera (`AIM_TAU=0.085`, `POS_TAU=0.05`) for a held feel; physical falloff (`decay=2`); battery drains ~5 min and low battery flickers. Debug: `__dbg.flashlightCone()`.
- `client/js/audio.js` additions: `startStreetAmbience/stopStreetAmbience`, `passingCar`, `concreteCrack`, `fallWhoosh`, `subDrop`, `landing`, `fluorescentBurst`, `machineLurch`, `waterSurge`, `elevatorChime`, plus `tear`, `radioStatic`, `whisper`, and `flashlight(on)` click.
- `client/js/transitions.js` — `TransitionSequence`: one distinct reveal per level, keyed by `PREROLL[level].kind` (fall/door/lurch/flood/wake/elevator/ascent). Overlay sheets + camera scripts + a blackout `alpha(p)` reveal, ~8-9.5s, then hands back. `PREROLL`/`OPENING`/`RADIO` + `prerollFor/radioFor/openingLine/openingLines` live in `story.js`.
- Flow: fresh session on level 0 → `startOpening()` (state `opening`); every other entry → `startTransition(level)` (state `transition`); both end in `finishOpening()/finishTransition()` → `gameState='playing'`, teleport to spawn, then the non-blocking `introFor(level)` cinematic. `?skipintro=1` (used by tests) skips the film but still shows the level intro.
- Skip: `E`/`Space`/`Enter`/`Esc` (keydown) or any canvas click/tap. Debug hooks: `__dbg.openActive/openState/transitionActive`, `__dbg._tickOpen(n,dt)`/`__dbg._tickTransition(n,dt)` (headless tests drive the sequences by hand since rAF is throttled), `cinematicActive()`, `voiceSupported/voiceEnabled/speakerFor`.
- The loop has a dedicated `opening`/`transition` branch (like `ending`) that runs the sequence + streams chunks/lights/remotes and returns before gameplay.
- Story cinematics (`showCinematic`) speak each line with the `machine` mood by default and label the speaker.
- HUD: `#objective-compass` (arrow/edge rotation via `updateObjectiveCompass`, throttled 5Hz) points to the next un-activated site or the exit. Objective nodes have a tall emissive beacon + cold point light in `chunk.js`.
- Monsters: `stageEncounter(typeOrNull, x, z)` queues a story-beat spawn (next host tick, out of the view cone) — fired on arrival, on exit unlock, ~50% of node activations. `pickStagedType` chooses from `LEVEL_POOLS`. Director pacing is faster; first encounter guaranteed by ~55m or 20s. `events.radioLine` surfaces `RADIO[level]` scraps.
- Fixed latent bugs: `wireAmbientStory` treated `ambientFor()` (a string) as an array; `playT` was declared inside a `switch` case but used in later cases (TDZ).

## Signature hazards (per level) + puzzle lock
- `objectives.js` `HAZARDS`/`hazardFor/hazardCells/hazardPhase/hazardDps`: a deterministic positional threat per level (`none/steam/current/flood/malfunction/lightsout/surge2`). Warn/active windows are a pure function of `(world, level, shared elapsed t)`; cells come from an INDEPENDENT rng stream (`hashStr(seed, 'haz:'+level)`) so site/exit/cache PRNG indices are untouched. Active cells never coincide with a site, the exit, or a cache.
- `PUZZLES`/`puzzleFor/puzzleCells/puzzleSites`: a keyed lock that seals the exit on every level (independent rng stream `pz:<level>`, memoized, guaranteed solvable — falls back to the exit cell). `ObjectiveTracker` now needs `puzzleDone()` as well as every plan objective before `isComplete()`.
- `main.js`: `updateHazard` (local exposure/damage, HUD, blackout dim), `updateHazardFloors` (pulsing floor sheets per shared clock), `collectPuzzle`/`onPuzzleCollected`, loot pickup (`takeLoot`). All relays go through `net.sendEvent`.
- `rooms.js` WORLD_EVENTS must include `loot` and `puzzle` so late joiners replay them.
- `chunk.js`: `hazardGroup` floor quads + risk/reward crates; `buildPuzzleNode` (warm breaker pedestal, distinct from the cold objective beacons).
- Debug hooks: `__dbg.hazard()/hazardPos()/hazardAt(t)/lootPos()`, `__dbg.puzzlePos()/puzzleGoal()/completePuzzle()`, `__dbg.objectives()` reports `puzzle/puzzleGoal/puzzleDone`.
- Headless caution: `gameState='transition'` blocks the rAF loop, so per-frame hazard/puzzle updates don't run — tests must clear transitions first (see `browser-objectives.test.js`).

