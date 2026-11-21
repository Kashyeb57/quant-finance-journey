// WebMCP tools: the public catalog leaves out placeholders, drafts, unlisted and
// admin pages; tool inputs are checked; paging never skips or repeats; and the
// market tool can only ever reach GET /_m/quote.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { root } from './extract.mjs';
import {
  TOOLS, validate, pageResult, runTool, quoteRequest, MAX_CHARS, DEFAULT_SYMBOLS, QUOTE_PATH,
} from '../src/lib/webmcp/core.mjs';

const require = createRequire(import.meta.url);
const { buildCatalog, readArrayLiteral } = require('../plugins/webmcp-catalog.js');

// Doc metadata shaped like the docs plugin's, for every real file under docs/.
function realDocs() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.mdx?$/.test(e.name)) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        const permalink = '/' + rel.replace(/\.mdx?$/, '').split('/').map((s) => s.replace(/^\d+-/, '')).join('/');
        out.push({ source: `@site/${rel}`, permalink, title: e.name, description: '', frontMatter: {} });
      }
    }
  };
  walk(path.join(root, 'docs'));
  return out;
}

const docs = realDocs();
const published = docs.find((d) => !/<ComingSoon\b/.test(readFileSync(path.join(root, d.source.slice(6)), 'utf8')));
const fixtures = [
  ...docs,
  { ...published, permalink: '/docs/admin/secret-page' },
  { ...published, permalink: '/admin' },
  { ...published, permalink: '/docs/Finance/hidden-a', frontMatter: { unlisted: true } },
  { ...published, permalink: '/docs/Finance/hidden-b', unlisted: true },
  { ...published, permalink: '/docs/Finance/hidden-c', draft: true },
];
const catalog = buildCatalog(root, fixtures, 'https://joyebkashyeb.com.np/');

test('catalog leaves out placeholders, drafts, unlisted and admin pages', () => {
  const urls = new Set(catalog.notes.map((n) => n.url));
  const placeholders = docs.filter((d) => /<ComingSoon\b/.test(readFileSync(path.join(root, d.source.slice(6)), 'utf8')));
  assert.ok(placeholders.length > 0, 'expected at least one <ComingSoon> placeholder in docs/');
  for (const d of placeholders) assert.ok(!urls.has(d.permalink), `placeholder listed: ${d.permalink}`);
  for (const u of urls) {
    assert.ok(!/admin/i.test(u), `admin page listed: ${u}`);
    assert.ok(!/hidden-/.test(u), `unlisted/draft page listed: ${u}`);
  }
  assert.ok(urls.has(published.permalink));
  const text = JSON.stringify(catalog);
  assert.ok(!/\/_m\/|X-Trade-Token|TRADE_TOKEN|<ComingSoon/.test(text), 'catalog mentions a private route or token');
  assert.equal(catalog.site, 'https://joyebkashyeb.com.np');
});

test('catalog holds metadata only, and reads the real projects and events', () => {
  for (const n of catalog.notes) {
    assert.ok(n.title && n.url.startsWith('/docs/') && n.section);
    assert.ok(n.description.length <= 220 && n.headings.length <= 8);
  }
  const events = readArrayLiteral(path.join(root, 'src/pages/events/index.js'), 'EVENTS');
  const projects = readArrayLiteral(path.join(root, 'src/components/Projects/index.jsx'), 'PROJECTS');
  assert.equal(catalog.events.length, events.length);
  assert.equal(catalog.projects.length, projects.length);
  assert.deepEqual(catalog.events.map((e) => e.url), events.map((e) => `/events/${e.slug}`));
  for (const p of catalog.projects) for (const l of p.links) assert.match(l.url, /^https?:\/\//);
});

test('every tool schema forbids extra fields', () => {
  assert.equal(TOOLS.length, 6);
  for (const t of TOOLS) {
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(t.inputSchema.additionalProperties, false, t.name);
    assert.ok(t.description.length > 40, t.name);
  }
});

test('bad input is rejected with INVALID_INPUT', async () => {
  const tool = (n) => TOOLS.find((t) => t.name === n).inputSchema;
  const bad = [
    ['search_notes', {}],
    ['search_notes', { query: 'x' }],
    ['search_notes', { query: 'options', extra: 1 }],
    ['search_notes', { query: 'options', limit: 11 }],
    ['search_notes', { query: 'options', limit: 0 }],
    ['search_notes', { query: 'options', limit: 2.5 }],
    ['search_notes', { query: 'options', offset: -1 }],
    ['search_notes', { query: 42 }],
    ['list_notes_by_topic', { topic: '' }],
    ['list_projects', { limit: '5' }],
    ['get_current_page', { anything: true }],
    ['get_market_snapshot', { symbols: [] }],
    ['get_market_snapshot', { symbols: ['spy'] }],
    ['get_market_snapshot', { symbols: ['../order'] }],
    ['get_market_snapshot', { symbols: ['SPY&x=1'] }],
    ['get_market_snapshot', { symbols: Array(11).fill('SPY') }],
    ['get_market_snapshot', { symbols: 'SPY' }],
  ];
  for (const [name, input] of bad) {
    assert.ok(validate(tool(name), input), `${name} accepted ${JSON.stringify(input)}`);
    const out = JSON.parse(await runTool(name, input, {}));
    assert.equal(out.ok, false);
    assert.equal(out.error.code, 'INVALID_INPUT', `${name} ${JSON.stringify(input)}`);
  }
  assert.equal(validate(tool('search_notes'), { query: 'black scholes', limit: 10, offset: 0 }), null);
  assert.equal(validate(tool('list_projects'), undefined), null);
});

test('paging never skips or repeats, even when items are trimmed to fit', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let x = seed;
    const rand = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    const all = Array.from({ length: Math.floor(rand() * 60) }, (_, i) => ({ id: i, text: 'w'.repeat(Math.floor(rand() * 1500)) }));
    const limit = 1 + Math.floor(rand() * 10);
    const got = [];
    let offset = 0;
    for (let guard = 0; guard < 500; guard++) {
      const page = JSON.parse(pageResult(all, { limit, offset }));
      assert.ok(JSON.stringify(page).length <= MAX_CHARS || page.count === 1);
      assert.ok(page.count <= limit);
      got.push(...page.items.map((i) => i.id));
      if (!page.hasMore) break;
      assert.equal(page.nextOffset, offset + page.count);
      assert.ok(page.count > 0, 'a page with more items to come must not be empty');
      offset = page.nextOffset;
    }
    assert.deepEqual(got, all.map((i) => i.id), `seed ${seed}`);
  }
});

