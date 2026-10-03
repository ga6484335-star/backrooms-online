// Progression + story logic tests. Pure Node (no THREE, no DOM): verifies the
// objective planner, co-op tracker serialization, deterministic site/exit
// placement, and the authored narrative spine.
import { WorldModel } from '../client/js/worldgen.js';
import {
  OBJECTIVE_PLANS, planFor, siteGoal, siteCells, siteCenter, siteKey,
  objectiveSites, exitCellFor, ObjectiveTracker,
  CACHE_PLANS, cachePlanFor, cacheCellFor, anyCacheCellFor, cacheKey,
  loreCacheFor, loreFor, LORE, LORE_TRUTH, cacheHintFor, CACHE_HINTS,
  hazardFor, hazardCells, hazardPhase, hazardDps, lootKindFor, lootFor, HAZARDS,
  PUZZLES, puzzleFor, puzzlePlanFor, puzzleGoal, puzzleCells, puzzleSites, puzzleKey,
} from '../client/js/objectives.js';
import {
  STORY, ENDING, LEVEL_ORDER, FINAL_LEVEL, storyFor, introFor, epilogueFor,
  beatsFor, beatFor, ambientFor, levelTitle, nextStoryLevel, isFinalLevel,
  OPENING, OPENING_DURATION, openingLine, openingLines, prerollFor,
} from '../client/js/story.js';

let pass = 0, fail = 0;
function check(cond, label) {
  if (cond) { pass++; console.log('  \u2714 ' + label); }
  else { fail++; console.error('  \u2718 FAILED: ' + label); process.exitCode = 1; }
}

const LEVELS = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------
console.log('objective plans');
for (const lv of LEVELS) {
  const plan = planFor(lv);
  check(Array.isArray(plan) && plan.length >= 1, `level ${lv}: has a plan`);
  check(plan.some((o) => o.kind === 'site'), `level ${lv}: has site objectives`);
  const total = plan.filter((o) => o.kind === 'site').reduce((n, o) => n + o.count, 0);
  check(siteGoal(lv) === total, `level ${lv}: siteGoal matches plan (${total})`);
  check(plan.every((o) => o.label && o.id), `level ${lv}: every objective is labelled`);
}
check(planFor(99) === OBJECTIVE_PLANS[0], 'unknown level falls back to level 0 plan');

// ---------------------------------------------------------------------------
console.log('\ndeterministic site / exit placement');
const SEEDS = [1, 0xabcdef, 0xffffffff, 123456];
for (const lv of LEVELS) {
  const world = new WorldModel(SEEDS[0], lv);
  const cells = siteCells(world, lv);
  check(cells.length === siteGoal(lv), `level ${lv}: ${cells.length} site cells`);
  const keys = new Set(cells.map(([cx, cz]) => `${cx},${cz}`));
  check(keys.size === cells.length, `level ${lv}: site cells are unique`);
  let ordinary = true;
  for (const [cx, cz] of cells) {
    const c = world.cellAt(cx, cz);
    if (c.special || c.water) ordinary = false;
  }
  check(ordinary, `level ${lv}: sites avoid special/water cells`);

  // same seed -> identical placement (multiplayer requirement)
  const world2 = new WorldModel(SEEDS[0], lv);
  const cells2 = siteCells(world2, lv);
  check(JSON.stringify(cells) === JSON.stringify(cells2), `level ${lv}: placement is deterministic`);

  // exit is reachable: ordinary cell, not coincident with a site
  const [ex, ez] = exitCellFor(world, lv);
  const ec = world.cellAt(ex, ez);
  check(!ec.special && !ec.water, `level ${lv}: exit on an ordinary cell`);
  check(!keys.has(`${ex},${ez}`), `level ${lv}: exit distinct from every site`);

  // objectiveSites wraps cells with stable keys
  const sites = objectiveSites(world, lv);
  check(sites.length === cells.length && sites.every((s) => s.key === siteKey(lv, s.cx, s.cz)),
    `level ${lv}: objectiveSites keys are stable`);
}

