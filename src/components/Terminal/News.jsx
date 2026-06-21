import React, { useEffect, useState, useCallback } from 'react';
import styles from './styles.module.css';

/*
 * News feed — pulls live headlines from a curated set of financial RSS feeds
 * (sourced from the Fincept Terminal feed list). RSS feeds block cross-origin
 * browser requests, so we fetch through a raw CORS proxy and parse the XML
 * client-side. Two proxies are tried in order for resilience.
 */

const FEEDS = [
  { name: 'MarketWatch', source: 'MARKETWATCH', category: 'Markets', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
  { name: 'CNBC Finance', source: 'CNBC', category: 'Markets', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { name: 'Investing.com', source: 'INVESTING.COM', category: 'Markets', url: 'https://www.investing.com/rss/news.rss' },
  { name: 'Seeking Alpha', source: 'SEEKING ALPHA', category: 'Markets', url: 'https://seekingalpha.com/market_currents.xml' },
  { name: 'BBC Business', source: 'BBC', category: 'Markets', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'CoinDesk', source: 'COINDESK', category: 'Crypto', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph', source: 'COINTELEGRAPH', category: 'Crypto', url: 'https://cointelegraph.com/rss' },
  { name: 'TechCrunch', source: 'TECHCRUNCH', category: 'Tech', url: 'https://techcrunch.com/feed/' },
  { name: 'SEC Press', source: 'SEC', category: 'Regulatory', url: 'https://www.sec.gov/news/pressreleases.rss' },
  { name: 'Federal Reserve', source: 'FED', category: 'Regulatory', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
];

const CATEGORIES = ['All', 'Markets', 'Crypto', 'Tech', 'Regulatory'];

const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
        if (href) {
          if (l.getAttribute('rel') !== 'self') { link = href; break; }
          if (!link) link = href;
        } else if (l.textContent) { link = l.textContent.trim(); break; }
      }
      const date =
        n.querySelector('pubDate')?.textContent ||
        n.querySelector('published')?.textContent ||
        n.querySelector('updated')?.textContent ||
        n.getElementsByTagName('dc:date')[0]?.textContent ||
        '';
      return { title, link: link.trim(), pubDate: date.trim(), source: feed.source, category: feed.category };
    })
    .filter((x) => x.title);
}

async function fetchFeed(feed) {
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(feed.url));
      if (!res.ok) continue;
      const text = await res.text();
      const items = parseFeed(text, feed);
      if (items.length) return items;
    } catch (e) {
      /* try next proxy */
    }
  }
  return [];
}

export default function News() {
  const [category, setCategory] = useState('All');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (cat, initial) => {
    if (initial) {
      setLoading(true);
      setError(null);
    }
    const feeds = FEEDS.filter((f) => cat === 'All' || f.category === cat);
    const results = await Promise.allSettled(feeds.map(fetchFeed));
    const fresh = [];
    for (const r of results) if (r.status === 'fulfilled') fresh.push(...r.value);

    // Merge fresh headlines with existing ones, de-duplicated by link (or title),
    // newest first. On a category switch / manual refresh we start clean.
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
      return out.slice(0, 60);
    });

    if (initial) {
      setLoading(false);
      if (fresh.length === 0) setError('Could not load headlines right now. Try refresh.');
    }
  }, []);

  useEffect(() => {
    load(category, true);
    // Auto-refresh every 5 seconds; new unique stories merge in (no duplicates, no flash).
    const id = setInterval(() => load(category, false), 5 * 1000);
    return () => clearInterval(id);
  }, [category, load]);

  return (
    <div className={styles.news}>
      <div className={styles.newsControls}>
        <div className={styles.catChips}>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={`${styles.catChip} ${c === category ? styles.catChipActive : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <button className={styles.refreshBtn} onClick={() => load(category, true)} title="Refresh">↻</button>
      </div>

      <div className={styles.newsList}>
        {loading && <div className={styles.newsMsg}>Loading headlines…</div>}
        {error && !loading && <div className={styles.newsMsg}>{error}</div>}
        {!loading && !error &&
          items.map((it, i) => (
            <a key={it.link || it.title || i} className={styles.newsItem} href={it.link} target="_blank" rel="noreferrer">
              <div className={styles.newsMeta}>
                <span className={styles.newsSource}>{it.source}</span>
                <span className={styles.newsTime}>{timeAgo(it.pubDate)}</span>
              </div>
              <div className={styles.newsTitle}>{it.title}</div>
            </a>
          ))}
      </div>
    </div>
  );
}
