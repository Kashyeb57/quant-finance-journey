// The market Worker's safety rails, run against the real market/src/worker.js
// with a mocked network. Test tokens only: never the owner's real TRADE_TOKEN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { root } from './extract.mjs';

// Copied to .mjs so Node 20 (no ESM detection for .js) can import it.
const dir = mkdtempSync(path.join(os.tmpdir(), 'market-worker-'));
const file = path.join(dir, 'worker.mjs');
copyFileSync(path.join(root, 'market/src/brain.mjs'), path.join(dir, 'brain.mjs'));
copyFileSync(path.join(root, 'market/src/worker.js'), file);

const cache = new Map();
globalThis.caches = { default: {
  match: async (req) => (cache.has(req.url) ? new Response(cache.get(req.url)) : undefined),
  put: async (req, res) => { cache.set(req.url, await res.text()); },
} };
let upstream = null;
let calls = [];
globalThis.fetch = async (href, init) => {
  calls.push(String(href));
  if (!upstream) throw new Error(`unexpected upstream call: ${href}`);
  const u = upstream(String(href), init);
  const res = new Response(u.body, { status: u.status || 200, headers: u.headers || {} });
  Object.defineProperty(res, 'url', { value: u.url || String(href) });
  return res;
};
const worker = (await import(pathToFileURL(file).href)).default;

const SITE = 'https://joyebkashyeb.com.np';
const TOKEN = 'test-token-not-the-real-one';
const ENV = { ALPACA_KEY_ID: 'PKTESTKEYID000000000', ALPACA_SECRET_KEY: 'test-secret-value-1234567890', TRADE_TOKEN: TOKEN };

