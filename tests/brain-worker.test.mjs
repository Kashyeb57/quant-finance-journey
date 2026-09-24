import test from 'node:test';
import assert from 'node:assert/strict';
import {handleBrain} from '../market/src/brain.mjs';
let DatabaseSync;
try { ({DatabaseSync} = await import('node:sqlite')); } catch (_) { /* Node 20 CI skips SQLite integration cases. */ }
// CI jobs that are meant to run these cases set this, so a missing node:sqlite
// fails loudly there instead of silently skipping every safeguard test.
if (!DatabaseSync && process.env.BRAIN_TESTS_REQUIRE_SQLITE === '1') {
  throw new Error('node:sqlite is required for the Brain safeguard tests (BRAIN_TESTS_REQUIRE_SQLITE=1)');
}

const SITE = 'https://joyebkashyeb.com.np';
const TOKEN = 'fixture-owner-token';
const MODEL = '1234567890abcdef';
let db, env, calls, broker;
const t = (name, fn) => test(name, {skip: !DatabaseSync}, fn);

function statement(sql, args = []) {
  return {
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({results: db.prepare(sql).all(...args)}),
    run: async () => ({meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
  };
}

const helpers = {
  json: (request, value, status=200) => new Response(JSON.stringify(value), {status}),
  ownerOk: req => req.headers.get('X-Trade-Token') === TOKEN,
  alpaca: async () => ({ok: true, data: {latestTrade: {p: broker.price ?? 600, t: broker.quoteTime ?? new Date().toISOString()}, bars: [], next_page_token: null}}),
  alpacaTrade: async (path, env, init) => {
    calls.push({path, init});
    if (path === '/clock') return {ok: true, data: {is_open: broker.open, next_close: broker.nextClose ?? null}};
    if (path === '/account') return {ok: true, data: {status: 'ACTIVE', equity: 10000, last_equity: 10000, cash: 10000, ...broker.account}};
    if (path === '/positions') return {ok: true, data: broker.qty ? [{symbol: 'MU', qty: String(broker.qty)}] : []};
    if (path.startsWith('/orders?')) return {ok: true, data: broker.openOrders || []};
    if (path.startsWith('/orders:')) return broker.lookup || {ok: false, status: 404};
    if (path === '/orders' && init?.method === 'POST') {
      if (broker.timeout) throw new Error('simulated timeout after possible submission');
      if (broker.postStatus) return {ok: false, status: broker.postStatus, error: 'broker said no'};
      broker.qty += init.body.side === 'buy' ? 1 : -1;
      return {ok: true, data: {status: 'filled', filled_qty: '1'}};
    }
    throw new Error(`Unexpected broker path: ${path}`);
  },
};

function signal(target=1) {
  // Place the mocked clock inside the five-minute submission window.
  const now = Date.now();
  const bar = Math.floor(now/900000)*900000 - 900000;
  return {bar_time: new Date(bar).toISOString(), target_position: target, symbol: 'MU', model_id: MODEL, distribution_ok: true};
}

async function call(path, body, token=TOKEN) {
  const headers = {'Content-Type': 'application/json'};
  if (token) headers['X-Trade-Token'] = token;
  const request = new Request(SITE + '/_m/brain/' + path, {method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body)});
  return handleBrain(request, env, new URL(request.url), helpers);
}

async function ready(s=signal()) {
  await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: true}, signal: s});
  assert.equal((await call('control', {enabled: true})).status, 200);
  return s;
}

test.beforeEach(context => {
  if (!DatabaseSync) return;
  context.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-09-23T18:16:00Z')});
  db = new DatabaseSync(':memory:');
  env = {NOTES_DB: {prepare: statement, batch: async statements => Promise.all(statements.map(s => s.run()))}};
  calls = []; broker = {open: true, qty: 0};
});
test.afterEach(() => { db?.close(); });

t('brain defaults to paused and rejects unauthenticated writes', async () => {
  assert.equal((await (await call('status')).json()).enabled, false);
  for (const path of ['report', 'control', 'order']) {
    assert.equal((await call(path, {}, null)).status, 401);
  }
  assert.equal(calls.length, 0);
});

t('paper execution cannot enable without a current accepted evaluation', async () => {
  assert.equal((await call('control', {enabled: true})).status, 409);
  await call('report', {mode: 'observe', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: true}});
  assert.equal((await call('control', {enabled: true})).status, 409);
});