// ---------------------------------------------------------------------------
console.log('\nco-op objective tracker');
{
  // level 0: 3 sites
  const t = new ObjectiveTracker(0);
  check(!t.isComplete(), 'fresh tracker is incomplete');
  check(t.progress() < 1, 'fresh tracker progress < 1');
  const siteKeys = objectiveSites(new WorldModel(7, 0), 0).map((s) => s.key);
  check(siteKeys.length === 3, 'level 0 has 3 sites');
  check(t.activateSite(siteKeys[0]) === 0, 'first activation reveals beat 0');
  check(t.activateSite(siteKeys[0]) === -1, 're-activating a site is a no-op');
  check(t.activateSite(siteKeys[1]) === 1, 'second activation reveals beat 1');
  check(!t.isComplete(), 'still incomplete with 2/3 sites');
  t.activateSite(siteKeys[2]);
  check(!t.isComplete(), 'sites alone do not complete the level — the lock still seals it');
  check(t.puzzleGoalN() === puzzleGoal(0), 'puzzle goal matches the level plan');

  // the lock is its own step: collect every key
  const pzKeys = puzzleSites(new WorldModel(7, 0), 0).map((p) => p.key);
  check(pzKeys.length === puzzleGoal(0), `level 0 lays out ${puzzleGoal(0)} lock keys`);
  check(t.collectPuzzle(pzKeys[0]) === true, 'first puzzle key collects');
  check(t.collectPuzzle(pzKeys[0]) === false, 're-collecting a puzzle key is a no-op');
  for (const k of pzKeys.slice(1)) t.collectPuzzle(k);
  check(t.puzzleDone(), 'puzzle lock complete after all keys');
  check(t.isComplete(), 'complete after all sites + the lock');

  // snapshot/apply roundtrip (relayed to peers)
  const snap = t.snapshot();
  const t2 = new ObjectiveTracker(0);
  t2.apply(snap);
  check(t2.isComplete(), 'snapshot restores completion on a peer');
  check(JSON.stringify(t2.snapshot().site.sort()) === JSON.stringify(t.snapshot().site.sort()),
    'snapshot site set round-trips');
}

// ---------------------------------------------------------------------------
console.log('\nsurvive objective (level 6)');
{
  const t = new ObjectiveTracker(FINAL_LEVEL);
  const w6 = new WorldModel(9, FINAL_LEVEL);
  const siteKeys = objectiveSites(w6, FINAL_LEVEL).map((s) => s.key);
  const pzKeys = puzzleSites(w6, FINAL_LEVEL).map((p) => p.key);
  // survive must NOT tick until every site objective is done
  t.update(10);
  check(t.holdT === 0, 'hold does not tick before sites are done');
  for (const k of siteKeys) t.activateSite(k);
  check(!t.isComplete(), 'level 6 still incomplete with sites done but hold not elapsed');
  for (let i = 0; i < 200; i++) t.update(0.5); // 100s > 75s requirement
  check(t.holdT >= 75, `hold accumulated (${t.holdT.toFixed(1)}s)`);
  check(!t.isComplete(), 'hold alone still does not complete — the lock remains');
  for (const k of pzKeys) t.collectPuzzle(k);
  check(t.isComplete(), 'level 6 complete once sites + hold + lock are satisfied');
  const t2 = new ObjectiveTracker(FINAL_LEVEL);
  for (const k of siteKeys) t2.activateSite(k);
  check(!t2.isComplete(), 'level 6 incomplete before the hold elapses');
  for (let i = 0; i < 200; i++) t2.update(0.5); // 100s > 75s requirement
  check(t2.holdT >= 75, `hold accumulated (${t2.holdT.toFixed(1)}s)`);
  for (const k of pzKeys) t2.collectPuzzle(k);
  check(t2.isComplete(), 'level 6 complete after holding + the lock');
  const lines = t2.hudLines();
  check(lines.length === planFor(FINAL_LEVEL).length + 1, 'HUD lines cover every objective plus the lock');
}

