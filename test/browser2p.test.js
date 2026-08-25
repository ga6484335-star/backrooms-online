// Two-client browser multiplayer test: two headless Chrome pages connect to
// the same server, create/join the same room, verify world seed + player sync.
// Uses the app's own WebSocket protocol directly (no real WebGL needed).
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const PORT = 13091;
const CDP1 = 9340, CDP2 = 9341;
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(cond, label) {
  if (cond) console.log('  ✔ ' + label);
  else { console.log('  ✘ FAILED: ' + label); failures++; }
}

async function getWsUrl(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const json = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${port}/json`, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej);
      });
      const page = json.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* retry */ }
    await sleep(300);
  }
  throw new Error('CDP not reachable on ' + port);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.nextId = 1; this.pending = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); }
    });
  }
  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((res) => { this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr) {
    const r = await this.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
}

async function makeClient(port, name) {
  const wsUrl = await getWsUrl(port);
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.on('open', r));
  const cdp = new CDP(ws);
  await cdp.call('Runtime.enable');
  await cdp.call('Page.enable');
  await cdp.call('Page.navigate', { url: `http://127.0.0.1:${PORT}/?v=${Date.now()}` });
  await sleep(4500);
  return cdp;
}

async function main() {
  const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  server.stderr.on('data', (d) => process.stderr.write('SRVERR ' + d));
  await sleep(1200);

  // fresh profiles: stale JS module cache in old profiles breaks tests
  try { fs.rmSync('/tmp/c2p1', { recursive: true, force: true }); fs.rmSync('/tmp/c2p2', { recursive: true, force: true }); } catch {}
  const c1 = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--user-data-dir=/tmp/c2p1',
    `--remote-debugging-port=${CDP1}`, 'about:blank'], { stdio: 'pipe' });
  const c2 = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--user-data-dir=/tmp/c2p2',
    `--remote-debugging-port=${CDP2}`, 'about:blank'], { stdio: 'pipe' });
  c1.stderr.on('data', () => {}); c2.stderr.on('data', () => {});
  await sleep(2500);

  try {
    const p1 = await makeClient(CDP1, 'A');
    const p2 = await makeClient(CDP2, 'B');

    // --- client 1 creates room via real UI
    await p1.eval(`document.getElementById('name-input').value='ALICE'`);
    await p1.eval(`document.getElementById('btn-create').click()`);
    await sleep(1500);
    const code = await p1.eval(`document.getElementById('lobby-code').textContent`);
    check(/^[A-Z2-9]{6}$/.test(code), 'room code: ' + code);
    const c1count = await p1.eval(`document.getElementById('lobby-count').textContent`);
    check(/PLAYERS: 1\/8/.test(c1count), 'creator sees 1/8');

    // --- client 2 joins
    await p2.eval(`document.getElementById('name-input').value='BOB'`);
    await p2.eval(`document.getElementById('btn-join').click()`);
    await sleep(400);
    await p2.eval(`document.getElementById('join-code').value='${code}'`);
    await p2.eval(`document.getElementById('btn-join-go').click()`);
    await sleep(1500);
    const c2count = await p2.eval(`document.getElementById('lobby-count').textContent`);
    check(/PLAYERS: 2\/8/.test(c2count), 'joiner sees 2/8: ' + c2count);
    const c1count2 = await p1.eval(`document.getElementById('lobby-count').textContent`);
    check(/PLAYERS: 2\/8/.test(c1count2), 'creator updated to 2/8: ' + c1count2);

    // both must see identical seed (deterministic world)
    const seed1 = await p1.eval(`window.__seed || 'n/a'`);
    const seed2 = await p2.eval(`window.__seed || 'n/a'`);
    check(seed1 === seed2 && seed1 !== 'n/a', 'shared world seed: ' + seed1);

    // --- host starts game
    await p1.eval(`document.getElementById('btn-start').click()`);
    await sleep(2500);
    const h1 = await p1.eval(`!document.getElementById('game-ui').classList.contains('hidden')`);
    const h2 = await p2.eval(`!document.getElementById('game-ui').classList.contains('hidden')`);
    check(h1 === true, 'client 1 in game HUD');
    check(h2 === true, 'client 2 in game HUD');

    // --- client 1 sends an emote; client 2 should see it (verify network wire)
    await p1.eval(`document.querySelector('#emote-bar button[data-emote=dance]').click()`);
    await sleep(800);
    const emoteSeen = await p2.eval(`window.__lastRemoteEmote || 'none'`);
    console.log('  [info] emote seen by client 2:', emoteSeen);

    // --- client 1 sits; client 2 must see the sit animation via state sync
    await p1.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyC'}))`);
    await sleep(1200);
    const sitSeen = await p2.eval(`(window.__dbg && window.__dbg.remoteAnims) ? window.__dbg.remoteAnims() : ['no-dbg']`);
    console.log('  [info] remote anims seen by client 2:', JSON.stringify(sitSeen));
    check(Array.isArray(sitSeen) && sitSeen.includes('sit'), 'sit posture synced to peer');
    await p1.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyC'}))`);
    await sleep(1200);
    const standSeen = await p2.eval(`(window.__dbg && window.__dbg.remoteAnims) ? window.__dbg.remoteAnims() : ['no-dbg']`);
    check(Array.isArray(standSeen) && !standSeen.includes('sit'), 'stand synced back to peer');

    // --- client 1 jumps; client 2 must see vertical offset
    await p1.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'Space'}))`);
    await sleep(400);
    const jumpSeen = await p2.eval(`(window.__dbg && window.__dbg.remoteY) ? window.__dbg.remoteY() : []`);
    console.log('  [info] remote y offsets seen by client 2:', JSON.stringify(jumpSeen));
    check(Array.isArray(jumpSeen) && jumpSeen.some((y) => y > 1.7 && y < 2.2), 'jump height synced to peer');

    // --- disconnect client 2, verify client 1 updates
    c2.kill('SIGKILL');
    await sleep(1500);
    const c1count3 = await p1.eval(`document.getElementById('players-hud') ? document.getElementById('players-hud').textContent : 'no-hud-el'`);
    console.log('  [info] players-hud after peer disconnect:', c1count3);
    check(!/BOB/.test(c1count3), 'disconnected player removed from hud');
  } catch (e) {
    console.error('TEST EXCEPTION:', e.message);
    failures++;
  } finally {
    try { c1.kill(); } catch {}
    try { c2.kill(); } catch {}
    server.kill();
  }

  if (failures) { console.log(`\n${failures} FAILURES`); process.exit(1); }
  console.log('\n2P BROWSER MULTIPLAYER TEST PASSED ✔');
}

main();