t('a fresh signal submits only one whole-share order and repeated calls hold', async () => {
  const s = await ready();
  assert.equal((await call('order', s)).status, 200);
  assert.equal((await call('order', s)).status, 200);
  const orders = calls.filter(c => c.init?.method === 'POST');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].init.body.qty, '1');
  assert.match(orders[0].init.body.client_order_id, /^joyeb-fly-MU-/);
});

t('stale signals, arbitrary symbols, and short targets are rejected', async () => {
  const s = await ready();
  for (const value of [{...s, bar_time: '2020-01-01T00:00:00Z'}, {...s, symbol: 'TSLA'}, {...s, target_position: -1}]) {
    assert.equal((await call('order', value)).status, 400);
  }
  assert.equal(calls.length, 0);
});

t('closed market and manually held positions block orders', async () => {
  const s = await ready();
  broker.open = false;
  assert.equal((await call('order', s)).status, 409);
  broker.open = true; broker.qty = 1;
  assert.equal((await call('order', s)).status, 409);
  assert.equal(calls.filter(c => c.init?.method === 'POST').length, 0);
});

t('ambiguous timeout is retained and blocks every later candle until reconciled', async context => {
  const s = await ready(); broker.timeout = true;
  assert.equal((await call('order', s)).status, 502);
  broker.timeout = false;
  // A different, fresh candle: the unique-candle rule alone would not stop it.
  context.mock.timers.setTime(Date.now() + 900000);
  const next = await ready(signal(1));
  const res = await call('order', next);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'order_reconciliation_required');
  assert.equal(calls.filter(c => c.init?.method === 'POST').length, 1);
});

t('pause prevents any new broker request', async () => {
  const s = await ready();
  await call('control', {enabled: false});
  assert.equal((await call('order', s)).status, 409);
  assert.equal(calls.length, 0);
});

t('new model must match the published evaluation', async () => {
  const s = await ready();
  assert.equal((await call('order', {...s, model_id: 'aaaaaaaaaaaaaaaa'})).status, 409);
  assert.equal(calls.length, 0);
});

t('concurrent requests for the same candle dispatch exactly one order', async () => {
  const s = await ready();
  await Promise.all(Array.from({length: 12}, () => call('order', s)));
  assert.equal(calls.filter(c => c.init?.method === 'POST').length, 1);
  assert.equal(broker.qty, 1);
});

t('an uncertain submission reconciled as filled is never bought again', async () => {
  const s = await ready();
  broker.timeout = true;
  assert.equal((await call('order', s)).status, 502);
  broker.timeout = false;
  broker.lookup = {ok: true, data: {status: 'filled', filled_qty: '1'}};
  broker.qty = 1;
  assert.equal((await call('order', s)).status, 200);
  assert.equal(calls.filter(c => c.init?.method === 'POST').length, 1);
});

t('a partially filled canceled buy cannot cause a whole-share oversell', async () => {
  const s = await ready();
  broker.timeout = true;
  assert.equal((await call('order', s)).status, 502);
  broker.timeout = false;
  broker.lookup = {ok: true, data: {status: 'canceled', filled_qty: '0.25'}};
  broker.qty = .25;
  const exit = {...s, target_position: 0};
  await ready(exit);
  assert.equal((await call('order', exit)).status, 409);
  assert.equal(calls.filter(c => c.init?.method === 'POST').length, 1);
});

t('truthy nonboolean evaluation readiness cannot enable paper entries', async () => {
  for (const paperReady of ['false', 1, {}]) {
    const s = signal();
    await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: paperReady}, signal: s});
    assert.equal((await call('control', {enabled: true})).status, 409);
    assert.equal((await call('order', s)).status, 409);
  }
  assert.equal(calls.filter(c => c.init?.method === 'POST').length, 0);
});

t('truthy nonboolean distribution flags never permit an entry', async () => {
  for (const distributionOk of ['false', 1, {}]) {
    const s = {...signal(), distribution_ok: distributionOk};
    const report = await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: true}, signal: s});
    assert.equal(report.status, 400);
    assert.equal((await call('control', {enabled: true})).status, 409);
    assert.equal((await call('order', s)).status, 409);
  }
  assert.equal(calls.filter(c => c.init?.method === 'POST').length, 0);
});

