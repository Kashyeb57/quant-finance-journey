// WebMCP tools for this site: definitions, input checks, paging and the pure
// logic behind each tool. No browser APIs and no imports here, so Node tests can
// load this file directly; src/lib/webmcp/register.js supplies the browser parts
// (catalog fetch, quote fetch, reading the open page) as `deps`.
//
// Every tool is read-only. The only network route any tool can reach is
// GET /_m/quote (plus the static catalog /webmcp/index.json).

export const CATALOG_PATH = '/webmcp/index.json';
export const QUOTE_PATH = '/_m/quote';
export const MAX_CHARS = 4000;
export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 10;
export const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'IWM', '^VIX'];
export const SYMBOL_RE = /^\^?[A-Z][A-Z0-9.=-]{0,9}$/;

export const DISCLAIMER =
  'Not investment advice. Data may be delayed. US stock and ETF prices come from a single-exchange feed (IEX), ' +
  'so they can differ from the consolidated market price; index levels such as ^VIX come from Yahoo and are delayed.';

const paging = {
  limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, description: `How many items to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).` },
  offset: { type: 'integer', minimum: 0, maximum: 10000, description: 'How many items to skip; pass the previous nextOffset to get the next page.' },
};

export const TOOLS = [
  {
    name: 'search_notes',
    description:
      "Search Joyeb Kashyeb's published study notes (math, probability, statistics, finance, economics, machine learning, programming) by keyword. " +
      'Matches titles, descriptions and section headings. Returns title, url, section and a short excerpt for each note.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 100, description: 'Keywords, e.g. "black scholes" or "central limit theorem".' },
        section: { type: 'string', minLength: 2, maxLength: 60, description: 'Optional top-level section to search within, e.g. "Finance".' },
        ...paging,
      },
      required: ['query'],
    },
  },
  {
    name: 'list_notes_by_topic',
    description:
      'List the published notes in one top-level section of the site (for example Probability or Finance), in course order. ' +
      'Outline pages that are still placeholders are left out. An unknown topic returns UNKNOWN_TOPIC with the valid topics.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        topic: { type: 'string', minLength: 2, maxLength: 60, description: 'Section name, e.g. "Probability", "Machine Learning".' },
        ...paging,
      },
      required: ['topic'],
    },
  },
  {
    name: 'list_projects',
    description: "List the software and quant projects on Joyeb Kashyeb's Projects page, with status, a short summary, tags and links.",
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...paging } },
  },
  {
    name: 'list_big_events',
    description:
      'List the Big Events write-ups (market blow-ups, policy shifts and other notable financial events), newest first, ' +
      'with title, month, tag, a short summary and the page url.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { ...paging } },
  },
  {
    name: 'get_current_page',
    description: 'Describe the page that is open right now: its title, description, url, headings and the links inside its main content.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  },
  {
    name: 'get_market_snapshot',
    description:
      'Get the latest price, percent change from the previous close, previous close, whether the quote is delayed, and its time, ' +
      `for a few tickers (default ${DEFAULT_SYMBOLS.join(', ')}). Read-only market data with a disclaimer; not investment advice.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbols: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_LIMIT,
          items: { type: 'string', pattern: SYMBOL_RE.source, maxLength: 11 },
          description: 'Tickers in upper case, e.g. ["SPY", "AAPL", "^VIX"].',
        },
      },
    },
  },
];

export const ANNOTATIONS = { readOnlyHint: true, consequentialHint: false, untrustedContentHint: false };

// ── input checks (the JSON Schema subset the tools use) ─────────────────────
export function validate(schema, input) {
  const value = input === undefined || input === null ? {} : input;
  if (typeof value !== 'object' || Array.isArray(value)) return 'input must be an object';
  for (const key of Object.keys(value)) {
    if (!schema.properties || !(key in schema.properties)) return `unknown field "${key}"`;
  }
  for (const key of schema.required || []) {
    if (value[key] === undefined) return `missing required field "${key}"`;
  }
  for (const [key, rule] of Object.entries(schema.properties || {})) {
    if (value[key] === undefined) continue;
    const problem = checkValue(rule, value[key]);
    if (problem) return `${key}: ${problem}`;
  }
  return null;
}

function checkValue(rule, v) {
  if (rule.type === 'string') {
    if (typeof v !== 'string') return 'must be a string';
    const len = v.trim().length;
    if (rule.minLength !== undefined && len < rule.minLength) return `must be at least ${rule.minLength} characters`;
    if (rule.maxLength !== undefined && v.length > rule.maxLength) return `must be at most ${rule.maxLength} characters`;
    if (rule.pattern && !new RegExp(rule.pattern).test(v)) return 'has an invalid format';
    return null;
  }
  if (rule.type === 'integer') {
    if (!Number.isInteger(v)) return 'must be an integer';
    if (rule.minimum !== undefined && v < rule.minimum) return `must be >= ${rule.minimum}`;
    if (rule.maximum !== undefined && v > rule.maximum) return `must be <= ${rule.maximum}`;
    return null;
  }
  if (rule.type === 'array') {
    if (!Array.isArray(v)) return 'must be an array';
    if (rule.minItems !== undefined && v.length < rule.minItems) return `needs at least ${rule.minItems} item(s)`;
    if (rule.maxItems !== undefined && v.length > rule.maxItems) return `allows at most ${rule.maxItems} items`;
    for (let i = 0; i < v.length; i++) {
      const p = checkValue(rule.items, v[i]);
      if (p) return `item ${i} ${p}`;
    }
    return null;
  }
  return 'unsupported type';
}

// ── responses ───────────────────────────────────────────────────────────────
export function errorResult(code, message, extra) {
  return JSON.stringify({ ok: false, error: { code, message, ...(extra || {}) } });
}

// One page of `all`, as JSON text no longer than MAX_CHARS. Items that would push
// past the cap are held back for the next page (trimmed: true), so paging with
// nextOffset never skips or repeats an item.
export function pageResult(all, { limit = DEFAULT_LIMIT, offset = 0 } = {}, extra = {}) {
  const total = all.length;
  let items = all.slice(offset, offset + limit);
  let trimmed = false;
  const render = () => {
    const next = offset + items.length;
    const hasMore = next < total;
    return JSON.stringify({ ok: true, ...extra, total, offset, count: items.length, hasMore, nextOffset: hasMore ? next : null, trimmed, items });
  };
  let text = render();
  while (text.length > MAX_CHARS && items.length > 1) {
    items = items.slice(0, -1);
    trimmed = true;
    text = render();
  }
  if (text.length > MAX_CHARS && items.length === 1) {
    items = [shrinkItem(items[0])];
    trimmed = true;
    text = render();
  }
  return text;
}

function shrinkItem(item) {
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (typeof v === 'string') out[k] = v.length > 300 ? `${v.slice(0, 297)}...` : v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 10);
    else out[k] = v;
  }
  return out;
}

const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s || '');
const norm = (s) => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const abs = (catalog, url) => (/^https?:/.test(url) ? url : `${catalog.site}${url}`);

// ── tool logic ──────────────────────────────────────────────────────────────
export function sectionsOf(catalog) {
  return [...new Set(catalog.notes.map((n) => n.section))];
}

function findSection(catalog, name) {
  const want = norm(name);
  return sectionsOf(catalog).find((s) => norm(s) === want) || null;
}

export function searchNotes(catalog, { query, section, limit, offset }) {
  let pool = catalog.notes;
  if (section !== undefined) {
    const s = findSection(catalog, section);
    if (!s) return errorResult('UNKNOWN_TOPIC', `No section named "${section}".`, { topics: sectionsOf(catalog) });
    pool = pool.filter((n) => n.section === s);
  }
  const words = norm(query).split(' ').filter((w) => w.length > 1);
  if (!words.length) return errorResult('INVALID_INPUT', 'query needs at least one word of 2+ letters.');
  const scored = [];
  pool.forEach((n, i) => {
    const title = norm(n.title);
    const heads = norm((n.headings || []).join(' | '));
    const desc = norm(n.description);
    const where = norm(`${n.section} ${n.path || ''}`);
    let score = 0;
    for (const w of words) {
      const s = (title.includes(w) ? 6 : 0) + (heads.includes(w) ? 2 : 0) + (desc.includes(w) ? 1 : 0) + (where.includes(w) ? 1 : 0);
      if (!s) return; // every word must appear somewhere
      score += s;
    }
    if (title.includes(words.join(' '))) score += 4;
    const head = (n.headings || []).find((h) => words.every((w) => norm(h).includes(w)));
    scored.push({ score, i, n, head });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const items = scored.map(({ n, head }) => ({
    title: n.title,
    url: abs(catalog, n.url),
    section: n.section,
    excerpt: clip(n.description || (head ? `Section: ${head}` : ''), 200),
  }));
  if (!items.length) return errorResult('NO_MATCH', `No published note matches "${query}".`, { topics: sectionsOf(catalog) });
  return pageResult(items, { limit, offset }, { query });
}

export function listNotesByTopic(catalog, { topic, limit, offset }) {
  const s = findSection(catalog, topic);
  if (!s) return errorResult('UNKNOWN_TOPIC', `No section named "${topic}".`, { topics: sectionsOf(catalog) });
  const items = catalog.notes
    .filter((n) => n.section === s)
    .map((n) => ({ title: n.title, url: abs(catalog, n.url), path: n.path, description: clip(n.description, 160) }));
  return pageResult(items, { limit, offset }, { topic: s });
}

export function listProjects(catalog, { limit, offset }) {
  const items = catalog.projects.map((p) => ({
    title: p.title,
    status: p.status,
    summary: p.summary,
    tags: p.tags,
    links: p.links,
    page: abs(catalog, '/projects'),
  }));
  return pageResult(items, { limit, offset });
}

export function listBigEvents(catalog, { limit, offset }) {
  const items = catalog.events.map((e) => ({ slug: e.slug, title: e.title, date: e.date, tag: e.tag, summary: e.summary, url: abs(catalog, e.url) }));
  return pageResult(items, { limit, offset });
}

// The quote request is always GET <origin>/_m/quote?symbols=...: fixed path,
// no body, no headers, no token. Nothing the caller passes can change that.
export function quoteRequest(origin, symbols) {
  const list = (symbols && symbols.length ? symbols : DEFAULT_SYMBOLS).filter((s) => SYMBOL_RE.test(s));
  const url = new URL(QUOTE_PATH, origin);
  url.searchParams.set('symbols', [...new Set(list)].join(','));
  return { url: url.toString(), init: { method: 'GET', credentials: 'omit', headers: {} } };
}

export function shapeQuotes(raw, asked) {
  const quotes = Array.isArray(raw && raw.quotes) ? raw.quotes : [];
  const bySym = new Map(quotes.map((q) => [q.symbol, q]));
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const items = asked.map((sym) => {
    const q = bySym.get(sym);
    if (!q) return { symbol: sym, error: 'NO_DATA' };
    return {
      symbol: sym,
      price: num(q.price),
      changePct: num(q.changePct) === null ? null : Math.round(q.changePct * 100) / 100,
      prevClose: num(q.prevClose),
      delayed: q.delayed === true,
      at: typeof q.at === 'string' ? q.at : null,
      source: typeof q.source === 'string' ? q.source : null,
    };
  });
  return JSON.stringify({ ok: true, disclaimer: DISCLAIMER, quotes: items });
}

export function describePage(page) {
  const out = {
    ok: true,
    title: clip(page.title, 200),
    description: clip(page.description, 300),
    url: page.url,
    headings: (page.headings || []).slice(0, 40).map((h) => ({ level: h.level, text: clip(h.text, 120) })),
    links: (page.links || []).slice(0, 40).map((l) => ({ text: clip(l.text, 80), url: l.url })),
    trimmed: false,
  };
  let text = JSON.stringify(out);
  while (text.length > MAX_CHARS && (out.links.length || out.headings.length)) {
    if (out.links.length) out.links.pop();
    else out.headings.pop();
    out.trimmed = true;
    text = JSON.stringify(out);
  }
  return text;
}

// Runs one tool: check input, then dispatch. `deps` (browser side, or fakes in
// tests): loadCatalog(signal), fetchQuote(url, init, signal), readPage(), origin.
export async function runTool(name, input, deps, signal) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return errorResult('UNKNOWN_TOOL', `No tool named "${name}".`);
  const problem = validate(tool.inputSchema, input);
  if (problem) return errorResult('INVALID_INPUT', problem);
  const args = { limit: DEFAULT_LIMIT, offset: 0, ...(input || {}) };
  if (signal && signal.aborted) return errorResult('CANCELLED', 'The call was cancelled.');
  try {
    if (name === 'get_current_page') return describePage(deps.readPage());
    if (name === 'get_market_snapshot') {
      const asked = [...new Set(args.symbols || DEFAULT_SYMBOLS)];
      const { url, init } = quoteRequest(deps.origin, asked);
      const raw = await deps.fetchQuote(url, init, signal);
      return shapeQuotes(raw, asked);
    }
    const catalog = await deps.loadCatalog(signal);
    if (name === 'search_notes') return searchNotes(catalog, args);
    if (name === 'list_notes_by_topic') return listNotesByTopic(catalog, args);
    if (name === 'list_projects') return listProjects(catalog, args);
    if (name === 'list_big_events') return listBigEvents(catalog, args);
  } catch (err) {
    if ((signal && signal.aborted) || (err && err.name === 'AbortError')) return errorResult('CANCELLED', 'The call was cancelled.');
    const code = err && err.code ? err.code : 'UNAVAILABLE';
    return errorResult(code, (err && err.message) || 'The data could not be loaded. Try again.', { retryable: true });
  }
  return errorResult('UNKNOWN_TOOL', `No tool named "${name}".`);
}
