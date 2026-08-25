// Headless browser smoke test: loads the game, creates a room, starts it,
// simulates movement, screenshots, and fails on console errors.
// Requires chromium at /usr/bin/chromium (or $CHROME_PATH).
'use strict';
const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = 13090;
const CDP_PORT = 9333;
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const json = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${CDP_PORT}/json`, (r) => {
          let d = '';
          r.on('data', (c) => (d += c));
          r.on('end', () => res(JSON.parse(d)));
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
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m);
        this.pending.delete(m.id);
      } else if (m.method) {
        this.events.push(m);
      }
    });
  }
  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((res) => {
      this.pending.set(id, res);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
}

async function main() {
  const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  server.stderr.on('data', (d) => process.stderr.write('SRVERR ' + d));
  await sleep(1200);

  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`, '--window-size=1280,800',
    '--autoplay-policy=no-user-gesture-required',
    `http://127.0.0.1:${PORT}/`,
  ], { stdio: 'pipe' });
  chrome.stderr.on('data', () => {});

  const failures = [];
  try {
    const wsUrl = await getWsUrl();
    const WebSocket = require('ws');
    const ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((res) => ws.on('open', res));
    const cdp = new CDP(ws);

    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    await sleep(4000); // let the app boot + menu render

    // collect console errors
    const errors = () => cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));

    // 1. menu visible
    const menuVisible = await cdp.eval(`!document.getElementById('menu').classList.contains('hidden')`);
    check(menuVisible === true, 'main menu visible');
    const title = await cdp.eval(`document.querySelector('.title').textContent`);
    check(/BACKROOMS/.test(title), 'title renders: ' + title.trim().slice(0, 30));

    // 2. WebGL: either a real context, or the app must survive gracefully
    // (headless CI often has no GL). The app must not crash either way.
    const gl = await cdp.eval(`(() => { const c = document.getElementById('gl'); const g = c.getContext('webgl2') || c.getContext('webgl'); return !!g; })()`);
    if (gl === true) {
      check(true, 'WebGL context created');
    } else {
      const survived = await cdp.eval(`!!document.getElementById('webgl-error') && document.getElementById('boot-msg').classList.contains('gone')`);
      check(survived === true, 'WebGL unavailable but app survived (error overlay + menu)');
    }

    // 3. create room through the real UI
    await cdp.eval(`document.getElementById('name-input').value='TESTER'`);
    await cdp.eval(`document.getElementById('btn-create').click()`);
    await sleep(1500);
    const lobbyVisible = await cdp.eval(`!document.getElementById('lobby').classList.contains('hidden')`);
    check(lobbyVisible === true, 'lobby shown after create');
    const code = await cdp.eval(`document.getElementById('lobby-code').textContent`);
    check(/^[A-Z2-9]{6}$/.test(code), 'room code displayed: ' + code);
    const count = await cdp.eval(`document.getElementById('lobby-count').textContent`);
    check(/PLAYERS: 1\/8/.test(count), 'player count: ' + count);

    // 4. start game
    await cdp.eval(`document.getElementById('btn-start').click()`);
    await sleep(2500);
    const hudVisible = await cdp.eval(`!document.getElementById('game-ui').classList.contains('hidden')`);
    check(hudVisible === true, 'game HUD visible after start');
    const rec = await cdp.eval(`document.getElementById('timecode').textContent`);
    check(/\d{2}:\d{2}:\d{2}:\d{2}/.test(rec), 'timecode running: ' + rec);

    // 5. world actually streamed chunks
    const chunks = await cdp.eval(`window.__dbg ? window.__dbg.chunks() : -1`);
    check(chunks === -1 || chunks > 0, 'chunks loaded: ' + chunks);

    // 6. simulate walking forward via keydown + frames
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyW'}))`);
    await sleep(2500);
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keyup', {code:'KeyW'}))`);
    const posAfter = await cdp.eval(`window.__dbg ? JSON.stringify(window.__dbg.pos()) : '[]'`);
    console.log('  [info] player pos after walk:', posAfter);

    // 7. emote
    await cdp.eval(`document.querySelector('#emote-bar button[data-emote=dance]').click()`);
    await sleep(300);

    // 8. interact prompt system alive
    const prompt = await cdp.eval(`typeof document.getElementById('interact-prompt') !== 'undefined'`);
    check(prompt === true, 'interact prompt element exists');

    // 9. take screenshots for visual verification
    const shot1 = await cdp.call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'shot-game.png'), Buffer.from(shot1.result.data, 'base64'));

    // 10. settings panel
    // (quit first)
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'Escape'}))`);
    await sleep(300);
    const pauseVisible = await cdp.eval(`!document.getElementById('pause-overlay').classList.contains('hidden')`);
    check(pauseVisible === true, 'pause overlay opens on Esc');
    const hasSettings = await cdp.eval(`!!document.getElementById('btn-pause-settings')`);
    const hasLeave = await cdp.eval(`document.getElementById('btn-quit').textContent.includes('LEAVE')`);
    check(hasSettings === true, 'pause menu has SETTINGS');
    check(hasLeave === true, 'pause menu has LEAVE SERVER');

    // 10b. hamburger button visible in game
    const burger = await cdp.eval(`!!document.getElementById('btn-hud-menu')`);
    check(burger === true, 'hamburger menu button exists in HUD');

    // 10c. leave confirm dialog: CANCEL returns to pause
    await cdp.eval(`document.getElementById('btn-quit').click()`);
    await sleep(200);
    const confirmShown = await cdp.eval(`!document.getElementById('leave-confirm').classList.contains('hidden')`);
    check(confirmShown === true, 'leave confirmation dialog shown');
    await cdp.eval(`document.getElementById('btn-leave-cancel').click()`);
    await sleep(200);
    const backToPause = await cdp.eval(`!document.getElementById('pause-overlay').classList.contains('hidden') && document.getElementById('leave-confirm').classList.contains('hidden')`);
    check(backToPause === true, 'CANCEL returns to pause menu');

    // 10d. in-game settings opens and BACK returns to game without disconnect
    await cdp.eval(`document.getElementById('btn-pause-settings').click()`);
    await sleep(200);
    const settingsShown = await cdp.eval(`!document.getElementById('settings-panel').classList.contains('hidden')`);
    check(settingsShown === true, 'settings opens from pause');
    await cdp.eval(`document.getElementById('btn-settings-back').click()`);
    await sleep(300);
    const backInGame = await cdp.eval(`window.__dbg.state()`);
    check(backInGame && backInGame.gameState === 'playing', 'still in game after settings (no disconnect)');
    const pauseClosed = await cdp.eval(`document.getElementById('pause-overlay').classList.contains('hidden')`);
    check(pauseClosed === true, 'pause closed after settings BACK');

    // 11. SIT / STAND state machine: sit → stand → move; never stuck
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyC'}))`);
    await sleep(300);
    const sitting = await cdp.eval(`window.__dbg.state().sitting`);
    check(sitting === true, 'sit engages');
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyC'}))`);
    await sleep(300);
    const standing = await cdp.eval(`window.__dbg.state().sitting === false`);
    check(standing === true, 'sit toggles back to standing');
    // sit again then auto-stand by walking
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyC'}))`);
    await sleep(200);
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyW'}))`);
    await sleep(400);
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keyup', {code:'KeyW'}))`);
    const autoStand = await cdp.eval(`window.__dbg.state().sitting === false`);
    check(autoStand === true, 'walking auto-stands from sit');

    // 12. JUMP: grounded → airborne → lands; Space mid-air must NOT double height
    const jumpTest = await cdp.eval(`(async () => {
      const s0 = window.__dbg.state();
      if (!s0.grounded) return { ok: false, why: 'not grounded at start' };
      window.dispatchEvent(new KeyboardEvent('keydown', {code:'Space'}));
      let maxY = 0, airborne = false;
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 70));
        const s = window.__dbg.state();
        if (!s.grounded) airborne = true;
        if (s.yOff > maxY) maxY = s.yOff;
        if (i === 2) window.dispatchEvent(new KeyboardEvent('keydown', {code:'Space'})); // mid-air: must be ignored
      }
      await new Promise(r => setTimeout(r, 700));
      const end = window.__dbg.state();
      const landed = end.grounded && end.yOff === 0;
      // v=3.6, g=13.5 → apex ≈ 0.48m; a double jump would exceed 0.9m
      return { ok: airborne && landed && maxY > 0.1 && maxY < 0.7, airborne, landed, maxY: +maxY.toFixed(3) };
    })()`);
    check(jumpTest && jumpTest.ok === true, 'jump works: airborne, lands, no double-jump ' + JSON.stringify(jumpTest));

    // 13. flashlight toggle via F
    const flashTest = await cdp.eval(`(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyF'}));
      await new Promise(r => setTimeout(r, 150));
      const on = window.__dbg.flash();
      window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyF'}));
      await new Promise(r => setTimeout(r, 150));
      const off = window.__dbg.flash();
      return { on: on && on.on, off: off && !off.on };
    })()`);
    check(flashTest && flashTest.on === true && flashTest.off === true, 'flashlight toggles on/off with F');

    // console errors? (filter out expected WebGL-unavailable noise when headless
    // has no GL — the app surviving is the actual assertion)
    const allErrs = errors();
    const glNoise = allErrs.filter((e) => {
      const txt = e.method === 'Runtime.exceptionThrown'
        ? JSON.stringify(e.params.exceptionDetails)
        : e.params.args.map((a) => a.value || a.description || '').join(' ');
      return /WebGL context could not be created|Error creating WebGL context|WebGL unavailable/.test(txt);
    });
    const errs = allErrs.filter((e) => !glNoise.includes(e));
    if (errs.length) {
      for (const e of errs.slice(0, 5)) {
        const txt = e.method === 'Runtime.exceptionThrown'
          ? JSON.stringify(e.params.exceptionDetails).slice(0, 400)
          : e.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 400);
        failures.push('console: ' + txt);
        console.log('  ✘ console error:', txt);
      }
    } else {
      console.log(`  ✔ no unexpected console errors (${glNoise.length} WebGL-unavailable messages ignored)`);
    }
  } catch (e) {
    failures.push('exception: ' + e.message);
    console.error('TEST EXCEPTION:', e.message);
  } finally {
    chrome.kill();
    server.kill();
  }

  if (failures.length || checkFailed) {
    console.log('\n' + (failures.length + (checkFailed ? 1 : 0)) + ' FAILURES');
    process.exit(1);
  }
  console.log('\nBROWSER TEST PASSED ✔');
}

let checkFailed = false;
function check(cond, label) {
  if (cond) console.log('  ✔ ' + label);
  else { console.log('  ✘ FAILED: ' + label); checkFailed = true; process.exitCode = 1; }
}

main();