// Seed only known filled automation orders; never adopt the broker's position
// without a matching ledger. Each case starts with a fresh in-memory database.
function seedFilledOrders(sides) {
  const insert = db.prepare('INSERT INTO brain_orders (client_id,bar_time,side,status,filled_qty,created_at) VALUES (?,?,?,\'filled\',1,?)');
  sides.forEach((side, index) => {
    const at = new Date(Date.now() - (index+2)*900000).toISOString();
    insert.run(`fixture-filled-${index}`, at, side, at);
  });
  broker.qty = sides.reduce((qty, side) => qty + (side === 'buy' ? 1 : -1), 0);
}

t('the daily entry limit blocks another buy but still permits a managed exit', async context => {
  const exit = await ready(signal(0));
  seedFilledOrders(Array.from({length: 11}, (_, index) => index % 2 ? 'sell' : 'buy'));
  assert.equal(broker.qty, 1);
  assert.equal((await call('order', exit)).status, 200);
  assert.equal(broker.qty, 0);
  context.mock.timers.setTime(Date.now() + 900000);
  const entry = await ready(signal(1));
  assert.equal((await call('order', entry)).status, 409);
  const posted = calls.filter(c => c.init?.method === 'POST');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].init.body.side, 'sell');
});

t('a failed evaluation blocks entries while allowing an existing managed position to exit', async () => {
  const exit = await ready(signal(0));
  seedFilledOrders(['buy']);
  await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: false}, signal: exit});
  assert.equal((await call('order', exit)).status, 200);
  assert.equal(broker.qty, 0);
  const posted = calls.filter(c => c.init?.method === 'POST');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].init.body.side, 'sell');
});

t('out-of-distribution inputs still allow a managed position to exit', async () => {
  const exit = {...signal(0), distribution_ok: false};
  await ready(exit);
  seedFilledOrders(['buy']);
  assert.equal((await call('order', exit)).status, 200);
  assert.equal(broker.qty, 0);
  assert.equal(calls.filter(c => c.init?.method === 'POST').length, 1);
});

t('a candle that expires during a slow quote read cannot dispatch an order', async context => {
  const s = await ready();
  const original = helpers.alpaca;
  helpers.alpaca = async (...args) => {
    // The runner keeps publishing, so only the candle's age can refuse this order.
    context.mock.timers.setTime(Date.now() + 5*60000);
    await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: true}, signal: s});
    return original(...args);
  };
  try {
    const res = await call('order', s);
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'signal_expired_during_checks');
    assert.equal(calls.filter(c => c.init?.method === 'POST').length, 0);
  } finally {
    helpers.alpaca = original;
  }
});

t('an enabled runner cannot enter after its evaluation fails or inputs leave the training range', async () => {
  const entry = await ready();
  await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: false}, signal: entry});
  assert.equal((await call('order', entry)).status, 409);
  const outside = {...entry, distribution_ok: false};
  await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: true}, signal: outside});
  assert.equal((await call('order', outside)).status, 409);
  assert.equal(calls.filter(c => c.init?.method === 'POST').length, 0);
});

t('a replacement runner report invalidates a buy already awaiting a quote', async () => {
  const entry = await ready();
  const original = helpers.alpaca;
  helpers.alpaca = async (...args) => {
    await call('report', {mode: 'observe', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: false},
      signal: {...entry, target_position: 0, distribution_ok: false}});
    return original(...args);
  };
  try {
    assert.equal((await call('order', entry)).status, 409);
    assert.equal(calls.filter(c => c.init?.method === 'POST').length, 0);
  } finally {
    helpers.alpaca = original;
  }
});

// ── Every pre-trade guard, one at a time ────────────────────────────────────
const posts = () => calls.filter(c => c.init?.method === 'POST');
const errorOf = async res => (await res.json()).error;

async function refused(s, expectedStatus, expectedError) {
  const res = await call('order', s);
  assert.equal(res.status, expectedStatus);
  if (expectedError) assert.equal(await errorOf(res), expectedError);
  assert.equal(posts().length, 0);
}

t('a signal younger than bar end plus 60 s is refused', async context => {
  context.mock.timers.setTime(Date.parse('2026-09-23T18:15:50Z'));
  await refused(await ready(), 400, 'invalid_or_stale_signal');
});

t('a bar time that is not on a 15-minute boundary is refused', async () => {
  const s = await ready();
  await refused({...s, bar_time: new Date(Date.parse(s.bar_time) + 30000).toISOString()}, 400, 'invalid_or_stale_signal');
});

