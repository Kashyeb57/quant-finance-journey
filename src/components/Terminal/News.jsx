import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { rssUrl } from '@site/src/lib/market';
import styles from './styles.module.css';

/*
 * News terminal — live financial headlines from a curated set of RSS feeds
 * (Fincept feed list) fetched through the market Worker (public CORS proxies as
 * a fallback) and parsed client-side.
 * Features: category tabs, time-range filter, text/ticker search, relative
 * timestamps, and a heuristic impact indicator (keyword sentiment + ticker tags).
 */

const FEEDS = [
  // MKT — Markets
  { source: 'MARKETWATCH', cat: 'MKT', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { source: 'CNBC', cat: 'MKT', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  // pubDate carries no zone ("2026-09-15 01:42:22"); checked 2026-09-14 against
  // the server clock, it is UTC. Browsers read zone-less times as local, which
  // put these headlines hours in the future for visitors in the Americas.
  { source: 'INVESTING', cat: 'MKT', url: 'https://www.investing.com/rss/news.rss', tz: 'UTC' },
  { source: 'SEEKING ALPHA', cat: 'MKT', url: 'https://seekingalpha.com/market_currents.xml' },
  { source: 'BBC BIZ', cat: 'MKT', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { source: 'FXSTREET', cat: 'MKT', url: 'https://www.fxstreet.com/rss/news' },
  // ECO — Economic
  { source: 'ECONOMIST', cat: 'ECO', url: 'https://www.economist.com/finance-and-economics/rss.xml' },
  { source: 'WSJ', cat: 'ECO', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  // TECH
  { source: 'TECHCRUNCH', cat: 'TECH', url: 'https://techcrunch.com/feed/' },
  { source: 'WIRED', cat: 'TECH', url: 'https://www.wired.com/feed/rss' },
  { source: 'CNBC TECH', cat: 'TECH', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910' },
  // NRG — Energy
  { source: 'OILPRICE', cat: 'NRG', url: 'https://oilprice.com/rss/main' },
  // CRPT — Crypto
  { source: 'COINDESK', cat: 'CRPT', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'COINTELEGRAPH', cat: 'CRPT', url: 'https://cointelegraph.com/rss' },
  { source: 'DECRYPT', cat: 'CRPT', url: 'https://decrypt.co/feed' },
  // GEO — Geopolitics / World
  { source: 'BBC WORLD', cat: 'GEO', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { source: 'AL JAZEERA', cat: 'GEO', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { source: 'GUARDIAN', cat: 'GEO', url: 'https://www.theguardian.com/world/rss' },
  { source: 'FRANCE 24', cat: 'GEO', url: 'https://www.france24.com/en/rss' },
  // REG — Regulators / Central Banks
  { source: 'SEC', cat: 'REG', url: 'https://www.sec.gov/news/pressreleases.rss' },
  { source: 'FED', cat: 'REG', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { source: 'ECB', cat: 'REG', url: 'https://www.ecb.europa.eu/rss/press.html' },

  // Fast-updating, market-only wires (verified live) — near-instant on breaking
  // market moves. These feed the "⚡ Breaking" view (see FAST below).
  { source: 'MW REALTIME', cat: 'MKT', url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines' },
  { source: 'MW BREAKING', cat: 'MKT', url: 'https://feeds.content.dowjones.io/public/rss/mw_bulletins' },
  { source: 'NASDAQ', cat: 'MKT', url: 'https://www.nasdaq.com/feed/rssoutbound?category=Markets' },
  { source: 'BENZINGA', cat: 'MKT', url: 'https://www.benzinga.com/feed' },
  { source: 'PR NEWSWIRE', cat: 'MKT', url: 'https://www.prnewswire.com/rss/financial-services-latest-news/financial-services-latest-news-list.rss' },
  { source: 'FT MARKETS', cat: 'MKT', url: 'https://www.ft.com/markets?format=rss' },
  { source: 'THE BLOCK', cat: 'CRPT', url: 'https://www.theblock.co/rss.xml' },
];

const CATEGORIES = ['ALL', 'MKT', 'ECO', 'TECH', 'NRG', 'CRPT', 'GEO', 'REG'];

// The fast, market-moving wires. The "⚡ Breaking" toggle filters to just these,
// so the feed reads like a clean market tape instead of a mixed world-news
// stream (drops the sports/general noise the broad sources carry).
const FAST = new Set(['MW BREAKING', 'MW REALTIME', 'PR NEWSWIRE', 'BENZINGA', 'NASDAQ', 'MARKETWATCH', 'CNBC', 'SEEKING ALPHA', 'INVESTING', 'FXSTREET']);
const RANGES = [
  { code: '1H', h: 1 },
  { code: '6H', h: 6 },
  { code: '24H', h: 24 },
  { code: '7D', h: 168 },
  { code: '30D', h: 720 },
  { code: 'ALL', h: null },
];

// The site's own Worker first; the public proxies only as a fallback, since
// they go down without notice (both were down together on 2026-09-14).
const PROXIES = [
  (u) => rssUrl(u),
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

const POS = ['surge', 'surges', 'jump', 'jumps', 'gain', 'gains', 'rally', 'rallies', 'soar', 'soars', 'beat', 'beats', 'record high', 'rise', 'rises', 'climb', 'climbs', 'boost', 'profit', 'growth', 'strong', 'upgrade', 'bullish', 'win', 'wins', 'approve', 'approved', 'approval', 'rebound', 'outperform', 'high'];
const NEG = ['fall', 'falls', 'drop', 'drops', 'plunge', 'plunges', 'slump', 'slumps', 'sink', 'sinks', 'crash', 'crashes', 'cut', 'cuts', 'loss', 'losses', 'miss', 'misses', 'decline', 'declines', 'weak', 'downgrade', 'bearish', 'warn', 'warns', 'warning', 'emergency', 'crisis', 'ban', 'bans', 'lawsuit', 'probe', 'fraud', 'layoff', 'layoffs', 'recession', 'default', 'tumble', 'tumbles', 'selloff', 'sell-off', 'fear', 'fears', 'halt', 'halts', 'low', 'sue', 'sued'];

const TAGS = [
  [/\bapple\b/i, '$AAPL'], [/\bmicrosoft\b/i, '$MSFT'], [/\bnvidia\b/i, '$NVDA'],
  [/\btesla\b/i, '$TSLA'], [/\bamazon\b/i, '$AMZN'], [/\b(alphabet|google)\b/i, '$GOOGL'],
  [/\b(meta|facebook)\b/i, '$META'], [/\bbitcoin\b/i, '$BTC'], [/\beth(ereum)?\b/i, '$ETH'],
  [/\b(fed|federal reserve|interest rate|rate cut|rate hike)\b/i, '$RATES'],
  [/\b(dollar|usd|greenback)\b/i, '$USD'], [/\b(oil|crude|brent|wti)\b/i, '$OIL'],
  [/\byen\b/i, '$JPY'], [/\bgold\b/i, '$GOLD'], [/\bs&p|nasdaq|dow\b/i, '$US'],
];

function analyze(title) {
  const t = (title || '').toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POS) if (t.includes(w)) pos++;
  for (const w of NEG) if (t.includes(w)) neg++;
  const impact = pos > neg ? 'pos' : neg > pos ? 'neg' : 'neu';
  const tags = [];
  for (const [re, tag] of TAGS) if (re.test(title) && !tags.includes(tag)) tags.push(tag);
  return { impact, tags: tags.slice(0, 2) };
}

// What each tab does, shown on hover.
const CATEGORY_HELP = {
  ALL: 'Every source', MKT: 'Markets: stocks, indices, currencies', ECO: 'Economics and finance',
  TECH: 'Technology', NRG: 'Energy and oil', CRPT: 'Crypto', GEO: 'World news and geopolitics',
  REG: 'Regulators and central banks: SEC, Fed, ECB',
};

// Exact publication time for the relative stamp's tooltip, in CT like the rest of the site.
function fullTimeCT(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(d) + ' CT';
}

function timeTitle(dateStr) {
  const full = fullTimeCT(dateStr);
  return isFutureDate(dateStr)
    ? `Publisher's timestamp (${full}) is ahead of the current time, so this item isn't treated as recent`
    : full;
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  if (isFutureDate(dateStr)) return '—';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function parseFeed(xmlText, feed) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) return [];
  let nodes = Array.from(doc.querySelectorAll('item'));
  if (nodes.length === 0) nodes = Array.from(doc.querySelectorAll('entry'));
  return nodes
    .map((n) => {
      const title = (n.querySelector('title')?.textContent || '').trim();
      let link = '';
      for (const l of Array.from(n.querySelectorAll('link'))) {
        const href = l.getAttribute('href');
        if (href) { if (l.getAttribute('rel') !== 'self') { link = href; break; } if (!link) link = href; }
        else if (l.textContent) { link = l.textContent.trim(); break; }
      }
      const date =
        n.querySelector('pubDate')?.textContent ||
        n.querySelector('published')?.textContent ||
        n.querySelector('updated')?.textContent ||
        n.getElementsByTagName('dc:date')[0]?.textContent || '';
      const a = analyze(title);
      return { title, link: link.trim(), pubDate: normalizeFeedDate(date, feed), source: feed.source, cat: feed.cat, impact: a.impact, tags: a.tags };
    })
    .filter((x) => x.title);
}

// Public proxies sometimes accept a connection and never answer. Without a bound,
// one hung request held the whole load (and the loading state) open indefinitely.
const PROXY_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, ms, outerSignal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  if (outerSignal) outerSignal.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { cache: 'no-store', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    if (outerSignal) outerSignal.removeEventListener('abort', onAbort);
  }
}

async function fetchFeed(feed, signal) {
  // Cache-bust per ~2-minute bucket: fresh enough to avoid day-old data, but lets the
  // proxy reuse a cached copy within the window so we don't get rate-limited.
  const bucket = Math.floor(Date.now() / 120000);
  const bust = (feed.url.includes('?') ? '&' : '?') + '_=' + bucket;
  const target = feed.url + bust;
  for (const proxy of PROXIES) {
    if (signal && signal.aborted) return [];
    try {
      const res = await fetchWithTimeout(proxy(target), PROXY_TIMEOUT_MS, signal);
      if (!res.ok) continue;
      const items = parseFeed(await res.text(), feed);
      if (items.length) return items;
    } catch (e) { /* timed out, aborted or failed: next proxy */ }
  }
  return [];
}

// ── Feed dates ──────────────────────────────────────────────────────────
// A feed marked `tz: 'UTC'` sends zone-less "YYYY-MM-DD HH:MM[:SS]" times that
// are UTC; say so explicitly instead of letting the browser assume local time.
// Other feeds' dates pass through untouched.
function normalizeFeedDate(raw, feed) {
  const s = String(raw || '').trim();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(s);
  if (m && feed && feed.tz === 'UTC') return `${m[1]}T${m[2]}Z`;
  return s;
}

// A publisher clock or zone error can stamp a story hours ahead. Beyond a few
// minutes of clock skew such an item is treated as undated: shown as "—", kept
// out of the time-range views, and sorted after dated headlines, so it can't
// pose as just-published or sit at the top of the feed.
const FUTURE_SLACK_MS = 5 * 60 * 1000;

function isFutureDate(dateStr, now = Date.now()) {
  const t = new Date(dateStr).getTime();
  return Number.isFinite(t) && t > now + FUTURE_SLACK_MS;
}

// Sort key: dated items by time, undated/future ones after all of them.
function newsTime(it, now = Date.now()) {
  const t = new Date(it.pubDate).getTime();
  return Number.isFinite(t) && t <= now + FUTURE_SLACK_MS ? t : -8.64e15;
}

// ── Grouping repeated coverage ──────────────────────────────────────────
// Several outlets often run the same story. Group a headline under an earlier
// (newer) one when they come from different sources within 36 hours and share
// most of their meaningful words: at least 3 in common and a Jaccard overlap of
// 0.5. "Fed holds rates steady" and "Fed cuts rates" stay apart (2 shared of 6).
const GROUP_STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'after', 'over', 'into', 'amid', 'says', 'said',
  'this', 'that', 'its', 'are', 'was', 'will', 'has', 'have', 'new', 'more', 'than',
  'about', 'what', 'why', 'how', 'who', 'you', 'your', 'as', 'at', 'by', 'on', 'in', 'of', 'to',
]);
const GROUP_WINDOW_MS = 36 * 3600 * 1000;

function titleWords(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9$%.]+/g, ' ')
      .split(' ')
      .map((w) => w.replace(/^\.+|\.+$/g, ''))
      .filter((w) => w.length > 2 && !GROUP_STOP.has(w)),
  );
}

function sameStory(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  const union = a.size + b.size - shared;
  return shared >= 3 && union > 0 && shared / union >= 0.5;
}

function groupHeadlines(items) {
  const groups = [];
  for (const it of items) {
    const words = titleWords(it.title);
    const t = new Date(it.pubDate).getTime();
    const home = groups.find((g) =>
      g.lead.source !== it.source &&
      !g.dupes.some((d) => d.source === it.source) &&
      (Number.isNaN(t) || Number.isNaN(g.t) || Math.abs(g.t - t) <= GROUP_WINDOW_MS) &&
      sameStory(g.words, words));
    if (home) home.dupes.push(it);
    else groups.push({ lead: it, dupes: [], words, t });
  }
  return groups;
}

// One publisher sometimes lists the same story twice under different URLs.
// Same source + the same headline (case, spacing and punctuation aside) within
// 12 hours counts as one; a reworded update or a later repeat stays separate.
const SAME_SOURCE_WINDOW_MS = 12 * 3600 * 1000;
const headlineKey = (title) => String(title || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9$%]+/g, ' ').trim();

function mergeHeadlines(prev, fresh, now = Date.now()) {
  // Newest first; for a repeated link the fresh copy sorts ahead (stable sort).
  const all = [...fresh, ...prev].sort((a, b) => newsTime(b, now) - newsTime(a, now));
  const seenLinks = new Set();
  const kept = new Map(); // source|headline -> times already kept
  const out = [];
  for (const it of all) {
    const key = it.link || it.title;
    if (!key || seenLinks.has(key)) continue;
    seenLinks.add(key);
    const tk = `${it.source}|${headlineKey(it.title)}`;
    const t = new Date(it.pubDate).getTime();
    const times = kept.get(tk) || [];
    if (times.some((k) => !Number.isFinite(k) || !Number.isFinite(t) || Math.abs(k - t) <= SAME_SOURCE_WINDOW_MS)) continue;
    kept.set(tk, [...times, t]);
    out.push(it);
  }
  return out.slice(0, 120);
}

// Map tickers to the names a headline is likely to use, so we can tell when a
// story is about the symbol currently selected on the chart.
const COMPANY = {
  AAPL: ['apple'],
  MSFT: ['microsoft'],
  NVDA: ['nvidia'],
  TSLA: ['tesla', 'musk'],
  SPY: ['s&p 500', 's&p500', 'sp500'],
};

function matchesTicker(item, ticker) {
  if (!ticker) return false;
  const t = ticker.toUpperCase();
  if (item.tags && item.tags.some((tag) => tag.toUpperCase() === t || tag.toUpperCase() === '$' + t)) return true;
  const title = (item.title || '').toLowerCase();
  if (new RegExp(`\\$?\\b${t.toLowerCase()}\\b`).test(title)) return true;
  return (COMPANY[t] || []).some((name) => title.includes(name));
}

export default function News({ ticker }) {
  const [cat, setCat] = useState('ALL');
  const [range, setRange] = useState('24H');
  const [query, setQuery] = useState('');
  const [onlyTicker, setOnlyTicker] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Re-render every second so the relative timestamps tick up live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Each load gets a sequence number and an AbortController. A newer load (a
  // category switch) or unmount cancels the old one, so its results can never
  // land in the wrong category. Polls skip while a load is still running.
  const loadSeq = useRef(0);
  const inFlight = useRef(null);

  const load = useCallback(async (c, initial) => {
    if (!initial && inFlight.current) return;
    if (inFlight.current) inFlight.current.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    const seq = ++loadSeq.current;
    const current = () => seq === loadSeq.current;

    if (initial) { setLoading(true); setError(null); setItems([]); }
    const feeds = FEEDS.filter((f) => c === 'ALL' || f.cat === c);
    let received = 0;

    // Show each feed's headlines as soon as it arrives instead of waiting for
    // the slowest proxy; any success also clears an earlier error.
    await Promise.allSettled(feeds.map(async (feed) => {
      const fresh = await fetchFeed(feed, ctrl.signal);
      if (!current() || fresh.length === 0) return;
      received += fresh.length;
      setItems((prev) => mergeHeadlines(prev, fresh));
      setLoading(false);
      setError(null);
    }));

    if (!current()) return;
    inFlight.current = null;
    setLoading(false);
    // A failed poll keeps the last good headlines on screen; only a load that
    // starts from nothing and gets nothing is an error.
    if (initial && received === 0) setError('Could not reach the news sources right now. Retrying automatically.');
  }, []);

  // Invalidate and abort whatever load is running (category switch or unmount).
  const cancelLoads = useCallback(() => {
    loadSeq.current++;
    if (inFlight.current) inFlight.current.abort();
    inFlight.current = null;
  }, []);

  useEffect(() => {
    load(cat, true);
    const id = setInterval(() => load(cat, false), 30 * 1000);
    return () => {
      clearInterval(id);
      cancelLoads();
    };
  }, [cat, load, cancelLoads]);

  const view = useMemo(() => {
    const r = RANGES.find((x) => x.code === range);
    const cutoff = r && r.h ? Date.now() - r.h * 3600 * 1000 : null;
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (breaking && !FAST.has(it.source)) return false;
      if (cutoff) {
        const d = new Date(it.pubDate);
        if (!isNaN(d) && d.getTime() < cutoff) return false;
        if (isFutureDate(it.pubDate)) return false; // undated: not "in the last N hours"
      }
      if (q && !it.title.toLowerCase().includes(q) && !it.tags.some((t) => t.toLowerCase().includes(q))) return false;
      if (onlyTicker && !matchesTicker(it, ticker)) return false;
      return true;
    });
  }, [items, range, query, onlyTicker, breaking, ticker]);

  // Repeated coverage of one story, folded under its newest headline.
  const groups = useMemo(() => groupHeadlines(view), [view]);

  const arrow = (imp) => (imp === 'pos' ? '▲' : imp === 'neg' ? '▼' : '–');

  return (
    <div className={styles.news}>
      <div className={styles.termBar}>
        <input
          className={styles.searchBox}
          placeholder="Search headlines or $ticker…"
          aria-label="Search headlines or ticker"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className={styles.refreshBtn} onClick={() => load(cat, true)} title="Refresh" aria-label="Refresh headlines">↻</button>
      </div>
      <div className={styles.termRow}>
        {CATEGORIES.map((c) => (
          <button key={c} className={`${styles.tab} ${c === cat ? styles.tabActive : ''}`} onClick={() => setCat(c)} title={CATEGORY_HELP[c]}>{c}</button>
        ))}
      </div>
      <div className={styles.termRow}>
        <button
          className={`${styles.tab} ${styles.tabBreaking} ${breaking ? styles.tabActive : ''}`}
          onClick={() => setBreaking((v) => !v)}
          title="Only the fast market wires — a clean, low-noise breaking tape"
        >
          ⚡ Breaking
        </button>
        {RANGES.map((r) => (
          <button
            key={r.code}
            className={`${styles.tab} ${r.code === range ? styles.tabActive : ''}`}
            onClick={() => setRange(r.code)}
            title={r.h ? `Headlines from the last ${r.code.replace('H', ' hours').replace('D', ' days')}` : 'Headlines from any time'}
          >
            {r.code}
          </button>
        ))}
        {ticker && (
          <button
            className={`${styles.tab} ${styles.tabTicker} ${onlyTicker ? styles.tabActive : ''}`}
            onClick={() => setOnlyTicker((v) => !v)}
            title={`Show only headlines mentioning ${ticker}`}
          >
            ${ticker}
          </button>
        )}
      </div>

      {/* The arrows are a word-list heuristic; say so where people read them. */}
      <p className={styles.newsLegend}>
        ▲ ▼ = keyword tone of the headline, not a sentiment model or the market&rsquo;s reaction
      </p>
      <div className={styles.newsList}>
        {loading && <div className={styles.newsMsg}>Loading headlines…</div>}
        {error && !loading && <div className={styles.newsMsg}>{error}</div>}
        {!loading && !error && view.length === 0 && (
          <div className={styles.newsMsg}>
            {items.length === 0
              ? 'No headlines from these sources yet.'
              : 'No headlines match these filters.'}
          </div>
        )}
        {!loading && !error &&
          groups.map(({ lead: it, dupes }, i) => (
            <React.Fragment key={it.link || it.title || i}>
              <a className={`${styles.row} ${matchesTicker(it, ticker) ? styles.rowMatch : ''}`} href={it.link} target="_blank" rel="noreferrer">
                <time className={styles.rowTime} dateTime={isNaN(new Date(it.pubDate)) ? undefined : new Date(it.pubDate).toISOString()} title={timeTitle(it.pubDate)}>
                  {timeAgo(it.pubDate)}
                </time>
                <span className={`${styles.rowImpactDot} ${styles['imp_' + it.impact]}`} />
                <span className={styles.rowSrc}>{it.source}</span>
                <span className={styles.rowTitle}>{it.title}</span>
                <span className={`${styles.rowImpact} ${styles['imp_' + it.impact]}`}>
                  {it.tags.map((t) => (<span key={t} className={styles.tag}>{t}</span>))}
                  <span title="Keyword tone of the headline, not a sentiment model or the market's reaction">
                    {arrow(it.impact)}
                  </span>
                </span>
              </a>
              {/* Same story from other outlets: folded, each still linked and attributed. */}
              {dupes.length > 0 && (
                <details className={styles.dupes}>
                  <summary>
                    +{dupes.length} more source{dupes.length === 1 ? '' : 's'}: {dupes.map((d) => d.source).join(', ')}
                  </summary>
                  {dupes.map((d) => (
                    <a key={d.link || d.title} className={styles.dupeLink} href={d.link} target="_blank" rel="noreferrer">
                      <span className={styles.rowSrc}>{d.source}</span>
                      <time title={timeTitle(d.pubDate)}>{timeAgo(d.pubDate)}</time>
                      <span>{d.title}</span>
                    </a>
                  ))}
                </details>
              )}
            </React.Fragment>
          ))}
      </div>
    </div>
  );
}
