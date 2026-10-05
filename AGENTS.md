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
- `client/js/ending.js` — `EndingSequence` (self-contained outdoor set + camera dolly + `tickAnimation`/`tickEnvironment`); `ENV_PRESETS` normal/dawn/day/dusk/dread/crack/void. The `crack`/`void` stages ease `_faceCam` to 1 so the teammates stop idling and slowly turn to face the camera — the calm, late "it knows" tell at the reveal (not a jump scare). Debug: `__dbg.endingWatch()`, `__dbg.endingFiguresYaw()`.
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
- `client/js/flashlight.js` — realistic handheld beam built ONLY from real 3D lighting (there is NO volumetric cone mesh and no translucent overlay). **The beam is a SINGLE neutral-white SpotLight** (`0xffffff`, angle 0.20 / penumbra 0.55 / distance 60 / decay 2) carrying a procedural **cookie/gobo** (`map`) that projects a hot centre falling off to a dark rim. The earlier build had TWO extra lights — a wide warm spill SpotLight and a warm point fill — plus a warm `0xfff0d0` primary; over Level 0's already-warm yellow palette that painted a large **yellow/golden halo** across the scene (measured: 34% of the frame warm, mid-tone warm 0.247). Those secondary lights are now permanently disabled (`useSpill`/`useFill = false`, `SPILL_BASE`/`FILL_BASE = 0`; the objects are kept so `setQuality`/tests stay valid) and the primary is neutral white → measured warm area dropped to ~4% (just the level's own wallpaper lit naturally), centre no longer blown yellow. One light per player is also the cheapest option for mobile. The primary casts a real **dynamic shadow map** on high/ultra (renderer.shadowMap ON, PCFSoftShadowMap). Aim/position LAG the camera (`AIM_TAU=0.055`, `AIM_TAU_V=0.078`, `POS_TAU=0.05`) plus figure-8 walk bob, idle breathing, micro-vibration, trauma shake and an aim drift → a held feel. `reset()` snaps the rig. Cookies are module-cached and shared with remote avatars via `flashlightBeamMap()`. Debug: `__dbg.flashlightCone()` (angle/penumbra/decay/map/cookie/shadows/color/beamMesh/hand/mount/aim), `__dbg.flashAimLag(omega,pitchOmega)`.
- `client/js/renderer.js` — **UnrealBloomPass is deliberately weak** (strength 0.10 / radius 0.3 / threshold 0.95; ultra 0.16) because a strong bloom smeared the flashlight hotspot + level lights into a screen-wide glow. It now only affects genuinely bright light sources. `__dbg.bloom(on,strength)` toggles it for QA.
- `client/js/audio.js` additions: `startStreetAmbience/stopStreetAmbience`, `passingCar`, `concreteCrack`, `fallWhoosh`, `subDrop`, `landing`, `fluorescentBurst`, `machineLurch`, `waterSurge`, `elevatorChime`, plus `tear`, `radioStatic`, `whisper`, `flashlight(on)` click, `flashlightHum(on)` (looping driver whine, stops without forcing an AudioContext), and `flashlightRattle(amt)` (grip rattle on hard turns/jolts).
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
- `rooms.js` WORLD_EVENTS must include `loot`, `puzzle` and `flare` so late joiners replay them.
- Flares: `LOOT.flare` (`objectives.js`) fills `inventory.flare` on pickup. `G` (or the mobile FLARE button) calls `dropFlare` — the one deliberate exception to "everything deterministic": a lit flare is a RESERVED/non-deterministic entity relayed as a `flare` world event (`{x,z,key}`) and re-lit via `net.ready` replay, so joiners get the light but nobody consumes the site/exit PRNG. `updateFlares` slowly sinks the ember; a lit flare calls `monsters.alertArea` + `monsters.escalate`, trading light for attention. Inventory shows next to the battery HUD (`✜×N`).
- `chunk.js`: `hazardGroup` floor quads + risk/reward crates; `buildPuzzleNode` (warm breaker pedestal, distinct from the cold objective beacons).
- Debug hooks: `__dbg.hazard()/hazardPos()/hazardAt(t)/lootPos()`, `__dbg.puzzlePos()/puzzleGoal()/completePuzzle()`, `__dbg.objectives()` reports `puzzle/puzzleGoal/puzzleDone`; `__dbg.inventory()/flares()/giveFlare(n)/setFlares(n)/dropFlare()`; `__dbg.tickHazard(dt)` steps hazard exposure deterministically (rAF is throttled headless).
- Headless caution: `gameState='transition'` blocks the rAF loop, so per-frame hazard/puzzle updates don't run — tests must clear transitions first (see `browser-objectives.test.js`).

## Death screen / menu flow / flashlight realism (fix pass)
- DEATH BLACK SCREEN: `#fade` was z-index 90, above `#death-overlay` (55), so the found-footage blackout permanently hid the death card. Fix: `#death-overlay` is now z-index 94 (above fade) + `pointer-events:auto`; `localDeath()` lifts the fade after the ~0.75s blackout punch; a `#btn-death-respawn` button lets touch players retry. `respawn()` now hard-resets the camera (`camera.position/rotation`) and calls `flash.reset()`. Debug: `__dbg.die()`, `__dbg.death()`, `__dbg._tickDead(dt)` (deterministic timer for tests).
- MENU/START: `start` handler is idempotent (`gameState==='playing' && world.level===m.level` → ignore); `requestStart()` resends once after 2.5s if still in the lobby (start packet loss can no longer strand the player); `startGame()` arms a 6s safety net that lifts the fade once the world is built and not dead/paused. Never leave a black screen.
- FLASHLIGHT realism (REBUILD): see the flashlight bullet above — cookie/gobo-projected beam + real dynamic soft shadows + 3-light rig + lagged hand. The old flat cone is gone. `__dbg.flashlightCone()` reports `map/cookie/shadows/spillIntensity`; `__dbg.flashAimLag(omega,pitchOmega)` proves the beam trails a sustained turn (0.096 rad at 2 rad/s) and lags more under a faster whip. `renderer.js` now enables `shadowMap` (PCFSoftShadowMap); only the flashlight spot casts, so the cost is one 1024² map at high/ultra and zero at low/medium.
- Visual QA without a GPU: a throwaway CDP harness screenshots the frame and decodes the PNG to measure the beam profile — hot centre ≈0.84, monotonic falloff (mid 0.51 → edge 0.27), corners ≈0.015, whole-frame ≈0.17 on vs 0.08 off (environment stays dark). Recreate with `Page.captureScreenshot` + a zlib PNG decoder if needed.
- COLD OPEN (`opening.js`): added `_buildEnvironment()` — drizzle (90 streaks), swaying tree canopies, drifting ground mist, exhaled-breath puffs; deterministic `_tickSteps()` plays `audio.footstep('concrete')` while walking; the `fall` shot now accelerates then brakes (free-fall → caught). New debug: none added; tests unchanged except beam-angle bounds.
- Pre-existing flaky headless tests (NOT regressions — fail identically on a clean tree): `browser2p` "jump height synced to peer", `browser` door-toggle on some seeds. `browser.test.js` jump check was made deterministic via `__dbg.step()` and now always passes.