t('an entry candle older than 20 minutes is refused', async context => {
  const entry = await ready();
  context.mock.timers.setTime(Date.now() + 5*60000);
  await ready(entry);
  await refused(entry, 400, 'invalid_or_stale_signal');
});

t('entries outside the 13:15-15:15 New York window are refused', async context => {
  context.mock.timers.setTime(Date.parse('2026-09-23T17:16:00Z'));
  await refused(await ready(), 409, 'outside_entry_window');
});

t('a runner that stopped publishing cannot trade', async context => {
  const s = await ready();
  context.mock.timers.setTime(Date.now() + 150000);
  await refused(s, 409, 'runner_or_evaluation_not_ready');
});

t('an observe-mode runner cannot trade even when enabled', async () => {
  const s = await ready();
  await call('report', {mode: 'observe', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: true}, signal: s});
  await refused(s, 409, 'runner_or_evaluation_not_ready');
});

t('an order that differs from the published signal is refused', async () => {
  const s = await ready();
  await refused({...s, target_position: 0}, 409, 'signal_report_mismatch');
});

t('the last 20 minutes of the session block entries', async () => {
  const s = await ready();
  broker.nextClose = new Date(Date.now() + 10*60000).toISOString();
  await refused(s, 409, 'session_ending');
});

t('a blocked or inactive account is refused', async () => {
  const s = await ready();
  for (const account of [{trading_blocked: true}, {account_blocked: true}, {status: 'ACCOUNT_CLOSED'}]) {
    broker.account = account;
    await refused(s, 409, 'account_blocked_or_daily_loss_limit');
  }
});

t('a 2% daily drawdown blocks new entries', async () => {
  const s = await ready();
  broker.account = {equity: 9790, last_equity: 10000};
  await refused(s, 409, 'account_blocked_or_daily_loss_limit');
});

t('an open MU order at the broker blocks automation', async () => {
  const s = await ready();
  broker.openOrders = [{symbol: 'MU'}];
  await refused(s, 409, 'symbol_has_open_order');
});

t('price, quote age and cash limits each block a buy', async () => {
  const s = await ready();
  const setups = [() => { broker.price = 1600; }, () => { broker.quoteTime = new Date(Date.now() - 4*60000).toISOString(); },
    () => { broker.account = {cash: 500}; }];
  for (const setup of setups) {
    broker.price = undefined; broker.quoteTime = undefined; broker.account = undefined;
    setup();
    await refused(s, 409, 'price_or_cash_limit');
  }
});

t('a pause that arrives while an order is being checked stops it', async () => {
  const s = await ready();
  const original = helpers.alpaca;
  helpers.alpaca = async (...args) => {
    await call('control', {enabled: false});
    return original(...args);
  };
  try {
    await refused(s, 409, 'automation_paused');
  } finally {
    helpers.alpaca = original;
  }
});

// ── Broker rejections and owner recovery ────────────────────────────────────
t('a definite 4xx rejection is final and a later candle can still trade', async context => {
  const s = await ready();
  broker.postStatus = 429;
  const res = await call('order', s);
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, 'order_rejected_by_broker');
  assert.equal(body.broker_status, 429);
  assert.equal(db.prepare('SELECT status FROM brain_orders').get().status, 'rejected');
  broker.postStatus = undefined;
  context.mock.timers.setTime(Date.now() + 900000);
  const next = await ready(signal(1));
  assert.equal((await call('order', next)).status, 200);
  assert.equal(posts().length, 2);
  assert.equal(broker.qty, 1);
});

t('a rejected exit does not trap the managed share', async context => {
  const exit = await ready(signal(0));
  seedFilledOrders(['buy']);
  broker.postStatus = 403;
  assert.equal((await call('order', exit)).status, 409);
  broker.postStatus = undefined;
  context.mock.timers.setTime(Date.now() + 900000);
  const later = await ready(signal(0));
  assert.equal((await call('order', later)).status, 200);
  assert.equal(broker.qty, 0);
});

t('5xx and 408 responses stay uncertain and block', async () => {
  for (const status of [503, 408]) {
    await call('status');
    db.exec('DELETE FROM brain_orders');
    calls = [];
    const s = await ready();
    broker.postStatus = status;
    assert.equal((await call('order', s)).status, 502);
    assert.equal(db.prepare('SELECT status FROM brain_orders').get().status, 'unknown');
  }
});

