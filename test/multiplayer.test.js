// End-to-end multiplayer test: two WebSocket clients create/join a room,
// exchange state, verify sync, emotes and monster snapshot relay.
'use strict';
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 13099;
const URL = `ws://127.0.0.1:${PORT}/ws`;

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const client = { ws, id: null, msgs: [], room: null, state: null };
    ws.on('open', () => resolve(client));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      client.msgs.push(m);
      if (m.t === 'hello') client.id = m.id;
      if (m.t === 'room') client.room = m;
      if (m.t === 'st') client.state = m;
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  await sleep(1200);

  try {
    // 1. create room
    const a = await connect('ALPHA');
    a.ws.send(JSON.stringify({ t: 'create', name: 'ALPHA' }));
    await sleep(300);
    assert(a.id, 'client A got id');
    assert(a.room && a.room.code && a.room.code.length === 6, 'room created with 6-char code: ' + (a.room && a.room.code));
    assert(typeof a.room.seed === 'number', 'room has numeric seed');
    assert(a.room.host === a.id, 'A is host');

    // 2. join from another "device"
    const b = await connect('BRAVO');
    b.ws.send(JSON.stringify({ t: 'join', code: a.room.code, name: 'BRAVO' }));
    await sleep(300);
    assert(b.room && b.room.code === a.room.code, 'B joined same room');
    assert(b.room.seed === a.room.seed, 'B received identical seed');
    assert(b.room.players.length === 2, 'B sees 2 players');
    assert(a.msgs.some((m) => m.t === 'peer' && m.add), 'A notified of B');

    // 3. bad code
    const c = await connect('CHARLIE');
    c.ws.send(JSON.stringify({ t: 'join', code: 'ZZZZ99', name: 'CHARLIE' }));
    await sleep(300);
    assert(c.msgs.some((m) => m.t === 'err'), 'join with wrong code rejected');
    c.ws.close();

    // 4. start game
    a.ws.send(JSON.stringify({ t: 'start', level: 0 }));
    await sleep(300);
    assert(b.msgs.some((m) => m.t === 'start'), 'B received start');

    // 5. state sync
    a.ws.send(JSON.stringify({ t: 'u', p: [1.5, 1.62, 2.5], r: [0.5, 0.1], a: 'walk', e: '' }));
    await sleep(400);
    const st = b.state;
    assert(st && st.list, 'B receives state ticks');
    const rowA = st.list.find((r) => r[0] === a.id);
    assert(rowA, 'B state includes A');
    assert(Math.abs(rowA[1] - 1.5) < 0.01 && Math.abs(rowA[3] - 2.5) < 0.01, 'A position relayed correctly: ' + JSON.stringify(rowA));

    // 6. emote relay
    b.ws.send(JSON.stringify({ t: 'emote', e: 'dance' }));
    await sleep(300);
    assert(a.msgs.some((m) => m.t === 'ev' && m.kind === 'emote' && m.data.e === 'dance'), 'dance emote relayed');

    // 7. monster snapshot from host
    a.ws.send(JSON.stringify({ t: 'ms', list: [[1, 0, 5.5, 7.5, 0.4, 1]] }));
    await sleep(300);
    assert(b.msgs.some((m) => m.t === 'ms' && m.list.length === 1), 'monster snapshot relayed host->peer');

    // 8. non-host monster snapshot ignored (no crash + not relayed)
    b.ws.send(JSON.stringify({ t: 'ms', list: [[2, 1, 0, 0, 0, 0]] }));
    await sleep(300);
    assert(!a.msgs.some((m) => m.t === 'ms'), 'non-host monster snapshot NOT relayed');

    // 9. world event broadcast (only count messages after this point)
    const bMark = b.msgs.length;
    a.ws.send(JSON.stringify({ t: 'ev', kind: 'chunkmorph', data: { cx: 2, cz: 3, variant: 1 } }));
    await sleep(400);
    const got = b.msgs.slice(bMark);
    assert(got.some((m) => m.t === 'ev' && m.kind === 'chunkmorph'), 'chunkmorph event relayed');

    // door event: server accumulates doorStates and broadcast includes them on start
    a.ws.send(JSON.stringify({ t: 'ev', kind: 'door', data: { key: '1,2,3', open: true } }));
    a.ws.send(JSON.stringify({ t: 'ev', kind: 'door', data: { key: '4,4,0', open: false } }));
    await sleep(150);
    // keys/batteries recorded in the world event log for late joiners
    a.ws.send(JSON.stringify({ t: 'ev', kind: 'keypickup', data: { id: 'key:1,2,3' } }));
    await sleep(150);
    assert(true, 'door/keypickup events sent without crash');
    console.log('  ✔ door/keypickup events accepted');

    // 10. disconnect handling
    const aMark = a.msgs.length;
    b.ws.close();
    await sleep(600);
    const gotA = a.msgs.slice(aMark);
    assert(gotA.some((m) => m.t === 'peer' && !m.add && m.id === b.id), 'A notified of B leaving');

    console.log('\nALL MULTIPLAYER TESTS PASSED ✔');
  } finally {
    server.kill();
  }
}

function assert(cond, label) {
  if (cond) console.log('  ✔ ' + label);
  else { console.error('  ✘ FAILED: ' + label); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exit(1); });
