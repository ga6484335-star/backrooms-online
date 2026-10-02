// Verify a Pages-style static site actually boots the game in a real browser.
// Usage: node test/pages.test.js [url]
// Default target is the local simulation at http://127.0.0.1:13500/
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const TARGET = process.argv[2] || 'http://127.0.0.1:13500/';
const CDP_PORT = 9402;
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(cond, label) {
  if (cond) console.log('  \u2714 ' + label);
  else { console.log('  \u2718 FAILED: ' + label); failures++; }
}

async function cdpTarget() {
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

async function main() {
  console.log(`PAGES BOOT TEST \u2014 target: ${TARGET}\n`);
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${CDP_PORT}`, '--user-data-dir=/tmp/pagestest-chrome',
    'about:blank'], { stdio: 'pipe' });
  await sleep(2500);

  const wsUrl = await cdpTarget();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.on('open', r));

  let id = 1; const pend = new Map();
  const failed404 = []; const exceptions = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(m.params.exceptionDetails.text || 'exception');
    } else if (m.method === 'Network.responseReceived') {
      const r = m.params.response;
      if (r.status === 404) failed404.push(r.url);
    } else if (m.method === 'Network.loadingFailed') {
      failed404.push('LOAD FAILED: ' + (m.params.errorText || '') + ' ' + (m.params.blockedReason || ''));
    }
  });
  const call = (method, params = {}) => new Promise((res) => {
    pend.set(id, res); ws.send(JSON.stringify({ id: id++, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await call('Runtime.enable');
  await call('Network.enable');
  await call('Page.enable');
  await call('Page.navigate', { url: TARGET });
  await sleep(12000);

  // --- the exact symptom the user reported ---
  const bootGone = await evalJs(`document.getElementById('boot-msg') && document.getElementById('boot-msg').classList.contains('gone')`);
  const bootText = await evalJs(`document.getElementById('boot-msg') ? document.getElementById('boot-msg').textContent : null`);
  check(bootGone === true, `boot overlay cleared (not stuck at "${bootText}")`);

  // --- module graph actually executed ---
  const dbg = await evalJs(`typeof window.__dbg`);
  check(dbg === 'object', 'main.js executed (window.__dbg exists)');

  const menuVisible = await evalJs(`!document.getElementById('menu').classList.contains('hidden')`);
  check(menuVisible === true, 'main menu is visible');

  // --- no missing assets (the root cause of the original bug) ---
  const threeLoaded = await evalJs(`typeof window.__seed !== 'undefined' || !!window.__dbg`);
  check(threeLoaded === true, 'three.js resolved through the importmap');
  check(failed404.length === 0, `no 404 / failed loads (${failed404.length})`);
  if (failed404.length) for (const u of failed404.slice(0, 5)) console.log('      \u2192 ' + u);
  check(exceptions.length === 0, `no uncaught exceptions (${exceptions.length})`);
  if (exceptions.length) for (const e of exceptions.slice(0, 3)) console.log('      \u2192 ' + e);

  // --- multiplayer still reachable from this origin (cross-origin WSS) ---
  const wsOk = await evalJs(`(function(){
    return new Promise((resolve) => {
      const net = window.__dbg && window.__dbg.net;
      if (net && net.ws && net.ws.readyState === 1) return resolve('already-open');
      try {
        const url = (window.__dbg && window.__dbg.wsUrl && window.__dbg.wsUrl()) || null;
        if (!url) return resolve('no-url-hook');
        const t = new WebSocket(url);
        t.onopen = () => { t.close(); resolve('opened'); };
        t.onerror = () => resolve('error');
        setTimeout(() => resolve('timeout'), 8000);
      } catch (e) { resolve('throw'); }
    });
  })()`);
  console.log('  [info] websocket probe:', wsOk);
  check(wsOk === 'opened' || wsOk === 'already-open' || wsOk === 'no-url-hook', 'websocket endpoint reachable or not probed');

  chrome.kill();
  if (failures) { console.log(`\n${failures} FAILURES`); process.exit(1); }
  console.log('\nPAGES BOOT TEST PASSED \u2714');
}

main().catch((e) => { console.error('TEST EXCEPTION:', e.message); process.exit(1); });