t('a rejected POST whose order does exist is recorded as the broker reports it', async () => {
  const s = await ready();
  broker.postStatus = 422;
  broker.lookup = {ok: true, data: {status: 'filled', filled_qty: '1'}};
  const res = await call('order', s);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'filled');
  assert.deepEqual({...db.prepare('SELECT status, filled_qty FROM brain_orders').get()}, {status: 'filled', filled_qty: 1});
});

async function stuckOrder() {
  const s = await ready(); broker.timeout = true;
  assert.equal((await call('order', s)).status, 502);
  broker.timeout = false;
  return db.prepare('SELECT client_id FROM brain_orders').get().client_id;
}

t('resolve is owner-only and validates its input', async () => {
  assert.equal((await call('resolve', {client_id: 'joyeb-fly-MU-1'}, null)).status, 401);
  assert.equal((await call('resolve', {client_id: 'joyeb-fly-MU-1'}, 'wrong')).status, 401);
  assert.equal((await call('resolve', {client_id: 'x; DROP TABLE brain_orders'})).status, 400);
  assert.equal((await call('resolve', {client_id: 'joyeb-fly-MU-1'})).status, 404);
});

t('resolve waits five minutes, then records a missing broker order as rejected', async context => {
  const id = await stuckOrder();
  const early = await call('resolve', {client_id: id});
  assert.equal(early.status, 409);
  assert.equal(await errorOf(early), 'order_too_recent');
  context.mock.timers.setTime(Date.now() + 5*60000);
  const res = await call('resolve', {client_id: id});
  assert.equal(res.status, 200);
  assert.equal((await res.json()).source, 'not_found_at_broker');
  assert.equal(db.prepare('SELECT status FROM brain_orders').get().status, 'rejected');
  const again = await call('resolve', {client_id: id});
  assert.equal(again.status, 409);
  assert.equal(await errorOf(again), 'order_already_final');
  // Automation can trade the next candle without anyone editing the ledger.
  context.mock.timers.setTime(Date.now() + 10*60000);
  assert.equal((await call('order', await ready(signal(1)))).status, 200);
});

t('resolve copies the broker state when the order exists, and fails closed on broker errors', async context => {
  const id = await stuckOrder();
  context.mock.timers.setTime(Date.now() + 5*60000);
  broker.lookup = {ok: false, status: 503};
  assert.equal((await call('resolve', {client_id: id})).status, 502);
  assert.equal(db.prepare('SELECT status FROM brain_orders').get().status, 'submitting');
  broker.lookup = {ok: true, data: {status: 'filled', filled_qty: '1'}};
  const res = await call('resolve', {client_id: id});
  assert.equal((await res.json()).source, 'broker');
  assert.deepEqual({...db.prepare('SELECT status, filled_qty FROM brain_orders').get()}, {status: 'filled', filled_qty: 1});
});

// ── Guards that a later re-check would also catch: each must refuse on its own,
// before any broker call, with its own error.
async function refusedEarly(s, expectedStatus, expectedError) {
  const res = await call('order', s);
  assert.equal(res.status, expectedStatus);
  assert.equal(await errorOf(res), expectedError);
  assert.equal(calls.length, 0);
}

t('a failed evaluation refuses an entry before any broker call', async () => {
  const s = await ready();
  await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: false}, signal: s});
  await refusedEarly(s, 409, 'runner_or_evaluation_not_ready');
});

t('inputs outside the training range refuse an entry before any broker call', async () => {
  const s = {...(await ready()), distribution_ok: false};
  await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: true}, signal: s});
  await refusedEarly(s, 409, 'signal_report_mismatch');
});

t('a signal whose model differs from the evaluation is refused', async () => {
  const other = 'fedcba0987654321';
  const s = {...signal(), model_id: other};
  await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: true}, signal: s});
  await call('control', {enabled: true});
  await refusedEarly(s, 409, 'signal_report_mismatch');
});

t('an order for a newer candle than the published signal is refused', async () => {
  const fresh = signal();
  const older = {...fresh, bar_time: new Date(Date.parse(fresh.bar_time) - 900000).toISOString()};
  await ready(older);
  await refusedEarly(fresh, 409, 'signal_report_mismatch');
});

t('a bar time off the 15-minute grid is refused even when the report agrees', async () => {
  const s = {...signal(), bar_time: new Date(Date.parse(signal().bar_time) - 30000).toISOString()};
  await ready(s);
  await refusedEarly(s, 400, 'invalid_or_stale_signal');
});

