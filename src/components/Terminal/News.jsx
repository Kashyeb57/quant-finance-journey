import React, { useEffect, useState, useCallback } from 'react';
import styles from './styles.module.css';

/*
 * News feed — pulls live headlines from a curated set of financial RSS feeds
 * (sourced from the Fincept Terminal feed list) via the keyless rss2json proxy,
 * which is CORS-enabled so it works from the static site in the browser.
 */

const FEEDS = [
  { name: 'MarketWatch', source: 'MARKETWATCH', category: 'Markets', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
  { name: 'CNBC Finance', source: 'CNBC', category: 'Markets', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { name: 'Investing.com', source: 'INVESTING.COM', category: 'Markets', url: 'https://www.investing.com/rss/news.rss' },
  { name: 'Seeking Alpha', source: 'SEEKING ALPHA', category: 'Markets', url: 'https://seekingalpha.com/market_currents.xml' },
  { name: 'BBC Business', source: 'BBC', category: 'Markets', url: 'http://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'CoinDesk', source: 'COINDESK', category: 'Crypto', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'CoinTelegraph', source: 'COINTELEGRAPH', category: 'Crypto', url: 'https://cointelegraph.com/rss' },
  { name: 'TechCrunch', source: 'TECHCRUNCH', category: 'Tech', url: 'https://techcrunch.com/feed/' },
  { name: 'SEC Press', source: 'SEC', category: 'Regulatory', url: 'https://www.sec.gov/news/pressreleases.rss' },
  { name: 'Federal Reserve', source: 'FED', category: 'Regulatory', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
];

const CATEGORIES = ['All', 'Markets', 'Crypto', 'Tech', 'Regulatory'];

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function fetchFeed(feed) {
  const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&count=8`;
  const res = await fetch(api);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok' || !Array.isArray(data.items)) throw new Error('bad feed');
  return data.items.map((it) => ({
    title: it.title,
    link: it.link,
    pubDate: it.pubDate,
    source: feed.source,
    category: feed.category,
  }));
}

export default function News() {
  const [category, setCategory] = useState('All');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (cat) => {
    setLoading(true);
    setError(null);
    const feeds = FEEDS.filter((f) => cat === 'All' || f.category === cat);
    const results = await Promise.allSettled(feeds.map(fetchFeed));
    const all = [];
    for (const r of results) if (r.status === 'fulfilled') all.push(...r.value);
    all.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    if (all.length === 0) setError('Could not load headlines right now. Try refresh.');
    setItems(all.slice(0, 40));
    setLoading(false);
  }, []);

  useEffect(() => {
    load(category);
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
        <button className={styles.refreshBtn} onClick={() => load(category)} title="Refresh">↻</button>
      </div>

      <div className={styles.newsList}>
        {loading && <div className={styles.newsMsg}>Loading headlines…</div>}
        {error && !loading && <div className={styles.newsMsg}>{error}</div>}
        {!loading && !error &&
          items.map((it, i) => (
            <a key={i} className={styles.newsItem} href={it.link} target="_blank" rel="noreferrer">
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
