// Headless browser test for the cold open: loads the game WITHOUT skipintro,
// starts a room, and verifies the cinematic opening runs shot-by-shot from the
// ordinary street through the tear/fall to the Backrooms, then hands control
// back. Also checks the voiced-dialogue engine and the flashlight beam shape.
//
// rAF is throttled in headless, so the sequence is advanced deterministically
// through window.__dbg._tickOpen instead of waiting on real time.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const PORT = 13091;
const CDP_PORT = 9334;
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(cond, label) {
  if (cond) console.log('  \u2714 ' + label);
  else { console.log('  \u2718 FAILED: ' + label); failures++; }
}

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const json = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${CDP_PORT}/json`, (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      const page = json.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* retry */ }
    await sleep(400);
  }
  throw new Error('CDP not reachable');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.nextId = 1; this.pending = new Map(); this.events = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); }
      else if (m.method) this.events.push(m);
    });
  }
  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((res) => { this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr) {
    const r = await this.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
}

async function main() {
  const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await sleep(1200);
  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`, '--window-size=1280,800',
    '--autoplay-policy=no-user-gesture-required',
    `http://127.0.0.1:${PORT}/`,
  ], { stdio: 'pipe' });
  await sleep(3000);

  const ws = new WebSocket(await getWsUrl());
  await new Promise((r) => ws.on('open', r));
  const cdp = new CDP(ws);
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await cdp.call('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await sleep(6000);

  // create + start a room (the cold open runs on a fresh Level 0 session)
  await cdp.eval(`document.getElementById('name-input').value='OPENER'; document.getElementById('btn-create').click()`);
  await sleep(1200);
  await cdp.eval(`document.getElementById('btn-start').click()`);
  await sleep(2500);

  const boot = await cdp.eval(`JSON.stringify({
    state: window.__dbg.state().gameState,
    overlay: !document.getElementById('opening-overlay').classList.contains('hidden'),
    active: window.__dbg.openActive(),
    card: document.getElementById('opening-card').textContent,
    speaker: document.getElementById('opening-speaker').textContent,
  })`);
  const b = JSON.parse(boot);
  check(b.state === 'opening', 'fresh Level 0 session opens in story mode (' + b.state + ')');
  check(b.overlay === true && b.active === true, 'cold-open overlay is on screen');
  check(/THE WAY HOME/i.test(b.card), 'first card sets the scene: "' + b.card + '"');
  check(b.speaker === 'INNER VOICE', 'first line is voiced as the inner voice');

  // the voice engine reports itself available in Chromium (and degrades safely)
  const voice = await cdp.eval(`JSON.stringify({
    supported: window.__dbg.voiceSupported(),
    enabled: window.__dbg.voiceEnabled(),
    machine: window.__dbg.speakerFor('machine'),
    whisper: window.__dbg.speakerFor('whisper'),
  })`);
  const v = JSON.parse(voice);
  check(v.enabled === true, 'voice dialogue is enabled by default');
  check(typeof v.supported === 'boolean', 'voice engine reports speech support (' + v.supported + ')');
  check(v.machine === 'THE ARCHIVIST' && v.whisper === 'A WHISPER', 'moods map to the right speaker labels');

  // drive the cinematic deterministically and record the shot order
  const journey = await cdp.eval(`(() => {
    const seen = [];
    let last = null, guard = 0;
    while (window.__dbg.openActive() && guard < 4000) {
      const s = window.__dbg.openState();
      if (s && s.key !== last) { seen.push(s.key); last = s.key; }
      window.__dbg._tickOpen(1, 0.25);
      guard++;
    }
    return JSON.stringify({ seen, guard, state: window.__dbg.state().gameState, active: window.__dbg.openActive() });
  })()`);
  const j = JSON.parse(journey);
  const order = ['street', 'wrong', 'stare', 'crack', 'tear', 'fall', 'land', 'wake'];
  check(order.every((k) => j.seen.includes(k)), 'cold open plays every shot: ' + j.seen.join(' -> '));
  check(j.seen.indexOf('tear') > j.seen.indexOf('crack') && j.seen.indexOf('fall') > j.seen.indexOf('tear'),
    'the world tears before the fall');
  check(j.seen.indexOf('land') > j.seen.indexOf('fall'), 'the fall lands in the Backrooms');
  check(j.state === 'playing' && j.active === false, 'control returns to the player after the cold open');

  // the hand-off teleports onto a real Level 0 tile
  const pos = await cdp.eval(`JSON.stringify(window.__dbg.pos())`);
  const p = JSON.parse(pos);
  check(p.every((n) => Number.isFinite(n)) && p[1] <= 2, 'player lands on solid ground: ' + pos);

  // flashlight: tight, neutral, physically-falloff beam — NO wide spill wash
  // (a wide warm spill was the source of the fake yellow halo over the scene)
  await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyF'}))`);
  await sleep(400);
  const cone = await cdp.eval(`JSON.stringify(window.__dbg.flashlightCone())`);
  const c = JSON.parse(cone);
  check(c && c.angle > 0.1 && c.angle < 0.25, 'flashlight beam is a tight, focused cone (' + (c && c.angle) + ' rad)');
  check(c && c.penumbra > 0.4 && c.penumbra < 0.8, 'flashlight beam has soft natural edges (penumbra ' + (c && c.penumbra) + ')');
  check(c && c.decay === 2 && c.distance >= 45, 'flashlight has physical falloff and real throw');
  check(c && c.intensity > 0, 'flashlight carries natural intensity');
  check(c && c.map === true && c.cookie > 0, 'flashlight projects a shaped beam cookie, not a flat disc');
  check(c && c.color && Math.abs(c.color[0] - c.color[2]) < 0.05 && c.color[0] > 0.9,
    'flashlight is neutral white, not a warm/yellow tint (' + JSON.stringify(c && c.color) + ')');
  check(c && c.spillIntensity === 0, 'flashlight has no wide spill wash (no fake halo)');
  check(c && c.beamMesh === false, 'flashlight is pure light — no translucent cone/overlay mesh');

  // held-light aim lag: a sustained turn must leave the beam trailing behind,
  // but only by a small, felt amount (never enough to hurt aiming)
  const lag = await cdp.eval(`JSON.stringify(window.__dbg.flashAimLag(2.0, 0))`);
  const lg = JSON.parse(lag);
  check(lg && lg.lagRad > 0.01 && lg.lagRad < 0.6, 'flashlight aim trails a sustained turn by a tiny, felt amount (' + (lg && lg.lagRad.toFixed(4)) + ' rad)');
  // a faster whip lags a little more than a slow pan
  const slow = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.flashAimLag(1.0, 0))`));
  const fast = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.flashAimLag(3.5, 0))`));
  check(fast.lagRad > slow.lagRad, 'the beam lags more under a faster turn (physical inertia)');
  // vertical lag exists too (looking up/down has its own weight)
  const vert = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.flashAimLag(0, 2.0))`));
  check(vert.lagRad > 0.005, 'flashlight also lags vertically when looking up/down (' + vert.lagRad.toFixed(4) + ' rad)');

  // console errors?
  const errs = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown');
  const glNoise = errs.filter((e) => /WebGL context could not be created|Error creating WebGL context|WebGL unavailable/.test(JSON.stringify(e.params.exceptionDetails)));
  const real = errs.filter((e) => !glNoise.includes(e));
  if (real.length) for (const e of real.slice(0, 3)) console.log('  [err]', JSON.stringify(e.params.exceptionDetails).slice(0, 300));
  check(real.length === 0, 'no unexpected console errors (' + real.length + ')');

  chrome.kill(); server.kill();
  console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURES'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('TEST EXCEPTION:', e); process.exit(1); });