// ---------------------------------------------------------------------------
console.log('\nstory spine');
for (const lv of LEVELS) {
  check(STORY[lv], `story exists for level ${lv}`);
  check(introFor(lv).length >= 1, `level ${lv}: has an intro`);
  check(beatsFor(lv).length >= 1, `level ${lv}: has story beats`);
  check(epilogueFor(lv).length >= 1, `level ${lv}: has an epilogue`);
  check(ambientFor(lv, 0).length > 0, `level ${lv}: has ambient lines`);
  check(levelTitle(lv).length > 0, `level ${lv}: has a title`);
  check(typeof beatFor(lv, 99) === 'string', `level ${lv}: beatFor wraps safely`);
}
check(nextStoryLevel(0) === 1, 'story chains 0 -> 1');
check(nextStoryLevel(5) === 6, 'story chains 5 -> 6');
check(nextStoryLevel(FINAL_LEVEL) === null, 'story ends after the final level');
check(isFinalLevel(FINAL_LEVEL) && !isFinalLevel(0), 'isFinalLevel is correct');
check(LEVEL_ORDER[LEVEL_ORDER.length - 1] === FINAL_LEVEL, 'LEVEL_ORDER ends at the finale');
check(storyFor(999) === STORY[0], 'storyFor falls back to level 0');

// ---------------------------------------------------------------------------
console.log('\nopening script');
check(OPENING.phases.length >= 8, 'opening has all its shots');
check(OPENING.phases.every((p) => p.key && p.dur > 0), 'every opening phase has a key + duration');
check(OPENING.phases.every((p) => p.shot), 'every opening phase names a camera shot');
check(OPENING.phases.every((p) => (p.lines || []).length >= 1), 'every opening phase has dialogue');
// normalise: opening lines may be strings or {text, voice}
const norm = (p) => (p.lines || []).map((l) => (typeof l === 'string' ? { text: l, voice: 'default' } : l));
check(OPENING_DURATION > 60 && OPENING_DURATION < 140, `opening is feature-length-ish (${OPENING_DURATION}s)`);
check(OPENING.phases.some((p) => p.key === 'street'), 'opening begins on the ordinary street');
check(OPENING.phases.some((p) => p.key === 'tear'), 'opening includes the reality tear');
check(OPENING.phases.some((p) => p.key === 'fall'), 'opening includes the fall');
check(OPENING.phases.some((p) => p.key === 'land'), 'opening lands in the Backrooms');
check(OPENING.phases.some((p) => p.key === 'wake'), 'opening wakes the player');
// the twist: the falling has a rhythm — it is a recording being played back
check(norm(OPENING.phases.find((p) => p.key === 'fall')).some((l) => /PLAYED BACK/i.test(l.text)),
  'opening plants the "played back" reveal');
check(OPENING.phases.some((p) => p.key === 'stare'), 'opening includes the figure / observer beat');
// the voice: every opening line carries a mood the VoiceEngine understands
const MOODS = ['default', 'calm', 'tired', 'uneasy', 'dread', 'whisper', 'radio', 'machine'];
let moodsOK = true;
for (const p of OPENING.phases) for (const l of norm(p)) if (!MOODS.includes(l.voice)) moodsOK = false;
check(moodsOK, 'every opening line has a known voice mood');
check(openingLines(OPENING.phases[0]).every((l) => l.text && l.voice), 'openingLines normalises to {text,voice}');
check(typeof openingLine('PLAIN') === 'object' && openingLine('PLAIN').text === 'PLAIN', 'openingLine accepts plain strings');
// every preroll chapter has voiced lines too
for (const lv of LEVELS) {
  const pre = prerollFor(lv);
  check(pre.kind && pre.card, `preroll ${lv}: has a kind + card`);
  check((pre.lines || []).length >= 1, `preroll ${lv}: has lines`);
}

console.log('\nending script');
check(ENDING.stages.length >= 6, 'ending has multiple stages');
let ordered = true;
for (let i = 1; i < ENDING.stages.length; i++) if (ENDING.stages[i].at < ENDING.stages[i - 1].at) ordered = false;
check(ordered, 'ending stages are time-ordered');
check(ENDING.stages.every((s) => s.key && s.card), 'every ending stage has a key + card');
// the twist must be present and land after the false-safety beat
const keys = ENDING.stages.map((s) => s.key);
check(keys.includes('reveal'), 'ending includes the reveal');
check(keys.indexOf('reveal') > keys.indexOf('others') || keys.indexOf('reveal') > keys.indexOf('horizon'),
  'the reveal lands after the "safe" beat');
