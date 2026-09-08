/*
 * Market data client for the Terminal.
 *
 * Primary source is our own Cloudflare Worker at /_m/* (see market/README.md),
 * which holds the Alpaca credentials server-side. If that Worker is not
 * deployed yet — or is briefly unavailable — we fall back to a keyless public
 * source so the Terminal keeps working instead of showing an empty panel.
 *
 * Worker calls go through `src/lib/market.js` so this file no longer hardcodes
 * the API origin; the keyless fallbacks below are third-party URLs and are
 * fetched directly.
 */

import { getBars as workerBars, getSnapshot as workerSnapshot } from '../../lib/market';

// Re-exported so existing `import { fmtPrice } from './marketData'` call sites
// keep working while the shared implementations live in src/lib/format.js.
export { fmtPrice, fmtVolume } from '../../lib/format';

const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
];

// Our timeframe keys -> Yahoo's (interval, range) for the fallback path.
export const TIMEFRAMES = [
  { key: '1Min',  label: '1m',  yahoo: { interval: '1m',  range: '1d'  }, pollMs: 2500 },
  { key: '3Min',  label: '3m',  yahoo: { interval: '1m',  range: '1d'  }, pollMs: 3000, aggSec: 180 },
  { key: '5Min',  label: '5m',  yahoo: { interval: '5m',  range: '5d'  }, pollMs: 5000 },
  { key: '15Min', label: '15m', yahoo: { interval: '15m', range: '5d'  }, pollMs: 8000 },
  { key: '1Hour', label: '1H',  yahoo: { interval: '60m', range: '1mo' }, pollMs: 20000 },
  { key: '1Day',  label: '1D',  yahoo: { interval: '1d',  range: '1y'  }, pollMs: 60000 },
];

export function tfConfig(key) {
  return TIMEFRAMES.find((t) => t.key === key) || TIMEFRAMES[0];
}

/* ---------------------------------------------------------------- helpers */

async function getJson(url, opts) {
  const res = await fetch(url, { cache: 'no-store', ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function viaProxy(target) {
  for (const p of PROXIES) {
    try {
      const res = await fetch(p(target), { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      let j = JSON.parse(text);
      if (j && typeof j.contents === 'string') j = JSON.parse(j.contents);
      return j;
    } catch (e) {
      /* try next proxy */
    }
  }
  throw new Error('All proxies failed');
}

function parseYahooChart(j) {
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp || !r.indicators || !r.indicators.quote) {
    return { bars: [], meta: null };
  }
  const ts = r.timestamp;
  const q = r.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) continue;
    bars.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume ? q.volume[i] : null });
  }
  return { bars, meta: r.meta || null };
}

/* ------------------------------------------------------ crypto (Coinbase) */

// Crypto tickers use the "BTC-USD" form. Coinbase's public API is CORS-enabled,
// keyless, US-available, and 24/7 — so crypto works straight from the browser
// (no Worker, no proxy) and keeps ticking on weekends.
export function isCrypto(symbol) {
  return /-USD$/.test(symbol);
}

const COINBASE = 'https://api.exchange.coinbase.com';
// Coinbase's native candle granularities (seconds) — note: no native 3-minute.
const CB_GRAN = { '1Min': 60, '5Min': 300, '15Min': 900, '1Hour': 3600, '1Day': 86400 };
// Candle length in seconds per timeframe (used by the live stream + countdown).
const TF_SEC = { '1Min': 60, '3Min': 180, '5Min': 300, '15Min': 900, '1Hour': 3600, '1Day': 86400 };

export function cryptoGran(tfKey) {
  return TF_SEC[tfKey] || 60;
}