function call(pathname, { method = 'GET', body, token, headers = {}, env = ENV } = {}) {
  const h = { Origin: SITE, ...headers };
  if (token) h['X-Trade-Token'] = token;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const req = new Request(`${SITE}${pathname}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return worker.fetch(req, env, { waitUntil: () => {} });
}

test.beforeEach(() => { upstream = null; calls = []; cache.clear(); });

// ── Owner-only writes ────────────────────────────────────────────────────────
for (const [route, body] of [['/_m/order', { symbol: 'AAPL', side: 'buy', qty: 1 }], ['/_m/cancel', { id: 'x' }], ['/_m/notes', { symbol: 'AAPL', thesis: 'x' }]]) {
  test(`POST ${route} without the passphrase is refused before any upstream call`, async () => {
    for (const token of [undefined, 'wrong', `${TOKEN}x`]) {
      const res = await call(route, { method: 'POST', body, token });
      assert.equal(res.status, 401, `token=${token}`);
    }
    assert.deepEqual(calls, []);
  });
  test(`POST ${route} is refused when no TRADE_TOKEN secret is configured`, async () => {
    const res = await call(route, { method: 'POST', body, token: TOKEN, env: { ...ENV, TRADE_TOKEN: undefined } });
    assert.equal(res.status, 401);
    assert.deepEqual(calls, []);
  });
}

// ── Credentials never leave the Worker ───────────────────────────────────────
test('an upstream error that echoes the credentials is redacted', async () => {
  upstream = () => ({ status: 403, body: `forbidden for key ${ENV.ALPACA_KEY_ID} / ${ENV.ALPACA_SECRET_KEY}` });
  const res = await call('/_m/bars?symbol=AAPL&tf=1Day');
  const text = await res.text();
  assert.equal(res.status, 403);
  assert.ok(!text.includes(ENV.ALPACA_KEY_ID) && !text.includes(ENV.ALPACA_SECRET_KEY), text);
  assert.ok(text.includes('[redacted]'), text);
});

test('the WebSocket stream refuses a foreign Origin', async () => {
  const res = await call('/_m/stream?symbol=AAPL', { headers: { Upgrade: 'websocket', Origin: 'https://evil.example.com' } });
  assert.equal(res.status, 403);
  assert.deepEqual(calls, []);
});

test('CORS never echoes a foreign Origin', async () => {
  const res = await call('/_m/health', { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
});

// ── News feed fetcher is not an open proxy ───────────────────────────────────
const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><item><title>x</title></item></channel></rss>';
const rss = (feed) => call(`/_m/rss?url=${encodeURIComponent(feed)}`);

test('an allowed feed is fetched, cache-buster stripped, and cached', async () => {
  upstream = () => ({ body: RSS });
  const first = await rss('https://feeds.bbci.co.uk/news/business/rss.xml?_=123');
  assert.equal(first.status, 200);
  assert.match(await first.text(), /<rss/);
  assert.deepEqual(calls, ['https://feeds.bbci.co.uk/news/business/rss.xml']);
});

test('feeds outside the allowlist are refused without a request', async () => {
  upstream = () => ({ body: RSS });
  for (const feed of [
    'https://evil.example.com/rss', 'http://feeds.bbci.co.uk/news/business/rss.xml',
    'https://feeds.bbci.co.uk.evil.com/rss', 'https://user:pw@feeds.bbci.co.uk/rss',
    'https://feeds.bbci.co.uk:8443/rss', 'https://169.254.169.254/latest', 'not a url',
  ]) {
    assert.equal((await rss(feed)).status, 400, feed);
  }
  assert.deepEqual(calls, []);
});

test('a redirect off the allowlist, a non-feed page, or an oversized body is refused', async () => {
  upstream = () => ({ body: RSS, url: 'https://evil.example.com/rss' });
  assert.equal((await rss('https://www.wired.com/feed/rss')).status, 502);
  upstream = () => ({ body: '<!doctype html><html><body>sign in</body></html>' });
  assert.equal((await rss('https://www.ft.com/markets?format=rss')).status, 502);
  upstream = () => ({ body: RSS, headers: { 'Content-Length': String(10 * 1024 * 1024) } });
  assert.equal((await rss('https://www.benzinga.com/feed')).status, 502);
});

test('every Terminal news feed host is on the Worker allowlist', async () => {
  const { readFileSync } = await import('node:fs');
  const news = readFileSync(path.join(root, 'src/components/Terminal/News.jsx'), 'utf8');
  const urls = [...news.matchAll(/url: '(https:\/\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(urls.length > 10, 'feed list not found in News.jsx');
  upstream = () => ({ body: RSS });
  for (const u of urls) {
    const res = await rss(u);
    assert.equal(res.status, 200, `${new URL(u).hostname} is missing from RSS_HOSTS in market/src/worker.js`);
  }
});

// ── Position notes (needs node:sqlite, Node 22.5+) ───────────────────────────
let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* older Node */ }

test('position notes: owner saves, public reads, blank deletes', { skip: !DatabaseSync && 'node:sqlite unavailable on this Node' }, async () => {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args),
  });
  const env = { ...ENV, NOTES_DB: { prepare: (sql) => stmt(sql) } };
  const post = (body, token = TOKEN) => call('/_m/notes', { method: 'POST', body, token, env });

  assert.equal((await post({ symbol: 'AVGO', thesis: 'x' }, 'wrong')).status, 401);
  let res = await post({ symbol: 'avgo', thesis: '  Networking demand.  ', horizon: '6-12 months', risk: '', review: '' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).note.thesis, 'Networking demand.');
  assert.equal((await post({ symbol: 'not a symbol!', thesis: 'x' })).status, 400);
  assert.equal((await post({ symbol: 'SOXL', thesis: 'y'.repeat(2001) })).status, 400);

  res = await call('/_m/notes', { env });
  const { notes } = await res.json();
  assert.deepEqual(notes.map((n) => n.symbol), ['AVGO']);

  res = await post({ symbol: 'AVGO', thesis: '', horizon: ' ', risk: '', review: '' });
  assert.equal((await res.json()).deleted, true);
  assert.deepEqual((await (await call('/_m/notes', { env })).json()).notes, []);
});

// ── Brain routes through the real Worker entry point ─────────────────────────
function d1(DB) {
  const db = new DB(':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) || null,
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };
}

test('Brain write and control routes refuse a missing or wrong passphrase before any upstream call', { skip: !DatabaseSync && 'node:sqlite unavailable on this Node' }, async () => {
  const env = { ...ENV, NOTES_DB: d1(DatabaseSync) };
  const routes = [['/_m/brain/control', 'GET'], ['/_m/brain/control', 'POST', { enabled: true }], ['/_m/brain/report', 'POST', { mode: 'paper' }],
    ['/_m/brain/order', 'POST', { symbol: 'MU', target_position: 1 }], ['/_m/brain/resolve', 'POST', { client_id: 'joyeb-fly-MU-1' }]];
  for (const [route, method, body] of routes) {
    for (const token of [undefined, 'wrong']) {
      const res = await call(route, { method, body, token, env });
      assert.equal(res.status, 401, `${method} ${route} token=${token}`);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
    }
  }
  assert.deepEqual(calls, []);
});

test('Brain status is public, paused by default, and carries CORS for the site only', { skip: !DatabaseSync && 'node:sqlite unavailable on this Node' }, async () => {
  const env = { ...ENV, NOTES_DB: d1(DatabaseSync) };
  const res = await call('/_m/brain/status', { env, headers: { Origin: 'https://evil.example.com' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
  const body = await res.json();
  assert.equal(body.enabled, false);
  assert.equal(body.report, null);
  assert.ok(!JSON.stringify(body).includes(ENV.ALPACA_SECRET_KEY) && !JSON.stringify(body).includes(TOKEN));
  assert.deepEqual(calls, []);
});

test('Brain preflight answers with the owner header allowed', async () => {
  const res = await worker.fetch(new Request(`${SITE}/_m/brain/order`, { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' } }), ENV, {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /X-Trade-Token/);
});

// ── Option chain for the Quant Desk ──────────────────────────────────────────
// A fake CBOE chain: spot 100, two expiries (7 and 35 days out), strikes 50-150.
function cboeChain() {
  const day = 86400000;
  const nyToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const start = Date.parse(nyToday + 'T00:00:00Z');
  const occDate = (ms) => new Date(ms).toISOString().slice(2, 10).replace(/-/g, '');
  const options = [];
  for (const days of [7, 35]) {
    const d = occDate(start + days * day);
    for (const k of [50, 90, 95, 100, 105, 110, 150]) {
      const strike = String(k * 1000).padStart(8, '0');
      // ATM straddle at 100: call 2.5 + put 2.5 (7d), 4 + 4 (35d).
      const atm = days === 7 ? 2.5 : 4;
      const callMid = k === 100 ? atm : Math.max(0.05, 100 - k + 1);
      const putMid = k === 100 ? atm : Math.max(0.05, k - 100 + 1);
      options.push({ option: `AMD${d}C${strike}`, bid: callMid - 0.05, ask: callMid + 0.05, last_trade_price: callMid, iv: 0.5, delta: 0.5, gamma: 0.02, theta: -0.1, vega: 0.08, volume: 10, open_interest: 100 });
      options.push({ option: `AMD${d}P${strike}`, bid: putMid - 0.05, ask: putMid + 0.05, last_trade_price: putMid, iv: 0.52, delta: -0.5, gamma: 0.02, theta: -0.1, vega: 0.08, volume: 5, open_interest: 50 });
    }
  }
  return JSON.stringify({ timestamp: '2026-10-22 15:00:00', data: { current_price: 100, iv30: 51.2, iv30_change: -1.3, options } });
}

test('the option chain returns one expiry, a ±25% strike band and every expiry\'s expected move', async () => {
  upstream = () => ({ body: cboeChain() });
  const res = await call('/_m/chain?symbol=AMD');
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.spot, 100);
  assert.equal(j.iv30, 51.2);
  assert.equal(j.asOf, '2026-10-22T15:00:00Z', 'CBOE\'s zone-less stamp is UTC');
  assert.equal(j.expiries.length, 2);
  assert.equal(j.exp, j.expiries[0].date, 'defaults to the front expiry');
  assert.deepEqual(j.rows.map((r) => r.k), [90, 95, 100, 105, 110], 'strikes 50 and 150 fall outside ±25%');
  const atm = j.rows.find((r) => r.k === 100);
  assert.equal(atm.call.mid, 2.5);
  assert.equal(atm.put.delta, -0.5);
  assert.deepEqual([j.expiries[0].days, j.expiries[0].move, j.expiries[0].movePct], [7, 5, 5]);
  assert.deepEqual([j.expiries[1].days, j.expiries[1].move], [35, 8]);
});

test('the option chain serves a requested expiry and refuses bad input without an upstream call', async () => {
  upstream = () => ({ body: cboeChain() });
  const first = await (await call('/_m/chain?symbol=AMD')).json();
  const later = first.expiries[1].date;
  const res = await call(`/_m/chain?symbol=AMD&exp=${later}`);
  assert.equal((await res.json()).exp, later);
  calls = [];
  for (const bad of ['/_m/chain?symbol=AMD&exp=next-week', '/_m/chain?symbol=amd%3Cscript%3E']) {
    assert.equal((await call(bad)).status, 400, bad);
  }
  assert.deepEqual(calls, []);
});

test('the option chain is cached and keeps CORS for the site only', async () => {
  upstream = () => ({ body: cboeChain() });
  await call('/_m/chain?symbol=AMD');
  calls = [];
  const res = await call('/_m/chain?symbol=AMD', { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [], 'served from cache');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
});