check(ENDING.tail.length >= 1, 'ending has tail lines');
// the twist (the REC light surviving) must be signposted
check(ENDING.stages.some((s) => /REC/i.test(s.card)), 'ending signposts the surviving REC light');

// ---------------------------------------------------------------------------
console.log('\nhidden lore caches');
{
  for (const lv of LEVELS) {
    const plan = cachePlanFor(lv);
    check(!!plan && typeof plan.label === 'string' && plan.label.length > 0, `level ${lv}: cache has a label`);
    const lore = loreFor(lv);
    check(!!lore && !!lore.title && !!lore.body, `level ${lv}: lore has a title + body`);
    const hint = cacheHintFor(lv);
    check(typeof hint === 'string' && hint.length > 0, `level ${lv}: cache has a hint`);
    check(lore !== loreFor((lv + 1) % 7) || lv === 6, `level ${lv}: lore is level-specific`);
  }
  check(Object.keys(LORE).length === 7, 'one distinct lore fragment per level');
  check(typeof LORE_TRUTH === 'string' && LORE_TRUTH.length > 20, 'a shared truth fragment exists');
  check(Object.keys(CACHE_HINTS).length === 7, 'one hint per level');

  // deterministic placement per (seed, level); seed-dependent across seeds
  for (const lv of LEVELS) {
    const w1 = new WorldModel(1234, lv);
    const c1 = loreCacheFor(w1, lv);
    const c2 = loreCacheFor(new WorldModel(1234, lv), lv);
    check(c1.key === c2.key && c1.cx === c2.cx && c1.cz === c2.cz,
      `level ${lv}: cache placement is deterministic`);
    check(c1.key === cacheKey(lv, c1.cx, c1.cz), `level ${lv}: cache key matches its cell`);
    // the memo must not leak across seeds
    const c3 = loreCacheFor(new WorldModel(9876, lv), lv);
    check(c3.key.startsWith(`cache:${lv}:`), `level ${lv}: cache key is level-namespaced`);
  }
  // at least one seed/level should differ across seeds (sanity: not constant)
  let differs = false;
  for (const lv of LEVELS) {
    if (loreCacheFor(new WorldModel(1, lv), lv).key !== loreCacheFor(new WorldModel(2, lv), lv).key) differs = true;
  }
  check(differs, 'cache placement varies with the world seed');

  // the cache should sit inside a real special room when one exists
  const w = new WorldModel(555, 0);
  const c = loreCacheFor(w, 0);
  if (c.room) check(!!w.specialAt(c.cx, c.cz), `cache sits inside its generated special room (${c.room})`);
  else check(true, 'cache fell back to a highway cell (no planned room in range)');
}

// ---------------------------------------------------------------------------
console.log('\nlevel signature hazards');
for (const lv of LEVELS) {
  const h = hazardFor(lv);
  check(!!h && typeof h.kind === 'string', `level ${lv}: hazard has a kind`);
  if (h.kind !== 'none') {
    check(typeof h.label === 'string' && h.label.length > 0, `level ${lv}: hazard is labelled (${h.label})`);
    check(h.period > 0 && h.onFor > 0 && h.warn > 0, `level ${lv}: hazard has warn/active windows`);
    check(hazardDps(lv) >= 0, `level ${lv}: hazard dps is non-negative`);
  }
}
check(hazardFor(99).kind === 'none', 'unknown level has no hazard');

for (const lv of LEVELS) {
  const w = new WorldModel(2468, lv);
  const a = hazardCells(w, lv);
  const b = hazardCells(new WorldModel(2468, lv), lv);
  check(JSON.stringify(a) === JSON.stringify(b), `level ${lv}: hazard cells are deterministic`);
  const h = hazardFor(lv);
  if (h.kind !== 'none' && h.radius > 0) {
    check(a.length >= 1, `level ${lv}: hazard has active cells`);
    // never on top of an objective, the exit, or the cache
    const reserved = new Set();
    for (const s of objectiveSites(w, lv)) reserved.add(`${s.cx},${s.cz}`);
    const [ecx, ecz] = exitCellFor(w, lv);
    reserved.add(`${ecx},${ecz}`);
    const cc = loreCacheFor(w, lv);
    reserved.add(`${cc.cx},${cc.cz}`);
    check(a.every(([cx, cz]) => !reserved.has(`${cx},${cz}`)), `level ${lv}: hazard never blocks objectives/exit/cache`);
    check(a.every(([cx, cz]) => { const cell = w.cellAt(cx, cz); return !cell.special && !cell.water; }),
      `level ${lv}: hazard cells are ordinary, dry cells`);
  } else if (h.kind === 'none') {
    check(a.length === 0, `level ${lv}: no hazard cells on a hazard-free level`);
  }
}

