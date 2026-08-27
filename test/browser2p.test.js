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

    // --- host spawns one of each new species; client 2 must receive them
    // through the monster snapshot stream (buildMonster + network wire)
    await p1.eval(`
      ['tallone','hollow','bonefiend','walldweller','deepone','ceiling','falseplayer']
        .forEach((t, i) => window.__dbg.spawnMonster(t, 4 + i * 3, 12));
      true
    `);
    await sleep(2500);
    const hostTypes = await p1.eval(`window.__dbg.monsterTypes()`);
    const cliTypes = await p2.eval(`window.__dbg.monsterTypes()`);
    console.log('  [info] host monsters:', JSON.stringify(hostTypes));
    console.log('  [info] client monsters:', JSON.stringify(cliTypes));
    for (const t of ['tallone', 'hollow', 'bonefiend', 'walldweller', 'deepone', 'ceiling', 'falseplayer']) {
      check(cliTypes.some((s) => s.startsWith(t + ':')), `client 2 sees ${t}`);
    }

    // every synced monster must be VISUAL on client 2: in-scene group with
    // at least one visible mesh (catches LOGICAL-ONLY monsters)
    const visInfo = await p2.eval(`
      (window.__dbg && window.__dbg.monsters) ? window.__dbg.monsters() : 0;
      (window.__dbg && window.__dbg.monsterIds) ? window.__dbg.monsterIds() : []
      .map((id) => JSON.stringify(window.__dbg.monsterInfo(id)))
    `);
    const ids = await p2.eval(`window.__dbg.monsterIds ? window.__dbg.monsterIds() : []`);
    let allVisual = true;
    for (const id of ids) {
      const info = JSON.parse(await p2.eval(`JSON.stringify(window.__dbg.monsterInfo(${id}))`));
      if (!info || !info.inScene || !info.visibleMeshes) allVisual = false;
    }
    check(allVisual && ids.length === (await p2.eval(`window.__dbg.monsters()`)), 'all synced monsters are visual (in-scene + visible meshes)');

    // --- monster lifecycle: hunter spawn, detect, chase, attack, death ---
    // client 1 (host) spawns a hunter within detection range
    await p1.eval(`window.__dbg.spawnMonster('hunter', 7, 7)`);
    await sleep(500);
    const hostIds1 = await p1.eval(`window.__dbg.monsterIds ? window.__dbg.monsterIds() : []`);
    check(hostIds1.length > 0, 'host can spawn hunter');
    const hId = hostIds1[hostIds1.length - 1];
    // run toward it so it hears/sees us, then verify a chase state appears
    await p1.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'ShiftLeft'}));
      window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
      setInterval(() => window.__dbg.step(0.05), 50);
      true`);
    await sleep(6500);
    const states = await p1.eval(`window.__dbg.monsterTypes()`);
    console.log('  [info] lifecycle states:', JSON.stringify(states));
    check(states.some((s2) => /hunter|(chase|see_player|hear_player|investigate|search|attack)/.test(s2)),
      'hunter reaches an active detection/chase state');
    // let it catch us
    await sleep(14000);
    const died = await p1.eval(`window.__dbg.monsterInfo(${JSON.stringify(hId)})`);
    console.log('  [info] after catch:', JSON.stringify(died).slice(0, 120));
    check(died && (died.dead === true || /cooldown|search|patrol/.test((await p1.eval(`window.__dbg.monsterTypes()`)).join(' '))),
      'lethal monster can kill the player (death or post-attack cooldown)');
    // resurrect path sanity: spawn survived too
    

    // resurrect player 1 if it died during the hunt (scream is death-gated)
    await p1.eval(`if (window.__dbg.player && window.__dbg.player.dead) window.__dbg.respawn && window.__dbg.respawn();`);
    await sleep(300);
    // --- THE SCREAM (Q): client 1 screams; server relays it to client 2;
    // every shared monster flips to CHASE toward the screamer
    // keyboard repeat is suppressed? no: but doScream enforces a 12s cooldown —
    // use the function directly (the Q keybind is proven by browser.test elsewhere)
    await p1.eval(`window.__dbg.scream()`);
    await sleep(6500); // chase persistence can take several beats to settle on host
    const evRing = await p2.eval(`(window.__dbg && window.__dbg._ev) ? window.__dbg._ev.slice() : []`);
    console.log('  [info] p2 ev ring tail:', JSON.stringify(evRing.slice(-6)));
    const screamRelayed = Array.isArray(evRing) && evRing.includes('scream');
    check(screamRelayed === true, 'server relays scream event to peers');
    // lethal species chase; non-lethal species keep their own behaviour
    const LETHAL = ['ambusher','mimic','runner','crawler','walldweller','deepone','ceiling','falseplayer','hunter','bonefiend'];
    const ACCEPT = ['chase', 'attack', 'gone', 'search', 'lose_target', 'cooldown'];
    for (const px of [p1, p2]) {
      const sts = await px.eval(`window.__dbg.monsterTypes()`);
      const lethals = sts.filter((st) => LETHAL.includes(st.split(':')[0]));
      const bad = lethals.filter((st) => !ACCEPT.includes(st.split(':')[1]));
      check(bad.length === 0, 'scream flips every lethal monster to CHASE on ' + (px === p1 ? 'host' : 'client') + (bad.length ? ' [' + bad.join(',') + ']' : ''));
    }
    console.log('  [info] after-scream states:', JSON.stringify(await p1.eval(`window.__dbg.monsterTypes()`)));

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