t('a paper-mode replacement report that fails the gate invalidates a buy awaiting a quote', async () => {
  const entry = await ready();
  const original = helpers.alpaca;
  helpers.alpaca = async (...args) => {
    await call('report', {mode: 'paper', evaluation: {symbol: 'MU', model_id: MODEL, paper_ready: false}, signal: entry});
    return original(...args);
  };
  try {
    const res = await call('order', entry);
    assert.equal(res.status, 409);
    assert.equal(await errorOf(res), 'signal_expired_during_checks');
    assert.equal(posts().length, 0);
  } finally {
    helpers.alpaca = original;
  }
});

// ── Second-review additions ──────────────────────────────────────────────────
t('an order for another candle claimed by a second runner mid-check is refused', async () => {
  const s = await ready();
  const original = helpers.alpaca;
  helpers.alpaca = async (...args) => {
    // Another runner claims a different candle between reconcile() and the claim.
    db.prepare("INSERT INTO brain_orders (client_id,bar_time,side,status,created_at) VALUES ('joyeb-fly-MU-1','2026-09-23T17:45:00.000Z','buy','submitting',?)")
      .run(new Date().toISOString());
    return original(...args);
  };
  try {
    await refused(s, 409, 'duplicate_pending_or_daily_limit');
  } finally {
    helpers.alpaca = original;
  }
});

t('a managed exit is allowed up to 30 minutes after its bar and refused after', async context => {
  const exit = await ready(signal(0));
  seedFilledOrders(['buy']);
  // Bar age 29 min 50 s: still allowed.
  context.mock.timers.setTime(Date.parse(exit.bar_time) + 1790000);
  await ready(exit);
  assert.equal((await call('order', exit)).status, 200);
  assert.equal(posts().length, 1);
});

t('an exit candle older than 30 minutes is refused', async context => {
  const exit = await ready(signal(0));
  seedFilledOrders(['buy']);
  context.mock.timers.setTime(Date.parse(exit.bar_time) + 1810000);
  await ready(exit);
  await refused(exit, 400, 'invalid_or_stale_signal');
});

t('a 4xx whose broker lookup also fails stays uncertain and blocks the next candle', async context => {
  for (const [postStatus, lookupStatus] of [[429, 429], [422, 503]]) {
    await call('status');
    db.exec('DELETE FROM brain_orders');
    calls = [];
    const s = await ready(signal(1));
    broker.postStatus = postStatus;
    broker.lookup = {ok: false, status: lookupStatus};
    const res = await call('order', s);
    assert.equal(res.status, 502);
    assert.equal(await errorOf(res), 'submission_uncertain_reconcile_before_retry');
    assert.equal(db.prepare('SELECT status FROM brain_orders').get().status, 'unknown');
    broker.postStatus = undefined; broker.lookup = undefined;
    context.mock.timers.setTime(Date.now() + 900000);
    const next = await ready(signal(1));
    const blocked = await call('order', next);
    assert.equal(await errorOf(blocked), 'order_reconciliation_required');
    context.mock.timers.setTime(Date.now() - 900000);
  }
});

t('a stored report for another symbol is ignored and cannot be traded on', async () => {
  const s = signal();
  // As if the SPY experiment had published before the switch.
  db.exec("CREATE TABLE IF NOT EXISTS brain_report (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, seen_at TEXT NOT NULL)");
  await call('status');
  db.prepare('INSERT OR REPLACE INTO brain_report (id,payload,seen_at) VALUES (1,?,?)')
    .run(JSON.stringify({mode: 'paper', evaluation: {symbol: 'SPY', model_id: MODEL, paper_ready: true}, signal: {...s, symbol: 'SPY'}}), new Date().toISOString());
  const status = await (await call('status')).json();
  assert.equal(status.report, null);
  assert.equal(status.online, false);
  assert.equal((await call('control', {enabled: true})).status, 409);
  assert.equal(posts().length, 0);
});

t('the limits and a buy quote above $1,500 reflect the Micron switch', async () => {
  const limits = (await (await call('status')).json()).limits;
  assert.deepEqual(limits, {symbol: 'MU', max_shares: 1, max_buy_quote: 1500, max_daily_entries: 6});
  const s = await ready();
  broker.price = 1450;
  assert.equal((await call('order', s)).status, 200);
  assert.match(posts()[0].init.body.client_order_id, /^joyeb-fly-MU-\d+$/);
  assert.equal(posts()[0].init.body.symbol, 'MU');
});
