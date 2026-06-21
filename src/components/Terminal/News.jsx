import React, { useEffect, useState, useCallback, useMemo } from 'react';
import styles from './styles.module.css';

/*
 * News terminal — live financial headlines from a curated set of RSS feeds
 * (Fincept feed list) fetched through a CORS proxy and parsed client-side.
 * Features: category tabs, time-range filter, text/ticker search, relative
 * timestamps, and a heuristic impact indicator (keyword sentiment + ticker tags).
 */

const FEEDS = [
  // MKT — Markets
  { source: 'MARKETWATCH', cat: 'MKT', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
  { source: 'CNBC', cat: 'MKT', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { source: 'INVESTING', cat: 'MKT', url: 'https://www.investing.com/rss/news.rss' },
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
];

const CATEGORIES = ['ALL', 'MKT', 'ECO', 'TECH', 'NRG', 'CRPT', 'GEO', 'REG'];
const RANGES = [
  { code: '1H', h: 1 },
  { code: '6H', h: 6 },
  { code: '24H', h: 24 },
  { code: '7D', h: 168 },
  { code: '30D', h: 720 },
  { code: 'ALL', h: null },
];

const PROXIES = [
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

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
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
      return { title, link: link.trim(), pubDate: date.trim(), source: feed.source, cat: feed.cat, impact: a.impact, tags: a.tags };
    })
    .filter((x) => x.title);
}

async function fetchFeed(feed) {
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(feed.url));
      if (!res.ok) continue;
      const items = parseFeed(await res.text(), feed);
      if (items.length) return items;
    } catch (e) { /* next proxy */ }
  }
  return [];
}

export default function News() {
  const [cat, setCat] = useState('ALL');
  const [range, setRange] = useState('24H');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Re-render every second so the relative timestamps tick up live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async (c, initial) => {
    if (initial) { setLoading(true); setError(null); }
    const feeds = FEEDS.filter((f) => c === 'ALL' || f.cat === c);
    const results = await Promise.allSettled(feeds.map(fetchFeed));
    const fresh = [];
    for (const r of results) if (r.status === 'fulfilled') fresh.push(...r.value);
    setItems((prev) => {
      const base = initial ? [] : prev;
      const seen = new Set();
      const out = [];
      for (const it of [...fresh, ...base]) {
        const key = it.link || it.title;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(it);
      }
      out.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      return out.slice(0, 120);
    });
    if (initial) {
      setLoading(false);
      if (fresh.length === 0) setError('Could not load headlines right now. Try refresh.');
    }
  }, []);

  useEffect(() => {
    load(cat, true);
    const id = setInterval(() => load(cat, false), 30 * 1000);
    return () => clearInterval(id);
  }, [cat, load]);

  const view = useMemo(() => {
    const r = RANGES.find((x) => x.code === range);
    const cutoff = r && r.h ? Date.now() - r.h * 3600 * 1000 : null;
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (cutoff) { const d = new Date(it.pubDate); if (!isNaN(d) && d.getTime() < cutoff) return false; }
      if (q && !it.title.toLowerCase().includes(q) && !it.tags.some((t) => t.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, range, query]);

  const arrow = (imp) => (imp === 'pos' ? '▲' : imp === 'neg' ? '▼' : '–');

  return (
    <div className={styles.news}>
      <div className={styles.termBar}>
        <input
          className={styles.searchBox}
          placeholder="Search headlines or $ticker…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className={styles.refreshBtn} onClick={() => load(cat, true)} title="Refresh">↻</button>
      </div>
      <div className={styles.termRow}>
        {CATEGORIES.map((c) => (
          <button key={c} className={`${styles.tab} ${c === cat ? styles.tabActive : ''}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className={styles.termRow}>
        {RANGES.map((r) => (
          <button key={r.code} className={`${styles.tab} ${r.code === range ? styles.tabActive : ''}`} onClick={() => setRange(r.code)}>{r.code}</button>
        ))}
      </div>

      <div className={styles.newsList}>
        {loading && <div className={styles.newsMsg}>Loading headlines…</div>}
        {error && !loading && <div className={styles.newsMsg}>{error}</div>}
        {!loading && !error && view.length === 0 && <div className={styles.newsMsg}>No headlines match.</div>}
        {!loading && !error &&
          view.map((it, i) => (
            <a key={it.link || it.title || i} className={styles.row} href={it.link} target="_blank" rel="noreferrer">
              <span className={styles.rowTime}>{timeAgo(it.pubDate)}</span>
              <span className={`${styles.rowImpactDot} ${styles['imp_' + it.impact]}`} />
              <span className={styles.rowSrc}>{it.source}</span>
              <span className={styles.rowTitle}>{it.title}</span>
              <span className={`${styles.rowImpact} ${styles['imp_' + it.impact]}`}>
                {it.tags.map((t) => (<span key={t} className={styles.tag}>{t}</span>))}
                {arrow(it.impact)}
              </span>
            </a>
          ))}
      </div>
    </div>
  );
}
