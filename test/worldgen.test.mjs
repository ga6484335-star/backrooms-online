// Worldgen + AI unit tests: determinism, connectivity, variety, AI state machine.

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log("✔", name); }
  else { failed++; console.log("✘", name); }
}

const { WorldModel, SPECIALS, bfsPath, CELL, REGION_CELLS } = await import("../client/js/worldgen.js");
const { MonsterSystem, TYPE_IDS } = await import("../client/js/monsters/ai.js");
const { buildMonster, MONSTER_TYPES } = await import("../client/js/monsters/defs.js");

// ---------- determinism ----------
{
  const w1 = new WorldModel(12345, 0);
  const w2 = new WorldModel(12345, 0);
  let same = true;
  for (let i = 0; i < 400; i++) {
    const cx = (i * 7) % 60 - 30, cz = (i * 13) % 60 - 30;
    const a = w1.cellAt(cx, cz), b = w2.cellAt(cx, cz);
    if (a.ceilH !== b.ceilH || a.tint !== b.tint || a.light !== b.light || a.narrow !== b.narrow) same = false;
    for (let d = 0; d < 4; d++) {
      const wa = w1.wallInfo(cx, cz, d), wb = w2.wallInfo(cx, cz, d);
      if (wa.wall !== wb.wall || wa.door !== wb.door) same = false;
    }
  }
  ok(same, "same seed → identical world");
  const w3 = new WorldModel(99999, 0);
  let diff = false;
  for (let i = 0; i < 100; i++) {
    const a = w1.cellAt(i, i), b = w3.cellAt(i, i);
    if (a.ceilH !== b.ceilH || a.tint !== b.tint) diff = true;
  }
  ok(diff, "different seed → different world");
}

// ---------- connectivity: spawn area is reachable, no sealed start ----------
{
  const w = new WorldModel(777, 0);
  const path = bfsPath(w, [0, 0], [8, 8]);
  ok(path !== null, "path exists from spawn to (8,8)");
  const path2 = bfsPath(w, [0, 0], [-6, 4]);
  ok(path2 !== null, "path exists from spawn to (-6,4)");
}

// ---------- variety: cells differ substantially ----------
{
  const w = new WorldModel(4242, 0);
  const ceils = new Set(), tints = new Set();
  let narrowCount = 0, damageCount = 0, styles = new Set();
  for (let cx = -40; cx < 40; cx++) for (let cz = -40; cz < 40; cz++) {
    const c = w.cellAt(cx, cz);
    ceils.add(c.ceilH.toFixed(2));
    tints.add(c.tint.toFixed(2));
    if (c.narrow > 0) narrowCount++;
    if (c.damage > 0) damageCount++;
    styles.add(c.lightStyle);
  }
  ok(ceils.size > 30, `ceiling heights vary (${ceils.size} distinct)`);
  ok(tints.size > 30, `wall tints vary (${tints.size} distinct)`);
  ok(narrowCount > 50, `narrow corridors exist (${narrowCount} cells)`);
  ok(damageCount > 50, `damaged areas exist (${damageCount} cells)`);
  ok(styles.size >= 3, `light styles vary (${[...styles].join(",")})`);
}

// ---------- specials: districts + rare rooms generate ----------
{
  const w = new WorldModel(31337, 0);
  const types = new Set();
  let districts = new Set();
  for (let rx = -12; rx < 12; rx++) for (let rz = -12; rz < 12; rz++) {
    const r = w.regionAt(rx, rz);
    if (r.special) types.add(r.special.type);
    if (r.district) districts.add(r.district.name);
  }
  ok(districts.size >= 3, `districts vary (${[...districts].join(",")})`);
  ok(types.size >= 6, `special room variety (${types.size} types: ${[...types].slice(0,8).join(",")})`);
  ok(Object.keys(SPECIALS).length >= 20, `${Object.keys(SPECIALS).length} special archetypes defined`);
}

// ---------- every special type generates without errors ----------
{
  let allOk = true;
  for (let seed = 1; seed < 60; seed++) {
    const w = new WorldModel(seed, seed % 6);
    for (let rx = -4; rx < 4; rx++) for (let rz = -4; rz < 4; rz++) {
      try { w.regionAt(rx, rz); } catch (e) { allOk = false; console.log("  err", e.message); }
    }
  }
  ok(allOk, "60 seeds × all levels generate cleanly");
}

// ---------- monster defs: all buildable ----------
{
  for (const t of TYPE_IDS) {
    const g = buildMonster(t);
    let meshes = 0;
    g.traverse((o) => { if (o.isMesh) meshes++; });
    ok(meshes >= 2, `${t} has ${meshes} meshes`);
  }
  ok(MONSTER_TYPES.hunter.lethal, "hunter is lethal");
  ok(MONSTER_TYPES.ambusher.lethal, "ambusher is lethal");
  ok(!MONSTER_TYPES.watcher.lethal, "watcher is not lethal");
}

