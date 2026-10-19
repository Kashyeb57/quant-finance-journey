// Live stock trade stream: everything on the page that watches one symbol must
// share a single connection (Alpaca's free feed allows one), and a refusal is
// retried a couple of times before standing down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './extract.mjs';

// Loads stockStream.js with a fake WebSocket and hand-driven timers.
function load() {
  const sockets = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.closed = false; sockets.push(this); }
    close() { this.closed = true; }
    emit(obj) { this.onmessage({ data: JSON.stringify(obj) }); }
  }
  const timers = [];
  const setT = (fn, ms) => { const t = { fn, ms, done: false }; timers.push(t); return t; };
  const clearT = (t) => { if (t) t.done = true; };
  const runTimers = () => {
    for (const t of timers.splice(0)) if (!t.done) { t.done = true; t.fn(); }
  };
  const window = { location: { protocol: 'https:', host: 'example.test' } };
  const src = readFileSync(path.join(root, 'src/components/Terminal/stockStream.js'), 'utf8').replace(/^export /gm, '');
  const mod = new Function('window', 'WebSocket', 'setTimeout', 'clearTimeout',
    `${src}\nreturn { subscribeStockTrades };`)(window, FakeSocket, setT, clearT);
  return { ...mod, sockets, timers, runTimers };
}

test('two subscribers to one symbol share a single connection', () => {
  const { subscribeStockTrades, sockets } = load();
  const a = [], b = [];
  const offA = subscribeStockTrades('MU', (t) => a.push(t.price));
  const offB = subscribeStockTrades('MU', (t) => b.push(t.price));
  assert.equal(sockets.length, 1);
  sockets[0].emit({ type: 'trade', price: 908.5, time: 1 });
  assert.deepEqual(a, [908.5]);
  assert.deepEqual(b, [908.5]);
  offA();
  assert.equal(sockets[0].closed, false, 'still open while one subscriber remains');
  offB();
  assert.equal(sockets[0].closed, true, 'closed once nobody listens');
});

test('a late subscriber is told the current state', () => {
  const { subscribeStockTrades, sockets } = load();
  subscribeStockTrades('MU', () => {});
  sockets[0].emit({ type: 'ready' });
  const states = [];
  subscribeStockTrades('MU', () => {}, (s) => states.push(s));
  assert.deepEqual(states, ['ready']);
});

test('a refusal is retried twice, then reported unavailable once', () => {
  const { subscribeStockTrades, sockets, timers, runTimers } = load();
  const states = [];
  subscribeStockTrades('MU', () => {}, (s) => states.push(s));
  const refuse = (ws) => {
    ws.emit({ type: 'error', code: 406, fatal: true });
    ws.onclose({ code: 4406 }); // the Worker follows the message with a 4406 close
  };
  refuse(sockets[0]);
  assert.equal(timers.filter((t) => !t.done).length, 1, 'one retry scheduled, not two');
  runTimers();
  assert.equal(sockets.length, 2);
  refuse(sockets[1]);
  runTimers();
  assert.equal(sockets.length, 3);
  refuse(sockets[2]);
  runTimers();
  assert.equal(sockets.length, 3, 'stood down: no further connection');
  assert.deepEqual(states, ['unavailable']);
});

test('a successful connection resets the refusal budget', () => {
  const { subscribeStockTrades, sockets, runTimers } = load();
  subscribeStockTrades('MU', () => {});
  sockets[0].emit({ type: 'error', code: 406, fatal: true });
  runTimers();
  sockets[1].emit({ type: 'ready' });
  sockets[1].onclose({ code: 1006 }); // ordinary drop
  runTimers();
  assert.equal(sockets.length, 3, 'reconnects after an ordinary drop');
});

test('events from a replaced socket are ignored', () => {
  const { subscribeStockTrades, sockets, runTimers } = load();
  const got = [];
  subscribeStockTrades('MU', (t) => got.push(t.price));
  sockets[0].emit({ type: 'error', code: 406, fatal: true });
  runTimers();
  sockets[0].emit({ type: 'trade', price: 1, time: 1 });
  sockets[1].emit({ type: 'trade', price: 2, time: 2 });
  assert.deepEqual(got, [2]);
});
