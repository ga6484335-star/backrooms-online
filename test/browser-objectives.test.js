// Headless browser test for the PROGRESSION + STORY + ENDING systems:
// objective sites, exit gating, level advance, and the final cinematic.
// Requires chromium at /usr/bin/chromium (or $CHROME_PATH).
'use strict';
const { spawn } = require('child_process');
const http = require('http');

const PORT = 13095;
const CDP_PORT = 9336;
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
  console.log('PROGRESSION / ENDING BROWSER TEST\n');
  const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await sleep(1200);

  const chrome = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`, '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required',
    `http://127.0.0.1:${PORT}/?skipintro=1`,
  ], { stdio: 'pipe' });
  chrome.stderr.on('data', () => {});

  try {
    const WebSocket = require('ws');
    const ws = new WebSocket(await getWsUrl(), { maxPayload: 256 * 1024 * 1024 });
    await new Promise((res) => ws.on('open', res));
    const cdp = new CDP(ws);
    await cdp.call('Runtime.enable');
    await cdp.call('Page.enable');
    await sleep(4000);

    const errors = () => cdp.events.filter((e) =>
      e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'));

    // boot + create room, choosing LEVEL 5 so the exit advances to LEVEL 6
    await cdp.eval(`document.getElementById('name-input').value='PILOT'`);
    await cdp.eval(`document.getElementById('btn-create').click()`);
    await sleep(1200);
    const lv6option = await cdp.eval(`!!document.querySelector('#lobby-level option[value="6"]')`);
    check(lv6option === true, 'lobby offers LEVEL 6 — THE ASCENT');
    await cdp.eval(`document.getElementById('lobby-level').value='5'`);
    await cdp.eval(`document.getElementById('btn-start').click()`);
    await sleep(2600);

    const level0 = await cdp.eval(`window.__dbg.level()`);
    check(level0 === 5, `started on level 5 (got ${level0})`);

    // objective HUD
    const objVisible = await cdp.eval(`!document.getElementById('objective-panel').classList.contains('hidden')`);
    check(objVisible === true, 'objective HUD visible');
    const objTitle = await cdp.eval(`document.getElementById('objective-title').textContent`);
    check(/GUESTS|ACCOUNT/i.test(objTitle), `objective title from story: ${objTitle}`);
    const lines = await cdp.eval(`document.querySelectorAll('#objective-list .obj-line').length`);
    check(lines >= 1, `objective list populated (${lines} line(s))`);

    // three deterministic sites, all reachable
    const sites = await cdp.eval(`JSON.stringify(window.__dbg.sites())`);
    const siteArr = JSON.parse(sites);
    check(siteArr.length === 3, `level 5 has 3 objective sites`);

    // intro cinematic is showing (non-blocking), then clear it
    const cine = await cdp.eval(`window.__dbg.cinematicActive()`);
    check(cine === true, 'story intro cinematic plays on arrival');
    await cdp.eval(`window.__dbg.skipCinematic()`);

    // the cold open is a real, skippable state (exercised without running the
    // full 68s film): force it on, confirm the overlay + phase, then skip out
    await cdp.eval(`window.__dbg.startOpening()`);
    check((await cdp.eval(`window.__dbg.openingActive()`)) === true, 'cold open starts');
    check((await cdp.eval(`window.__dbg.state().gameState`)) === 'opening', 'cold open switches game state');
    check((await cdp.eval(`!document.getElementById('opening-overlay').classList.contains('hidden')`)) === true,
      'cold-open overlay visible');
    check((await cdp.eval(`window.__dbg.openingPhase()`)) === 'street', 'cold open begins on the street');
    await sleep(400);
    await cdp.eval(`window.__dbg.skipOpening()`);
    check((await cdp.eval(`window.__dbg.openingActive()`)) === false, 'cold open skips cleanly');
    check((await cdp.eval(`window.__dbg.state().gameState`)) === 'playing', 'control returns after the cold open');
    await cdp.eval(`window.__dbg.skipCinematic()`);

    // level transitions are their own state (level 5 = the lift)
    await cdp.eval(`window.__dbg.startTransition(5)`);
    check((await cdp.eval(`window.__dbg.transitionKind()`)) === 'elevator', 'level 5 transition is the lift');
    check((await cdp.eval(`window.__dbg.state().gameState`)) === 'transition', 'transition switches game state');
    await cdp.eval(`window.__dbg.skipTransition()`);
    check((await cdp.eval(`window.__dbg.state().gameState`)) === 'playing', 'control returns after the transition');
    await cdp.eval(`window.__dbg.skipCinematic()`);

    // the objective compass points at the next goal
    check((await cdp.eval(`window.__dbg.compass()`)) !== null, 'objective compass queryable');
    await cdp.eval(`window.__dbg.skipCinematic()`);

    // walk to the first site and activate it via the real interact path
    const s0 = siteArr[0];
    await cdp.eval(`window.__dbg.teleport(${s0.x}, ${s0.z})`);
    await sleep(1400); // let the chunk stream + interact detection run
    const near = await cdp.eval(`(() => { const it = window.__dbg.nearInteractable(); return it ? it.type : null; })()`);
    check(near === 'site', `near objective site after teleport (${near})`);
    const acted = await cdp.eval(`window.__dbg.interact()`);
    check(acted === 'site', `interact activated the site (${acted})`);
    let obj = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.objectives())`));
    check(obj.activated.length === 1, `objective tracked (${obj.activated.length}/3)`);
    check(obj.complete === false, 'not complete after one site');

    // ---- hidden lore cache: optional secret, deterministic, net-independent
    const cache = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.cachePos())`));
    check(!!cache && cache.key.startsWith('cache:'), `hidden cache exists (${cache.label})`);
    check(typeof cache.lore.body === 'string' && cache.lore.body.length > 0, 'cache carries a lore fragment');
    check((await cdp.eval(`window.__dbg.cacheFound()`)).length === 0, 'cache starts unfound');
    await cdp.eval(`window.__dbg.teleport(${cache.x}, ${cache.z})`);
    await sleep(1400);
    const nearCache = await cdp.eval(`(() => { const it = window.__dbg.nearInteractable(); return it ? it.type : null; })()`);
    check(nearCache === 'cache', `near hidden cache after teleport (${nearCache})`);
    const actedCache = await cdp.eval(`window.__dbg.interact()`);
    check(actedCache === 'cache', `interact opened the cache (${actedCache})`);
    check((await cdp.eval(`window.__dbg.loreOpen()`)) === true, 'lore overlay opens');
    const shown = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.loreShown())`));
    check(!!shown && shown.body.length > 0, `lore text rendered: "${String(shown.title).slice(0, 30)}"`);
    check((await cdp.eval(`window.__dbg.cacheFound()`)).length === 1, 'cache recorded as found');
    await cdp.eval(`window.__dbg.closeLore()`);
    check((await cdp.eval(`window.__dbg.loreOpen()`)) === false, 'lore overlay closes');
    check((await cdp.eval(`window.__dbg.exitUnlocked()`)) === false, 'finding a secret does not unlock the exit');
    await cdp.eval(`window.__dbg.skipCinematic()`);

    // exit must be SEALED before objectives are done
    const exit = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.exitPos())`));
    await cdp.eval(`window.__dbg.teleport(${exit.x}, ${exit.z})`);
    await sleep(1400);
    await cdp.eval(`window.__dbg.interact()`);
    check((await cdp.eval(`window.__dbg.level()`)) === 5, 'sealed exit does not advance the level');
    check((await cdp.eval(`window.__dbg.exitUnlocked()`)) === false, 'exit still locked with objectives remaining');

    // finish the objectives on the rest of the sites via the real path
    for (let i = 1; i < siteArr.length; i++) {
      await cdp.eval(`window.__dbg.teleport(${siteArr[i].x}, ${siteArr[i].z})`);
      await sleep(900);
      await cdp.eval(`window.__dbg.interact()`);
    }
    check((await cdp.eval(`window.__dbg.exitUnlocked()`)) === false,
      'exit stays sealed after the nodes — the lock remains');

    // ---- the puzzle lock: deterministic keys that seal the exit
    const pz = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.puzzlePos())`));
    const pzGoal = await cdp.eval(`window.__dbg.puzzleGoal()`);
    check(pz.length === pzGoal, `level lays out ${pzGoal} lock keys (${pz.length})`);
    check(pz.every((p) => p.key.startsWith('pz:')), 'lock keys are namespaced');
    check((await cdp.eval(`JSON.stringify(window.__dbg.objectives().puzzle)`)) === '[]', 'no keys collected yet');
    // collect all but the last via the real interact path
    for (let i = 0; i < pz.length - 1; i++) {
      await cdp.eval(`window.__dbg.teleport(${pz[i].x}, ${pz[i].z})`);
      await sleep(900);
      const nearPz = await cdp.eval(`(() => { const it = window.__dbg.nearInteractable(); return it ? it.type : null; })()`);
      check(nearPz === 'puzzle', `near lock key after teleport (${nearPz})`);
      const actedPz = await cdp.eval(`window.__dbg.interact()`);
      check(actedPz === 'puzzle', `interact turned the key (${actedPz})`);
    }
    check((await cdp.eval(`window.__dbg.exitUnlocked()`)) === false, 'exit still sealed with one key left');
    const lastKey = pz[pz.length - 1];
    await cdp.eval(`window.__dbg.teleport(${lastKey.x}, ${lastKey.z})`);
    await sleep(900);
    await cdp.eval(`window.__dbg.interact()`);
    check(JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.objectives())`)).puzzleDone === true,
      'puzzle lock reports complete');
    const unlocked = await cdp.eval(`window.__dbg.exitUnlocked()`);
    check(unlocked === true, 'exit unlocks after objectives + the lock');
    check(JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.objectives())`)).complete === true,
      'objectives report complete');

    // level 5's signature hazard is the timed blackout (no cells, just darkness)
    const hz5 = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.hazard())`));
    check(hz5.kind === 'lightsout', `level 5 signature hazard is the blackout (${hz5.kind})`);
    await cdp.eval(`window.__dbg.setElapsed(${16 - 6 + 0.4})`); // inside the active window
    await sleep(400);
    check(JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.hazard())`)).active === true,
      'blackout goes active on its schedule');
    await cdp.eval(`window.__dbg.setElapsed(0.2)`); // back to clear
    await cdp.eval(`window.__dbg.skipCinematic()`);

    // now the exit advances the party to the story's next level (6)
    await cdp.eval(`window.__dbg.teleport(${exit.x}, ${exit.z})`);
    await sleep(1200);
    await cdp.eval(`window.__dbg.interact()`);
    // an epilogue cinematic runs first, then enterLevel(6) fires; tick it
    // deterministically instead of racing setTimeout-driven skips
    check((await cdp.eval(`window.__dbg.isHost()`)) === true, 'single player is host (can use the exit)');
    await cdp.eval(`window.__dbg._tickCinematic(400, 0.2)`);
    await sleep(600);
    await cdp.eval(`window.__dbg.skipCinematic()`);
    await cdp.eval(`window.__dbg._tickCinematic(400, 0.2)`);
    await sleep(1500);
    const level6 = await cdp.eval(`window.__dbg.level()`);
    check(level6 === 6, `exit advanced to LEVEL 6 — THE ASCENT (got ${level6})`);
    const back = await cdp.eval(`Boolean(document.querySelector('#objective-title')) && document.getElementById('objective-title').textContent`);
    check(/ASCENT/i.test(String(back)), `HUD reflects the new chapter (${back})`);

    // ---- level signature hazards -----------------------------------------
    // enterLevel(6) starts level 6's own transition; clear it so the per-frame
    // hazard update runs (in a real session it ends on its own).
    await cdp.eval(`window.__dbg.skipTransition()`);
    await cdp.eval(`window.__dbg.skipCinematic()`);
    await sleep(300);
    check((await cdp.eval(`window.__dbg.state().gameState`)) === 'playing', 'control returns on level 6');

    // level 6's hazard is the cascade: timed surge cells with loot on them
    const hz6 = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.hazard())`));
    check(hz6.kind === 'surge2', `level 6 signature hazard is the cascade (${hz6.kind})`);
    const hcells = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.hazardPos())`));
    check(hcells.length >= 1, `level 6 has hazard cells (${hcells.length})`);
    const loot = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.lootPos())`));
    check(loot.length >= 1 && String(loot[0].id).startsWith('loot:'), 'hazard cells hold risk/reward loot');

    // loot is taken through the real interact path (and removed for the party)
    await cdp.eval(`window.__dbg.teleport(${loot[0].x}, ${loot[0].z})`);
    await sleep(1400);
    const nearLoot = await cdp.eval(`(() => { const it = window.__dbg.nearInteractable(); return it ? it.type : null; })()`);
    check(nearLoot === 'loot', `near hazard loot after teleport (${nearLoot})`);
    const actedLoot = await cdp.eval(`window.__dbg.interact()`);
    check(actedLoot === 'loot', `interact took the loot (${actedLoot})`);
    check((await cdp.eval(`window.__dbg.lootTakenList()`)).length >= 1, 'loot recorded as taken for the party');
    await cdp.eval(`window.__dbg.closeLore()`);
    await cdp.eval(`window.__dbg.skipCinematic()`);

    // standing in an active hazard cell steadily raises exposure. Cells can sit
    // next to props, so try each until the player actually stands inside one.
    let insideOK = false;
    for (const hcell of hcells) {
      await cdp.eval(`window.__dbg.teleport(${hcell.x}, ${hcell.z})`);
      await sleep(500);
      if ((await cdp.eval(`window.__dbg.hazard().inside`)) === true) { insideOK = true; break; }
    }
    check(insideOK === true, 'player can stand in a hazard cell');
    await cdp.eval(`window.__dbg.setElapsed(${5.6 - 2.0 + 0.2})`); // just inside the active window
    await cdp.eval(`window.__dbg.setExposure(0.15)`);
    await sleep(700);
    const hzIn = JSON.parse(await cdp.eval(`JSON.stringify(window.__dbg.hazard())`));
    check(hzIn.exposure > 0.15, `active surge raises exposure (${hzIn.exposure})`);
    await cdp.eval(`window.__dbg.setElapsed(0.2)`);
    await cdp.eval(`window.__dbg.setExposure(0)`);
    await cdp.eval(`window.__dbg.skipCinematic()`);

    // ---- the finale -------------------------------------------------------
    await cdp.eval(`window.__dbg.completeObjectives()`);
    check((await cdp.eval(`window.__dbg.exitUnlocked()`)) === true, 'level 6 objectives complete + exit unlocked');
    await cdp.eval(`window.__dbg.startEnding()`);
    await sleep(800);
    check((await cdp.eval(`window.__dbg.endingActive()`)) === true, 'ending sequence started');
    check((await cdp.eval(`window.__dbg.state().gameState`)) === 'ending', 'game state switched to ending');
    const ovVisible = await cdp.eval(`!document.getElementById('ending-overlay').classList.contains('hidden')`);
    check(ovVisible === true, 'ending overlay visible');
    // first card should be shown shortly
    await sleep(2000);
    const card = await cdp.eval(`document.getElementById('ending-card').textContent`);
    check(card && card.length > 0, `ending card renders: "${String(card).slice(0, 40)}"`);

    // fast-forward: end directly and make sure we return cleanly
    await cdp.eval(`window.__dbg.endEnding()`);
    await sleep(800);
    check((await cdp.eval(`window.__dbg.state().gameState`)) === 'menu', 'returning from the ending lands in the menu');
    check((await cdp.eval(`!document.getElementById('menu').classList.contains('hidden')`)) === true, 'menu visible after the finale');

    // no console errors throughout
    const errs = errors();
    // swiftshader WebGL warnings are expected in headless
    const real = errs.filter((e) => !/WebGL|swiftshader|GL_/i.test(JSON.stringify(e.params)));
    check(real.length === 0, `no unexpected console errors (${real.length})`);
    if (real.length) console.log(JSON.stringify(real.slice(0, 3), null, 2));
  } catch (e) {
    console.error('TEST ERROR:', e.message);
    failures++;
  } finally {
    try { chrome.kill('SIGKILL'); } catch (e) {}
    try { server.kill('SIGKILL'); } catch (e) {}
  }

  console.log(`\n${failures} FAILURES`);
  process.exit(failures ? 1 : 0);
}

main();