test('catalog tools answer from the catalog with explicit errors', async () => {
  const deps = { loadCatalog: async () => catalog };
  const s = JSON.parse(await runTool('search_notes', { query: 'black scholes' }, deps));
  assert.equal(s.ok, true);
  assert.ok(s.items.length > 0 && s.items.length <= 5);
  assert.ok(s.items.every((i) => i.url.startsWith('https://joyebkashyeb.com.np/docs/')));
  const none = JSON.parse(await runTool('search_notes', { query: 'zzqqxxnotathing' }, deps));
  assert.equal(none.error.code, 'NO_MATCH');
  const topic = JSON.parse(await runTool('list_notes_by_topic', { topic: 'nope' }, deps));
  assert.equal(topic.error.code, 'UNKNOWN_TOPIC');
  assert.ok(topic.error.topics.includes('Finance'));
  const fin = JSON.parse(await runTool('list_notes_by_topic', { topic: 'finance', limit: 10 }, deps));
  assert.equal(fin.topic, 'Finance');
  const ev = JSON.parse(await runTool('list_big_events', {}, deps));
  assert.equal(ev.total, catalog.events.length);
  const failing = { loadCatalog: async () => { throw Object.assign(new Error('down'), { code: 'CATALOG_UNAVAILABLE' }); } };
  const err = JSON.parse(await runTool('list_projects', {}, failing));
  assert.equal(err.error.code, 'CATALOG_UNAVAILABLE');
  assert.equal(err.error.retryable, true);
  const ac = new AbortController();
  ac.abort();
  assert.equal(JSON.parse(await runTool('list_projects', {}, deps, ac.signal)).error.code, 'CANCELLED');
});

test('market snapshot can only reach GET /_m/quote', async () => {
  const seen = [];
  const deps = {
    origin: 'https://joyebkashyeb.com.np',
    fetchQuote: async (url, init) => {
      seen.push({ url, init });
      return { quotes: [{ symbol: 'SPY', price: 1, changePct: 1.234, prevClose: 1, delayed: false, at: 'now', source: 'alpaca-iex' }] };
    },
  };
  const out = JSON.parse(await runTool('get_market_snapshot', {}, deps));
  assert.equal(out.ok, true);
  assert.match(out.disclaimer, /Not investment advice/);
  assert.deepEqual(out.quotes.map((q) => q.symbol), DEFAULT_SYMBOLS);
  assert.equal(out.quotes[0].changePct, 1.23);
  assert.equal(out.quotes[1].error, 'NO_DATA');
  await runTool('get_market_snapshot', { symbols: ['AAPL', '^VIX', 'GC=F', 'BRK.B'] }, deps);
  for (const odd of [['SPY', '/_m/order'], ['../../_m/brain']]) await runTool('get_market_snapshot', { symbols: odd }, deps);
  for (const s of [undefined, ['../order'], ['SPY?x=/_m/order'], ['https://evil.example/x']]) seen.push(quoteRequest('https://joyebkashyeb.com.np', s));
  for (const { url, init } of seen) {
    const u = new URL(url);
    assert.equal(u.origin, 'https://joyebkashyeb.com.np');
    assert.equal(u.pathname, QUOTE_PATH);
    assert.deepEqual([...u.searchParams.keys()], ['symbols']);
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.deepEqual(init.headers, {});
  }
  const sources = ['src/lib/webmcp/core.mjs', 'src/lib/webmcp/register.js', 'src/clientModules/webmcp.js']
    .map((f) => readFileSync(path.join(root, f), 'utf8')).join('\n');
  for (const banned of ['/_m/order', '/_m/cancel', '/_m/notes', '/_m/brain', 'X-Trade-Token', 'TRADE_TOKEN', "method: 'POST'", '/admin']) {
    assert.ok(!sources.includes(banned), `tool code mentions ${banned}`);
  }
});