// hazard windows are a pure function of the shared clock
{
  const w = new WorldModel(7, 1);
  const p0 = hazardPhase(w, 1, 0);
  check(p0.label === hazardFor(1).label, 'hazard phase carries the level label');
  let sawActive = false, sawWarn = false;
  for (let t = 0; t < hazardFor(1).period * 3; t += 0.1) {
    const p = hazardPhase(w, 1, t);
    if (p.active) sawActive = true;
    if (p.warn) sawWarn = true;
  }
  check(sawActive && sawWarn, 'hazard cycles through warn and active windows');
  check(hazardPhase(w, 1, 1e9).label === hazardFor(1).label, 'hazard phase is stable at large t');
  const t2 = hazardFor(1).period * 100 + 0.05;
  check(JSON.stringify(hazardPhase(w, 1, t2)) === JSON.stringify(hazardPhase(w, 1, t2)), 'hazard phase is pure');
}

console.log('\nhazard loot (risk / reward)');
{
  const kinds = new Set();
  for (const lv of LEVELS) {
    for (let cx = -8; cx <= 8; cx += 3) {
      for (let cz = -8; cz <= 8; cz += 3) {
        const k = lootKindFor(lv, cx, cz);
        kinds.add(k);
        check(lootKindFor(lv, cx, cz) === k, `level ${lv}: loot kind is deterministic at ${cx},${cz}`);
        const l = lootFor(k);
        check(!!l.label && !!l.body && !!l.effect, `level ${lv}: loot ${k} has label/body/effect`);
      }
    }
  }
  check(kinds.has('battery') && kinds.has('recorder'), 'loot pool includes both batteries and recorders');
  check(lootFor('nope') === lootFor('battery'), 'unknown loot falls back to battery');
}

// ---------------------------------------------------------------------------
console.log('\npuzzle lock placement');
for (const lv of LEVELS) {
  const w = new WorldModel(2468, lv);
  const a = puzzleCells(w, lv);
  const b = puzzleCells(new WorldModel(2468, lv), lv);
  check(JSON.stringify(a) === JSON.stringify(b), `level ${lv}: puzzle cells are deterministic`);
  check(a.length === puzzleGoal(lv), `level ${lv}: lays out exactly ${puzzleGoal(lv)} lock keys`);
  check(puzzlePlanFor(lv).label && typeof puzzlePlanFor(lv).label === 'string', `level ${lv}: lock is labelled`);
  // never on top of an objective site or the exit (nothing to find there)
  const reserved = new Set();
  for (const s of objectiveSites(w, lv)) reserved.add(`${s.cx},${s.cz}`);
  const [ecx, ecz] = exitCellFor(w, lv);
  reserved.add(`${ecx},${ecz}`);
  check(a.every(([cx, cz]) => !reserved.has(`${cx},${cz}`)), `level ${lv}: lock never collides with objectives/exit`);
  check(a.every(([cx, cz]) => { const cell = w.cellAt(cx, cz); return !cell.special && !cell.water; }),
    `level ${lv}: lock keys sit on ordinary, dry cells`);
  // the resolver namespaces keys so an old chapter cannot satisfy this one
  const t = new ObjectiveTracker(lv);
  check(t.collectPuzzle('pz:999:0,0') === false, `level ${lv}: foreign puzzle key is rejected`);
  check(t.collectPuzzle(a[0] ? puzzleKey(lv, a[0][0], a[0][1]) : `pz:${lv}:0,0`) === true, `level ${lv}: own key is accepted`);
}
check(puzzleFor(99) === PUZZLES[0], 'unknown level falls back to the level 0 lock');
check(puzzleSites(new WorldModel(4, 3), 3).every((p) => p.x === (p.cx + 0.5) * 4), 'puzzle sites expose world coords');

console.log(`\n${pass} passed, ${fail} failed`);