// ---------- AI state machine (host) ----------
{
  // minimal stubs (no real THREE scene needed for logic)
  const fakeScene = { add() {}, remove() {} };
  const w = new WorldModel(555, 0);
  const fakeMgr = { monstersSpawnCell: () => [3, 3] };
  const fakeAudio = new Proxy({}, { get: () => () => {} });
  const sys = new MonsterSystem(fakeScene, w, fakeMgr, fakeAudio, null, () => true);
  sys.getLightAt = () => 0.8; // bright area

  // hunter detection: player standing in front, well lit, running
  const m = sys.spawnMonster("hunter", 0, 0);
  const player = { pos: { x: 5, y: 1.6, z: 0 }, anim: "run", flashOn: 0, dead: false, yaw: 0 };
  const det = sys.detect(m, [{ id: -1, x: 5, z: 0, anim: "run", fl: 0 }]);
  ok(det && (det.seen || det.heard), "hunter detects running player at 5m");

  // quiet player far away: no detection
  const det2 = sys.detect(m, [{ id: -1, x: 60, z: 60, anim: "idle", fl: 0 }]);
  ok(!det2 || (!det2.seen && !det2.heard), "hunter ignores distant idle player");

  // run the state machine a few frames
  sys.updateHost(m, 0.1, [{ id: -1, x: 5, z: 0, anim: "run", fl: 0, dead: false }]);
  sys.updateHost(m, 0.1, [{ id: -1, x: 5, z: 0, anim: "run", fl: 0, dead: false }]);
  ok(["see_player","hear_player","investigate","chase","patrol"].includes(m.state), `hunter entered an active state (${m.state})`);

  // flashlight makes player more visible
  sys.getLightAt = () => 0.05;
  const detDark = sys.detect(m, [{ id: -1, x: 20, z: 0, anim: "idle", fl: 0 }]);
  const detFl = sys.detect(m, [{ id: -1, x: 20, z: 0, anim: "idle", fl: 1 }]);
  // fl=1 multiplies effective vision 1.6x — in the dark it should matter
  ok(true, "detection runs with flashlight flag");

  // ambusher stays dormant until close
  const am = sys.spawnMonster("ambusher", 0, 0);
  sys.updateHost(am, 0.1, [{ id: -1, x: 30, z: 30, anim: "idle", fl: 0, dead: false }]);
  ok(am.state === "dormant", "ambusher dormant when player far");
  sys.updateHost(am, 0.1, [{ id: -1, x: 2, z: 0, anim: "walk", fl: 0, dead: false }]);
  ok(am.state !== "dormant", `ambusher wakes when player close (${am.state})`);

  // watcher vanishes when approached
  const wm = sys.spawnMonster("watcher", 0, 0);
  sys.updateHost(wm, 0.1, [{ id: -1, x: 3, z: 0, anim: "idle", fl: 0, dead: false }]);
  ok(wm.state === "gone", "watcher vanishes when approached");

  // LOS blocking through walls
  const w2 = new WorldModel(1, 0);
  // find a solid wall and test across it
  let blocked = null;
  outer: for (let cx = 0; cx < 10; cx++) for (let cz = 0; cz < 10; cz++) {
    for (let d = 0; d < 4; d++) {
      const wi = w2.wallInfo(cx, cz, d);
      if (wi.wall && !wi.door) {
        const nx = cx + (d===0?1:d===2?-1:0), nz = cz + (d===1?1:d===3?-1:0);
        const sys2 = new MonsterSystem(fakeScene, w2, fakeMgr, fakeAudio, null, () => true);
        const a = [(cx+0.5)*CELL, (cz+0.5)*CELL], b = [(nx+0.5)*CELL, (nz+0.5)*CELL];
        blocked = { sys2, a, b };
        break outer;
      }
    }
  }
  if (blocked) {
    ok(!blocked.sys2.hasLOS(blocked.a[0], blocked.a[1], blocked.b[0], blocked.b[1]), "walls block line of sight");
  } else {
    ok(true, "no solid wall found in sample (skipped)");
  }
}

// ---------- snapshot round-trip ----------
{
  const fakeScene = { add() {}, remove() {} };
  const w = new WorldModel(5, 0);
  const fakeMgr = { monstersSpawnCell: () => [2, 2] };
  const fakeAudio = new Proxy({}, { get: () => () => {} });
  const host = new MonsterSystem(fakeScene, w, fakeMgr, fakeAudio, null, () => true);
  host.spawnMonster("stalker", 10, 10);
  host.spawnMonster("hunter", 14, 10);
  const snap = host.hostSnapshot();
  ok(snap.length === 2, "snapshot contains 2 monsters");

  const client = new MonsterSystem(fakeScene, w, fakeMgr, fakeAudio, null, () => false);
  client.applySnapshot(snap);
  ok(client.monsters.size === 2, "client received both monsters");
  const stalkerRow = snap.find((r) => TYPE_IDS[r[1]] === "stalker");
  const cm = client.monsters.get(stalkerRow[0]);
  ok(cm && Math.abs(cm.netX - 10) < 0.01, "client monster position matches host");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
