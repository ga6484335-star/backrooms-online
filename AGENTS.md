# THE BACKROOMS — project memory

## Architecture
- `client/` — Three.js ES modules, no build step; served statically by `server/index.js` (Express).
- `server/` — Express static + `ws` WebSocket rooms (`rooms.js`). Port from `PORT` env (default 12000).
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
