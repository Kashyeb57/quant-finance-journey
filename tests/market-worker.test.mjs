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