// Aggregate finer bars into `granSec` buckets aligned to clean boundaries.
function bucketBars(bars, granSec) {
  const out = [];
  let cur = null;
  for (const b of bars) {
    const t = Math.floor(b.time / granSec) * granSec;
    if (!cur || cur.time !== t) {
      if (cur) out.push(cur);
      cur = { time: t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
    } else {
      if (b.high > cur.high) cur.high = b.high;
      if (b.low < cur.low) cur.low = b.low;
      cur.close = b.close;
      cur.volume += b.volume || 0;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function toCbBars(arr) {
  // Each Coinbase candle: [ time(sec), low, high, open, close, volume ], newest first.
  return (Array.isArray(arr) ? arr : [])
    .map((k) => ({ time: k[0], open: +k[3], high: +k[2], low: +k[1], close: +k[4], volume: +k[5] }))
    .sort((a, b) => a.time - b.time);
}

async function cryptoBars(symbol, tfKey) {
  // Coinbase has no native 3-minute candle — build it by bucketing 1-minute data.
  if (tfKey === '3Min') {
    const arr = await getJson(`${COINBASE}/products/${symbol}/candles?granularity=60`);
    return bucketBars(toCbBars(arr), 180);
  }
  const gran = CB_GRAN[tfKey] || 60;
  const arr = await getJson(`${COINBASE}/products/${symbol}/candles?granularity=${gran}`);
  return toCbBars(arr);
}

async function cryptoSnapshot(symbol) {
  const s = await getJson(`${COINBASE}/products/${symbol}/stats`);
  const last = +s.last;
  const open = +s.open; // 24h-ago open, used as the reference close
  const change = last - open;
  return {
    symbol,
    last,
    prevClose: open,
    change,
    changePct: open ? (change / open) * 100 : null,
    dayHigh: +s.high,
    dayLow: +s.low,
    volume: +s.volume,
    source: 'crypto',
  };
}

/* ------------------------------------------------------------------ bars */

export async function fetchBars(symbol, tfKey) {
  if (isCrypto(symbol)) {
    try {
      return { bars: await cryptoBars(symbol, tfKey), source: 'crypto' };
    } catch (e) {
      return { bars: [], source: 'none' };
    }
  }

  // 1. our Worker (real feed, credentials stay server-side)
  try {
    const j = await workerBars(symbol, tfKey);
    if (j && Array.isArray(j.bars) && j.bars.length) {
      return { bars: j.bars, source: 'worker' };
    }
  } catch (e) {
    /* fall through */
  }

  // 2. keyless fallback
  const { yahoo, aggSec } = tfConfig(tfKey);
  const bucket = Math.floor(Date.now() / 30000); // cache-bust every 30s
  const target =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${yahoo.range}&interval=${yahoo.interval}&includePrePost=true&_=${bucket}`;
  try {
    let { bars } = parseYahooChart(await viaProxy(target));
    if (aggSec) bars = bucketBars(bars, aggSec); // e.g. 1m -> 3m
    return { bars, source: 'fallback' };
  } catch (e) {
    return { bars: [], source: 'none' };
  }
}

/* -------------------------------------------------------------- snapshot */

export async function fetchSnapshot(symbol) {
  if (isCrypto(symbol)) {
    try {
      return await cryptoSnapshot(symbol);
    } catch (e) {
      return null;
    }
  }

  // 1. our Worker
  try {
    const j = await workerSnapshot(symbol);
    if (j && j.last != null) return { ...j, source: 'worker' };
  } catch (e) {
    /* fall through */
  }

  // 2. keyless fallback — derive the same numbers from Yahoo's chart meta
  const bucket = Math.floor(Date.now() / 30000);
  const target =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=1d&interval=1m&includePrePost=true&_=${bucket}`;
  try {
    const j = await viaProxy(target);
    const { bars, meta } = parseYahooChart(j);
    // Prefer the freshest trade — the last bar reflects pre/post-market too, so
    // the price still updates outside regular hours — then the regular price.
    const last = (bars.length ? bars[bars.length - 1].close : null) || (meta && meta.regularMarketPrice) || null;
    const prevClose = (meta && (meta.chartPreviousClose || meta.previousClose)) || null;
    const change = last != null && prevClose != null ? last - prevClose : null;
    return {
      symbol,
      last,
      prevClose,
      change,
      changePct: change != null && prevClose ? (change / prevClose) * 100 : null,
      dayHigh: meta && meta.regularMarketDayHigh != null ? meta.regularMarketDayHigh : null,
      dayLow: meta && meta.regularMarketDayLow != null ? meta.regularMarketDayLow : null,
      volume: meta && meta.regularMarketVolume != null ? meta.regularMarketVolume : null,
      source: 'fallback',
    };
  } catch (e) {
    return null;
  }
}

/* --------------------------------------------------------- market status */

/**
 * US equities regular session: Mon-Fri 09:30-16:00 America/New_York.
 * (Holidays are not tracked — it will say "open" on a market holiday.)
 */
export function marketStatus(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;

  const day = get('weekday');
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const mins = hour * 60 + minute;

  if (day === 'Sat' || day === 'Sun') return { state: 'closed', label: 'Market closed — weekend' };
  if (mins >= 570 && mins < 960) return { state: 'open', label: 'Market open' };
  if (mins >= 240 && mins < 570) return { state: 'pre', label: 'Pre-market' };
  if (mins >= 960 && mins < 1200) return { state: 'after', label: 'After hours' };
  return { state: 'closed', label: 'Market closed' };
}

/* fmtPrice / fmtVolume now live in src/lib/format.js and are re-exported at the
 * top of this file, so every page formats prices and volume identically. */
