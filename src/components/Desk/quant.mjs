/*
 * Pure maths behind the Quant Desk panels. No React, no fetches — every
 * function takes the Worker's JSON as-is and returns plain arrays/objects, so
 * it is unit-tested in tests/desk-quant.test.mjs.
 */

const DAY_MS = 86400000;
const TRADING_DAYS = 252;

/* ------------------------------------------------------------ portfolio */

/** Daily simple returns from the ledger's equity history [{ t, value }]. */
export function dailyReturns(history) {
  const out = [];
  for (let i = 1; i < (history || []).length; i++) {
    const a = history[i - 1].value, b = history[i].value;
    if (a > 0 && b != null) out.push(b / a - 1);
  }
  return out;
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const stdev = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Annualised Sharpe (rf = 0) of each trailing `win`-day window. */
export function rollingSharpe(returns, win = 20) {
  const out = [];
  for (let i = win; i <= returns.length; i++) {
    const w = returns.slice(i - win, i);
    const sd = stdev(w);
    out.push(sd > 0 ? (mean(w) / sd) * Math.sqrt(TRADING_DAYS) : 0);
  }
  return out;
}

/** Percent below the running peak at each point (0 at a new high, negative under water). */
export function drawdowns(values) {
  let peak = -Infinity;
  return (values || []).map((v) => {
    peak = Math.max(peak, v);
    return peak > 0 ? (v / peak - 1) * 100 : 0;
  });
}

/** One-day historical VaR at `conf` as a positive fraction of equity (null if too little history). */
export function historicalVar(returns, conf = 0.95) {
  if (!returns || returns.length < 10) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((1 - conf) * sorted.length) - 1);
  return Math.max(0, -sorted[idx]);
}

/* ------------------------------------------------------- option pricing */

const RATE = 0.045;
const YEAR_MS = 365 * DAY_MS;

/** OCC option symbol (AMD261120C00500000) -> { root, expiryMs, type, strike }, else null. */
export function parseOptionSymbol(sym) {
  const m = /^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym || '');
  if (!m) return null;
  return {
    root: m[1],
    // Options stop trading at the 4pm New York close; 20:00 UTC is close enough year-round.
    expiryMs: Date.UTC(2000 + +m[2], +m[3] - 1, +m[4], 20),
    type: m[5] === 'C' ? 'call' : 'put',
    strike: parseInt(m[6], 10) / 1000,
  };
}

function normCdf(x) {
  // Φ(x) = ½(1 + erf(x/√2)), erf by Abramowitz-Stegun 7.1.26 (|error| < 1.5e-7).
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

/** Black-Scholes price of a European call/put; T in years. Intrinsic value at or past expiry. */
export function bsPrice(S, K, T, sigma, type, r = RATE) {
  if (!(T > 0) || !(sigma > 0)) return Math.max(0, type === 'call' ? S - K : K - S);
  const sd = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / sd;
  const d2 = d1 - sd;
  return type === 'call'
    ? S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2)
    : K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

/** Black-Scholes delta (per share). */
export function bsDelta(S, K, T, sigma, type, r = RATE) {
  if (!(T > 0) || !(sigma > 0)) return type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  return type === 'call' ? normCdf(d1) : normCdf(d1) - 1;
}

/** The volatility at which Black-Scholes reproduces `price` (bisection), or null if no such vol. */
export function impliedVol(price, S, K, T, type, r = RATE) {
  if (!(price > 0) || !(S > 0) || !(T > 0)) return null;
  let lo = 1e-4, hi = 5;
  if (price < bsPrice(S, K, T, lo, type, r) || price > bsPrice(S, K, T, hi, type, r)) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (bsPrice(S, K, T, mid, type, r) > price) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Portfolio P&L if every underlying moved by the same percentage, for shocks
 * from −range% to +range%. Stock is linear in its market value (Alpaca reports
 * shorts negative). Options are repriced with Black-Scholes at their own
 * implied vol, backed out of their current price, which needs the
 * underlying's price in `spots`; an option without one is listed in
 * `unmodeled` and left out rather than mis-modelled as stock. `net` is the
 * dollar delta: stock value plus each option's delta × 100 × spot.
 */
export function pnlProfile(positions, range = 10, steps = 41, { spots = {}, now = Date.now() } = {}) {
  const legs = [];
  const unmodeled = [];
  let net = 0;
  for (const p of positions || []) {
    const opt = parseOptionSymbol(p.symbol);
    if (!opt) {
      net += p.marketValue || 0;
      legs.push((shock) => (p.marketValue || 0) * shock / 100);
      continue;
    }
    const S = spots[opt.root];
    const T = (opt.expiryMs - now) / YEAR_MS;
    const contracts = (p.side === 'short' ? -1 : 1) * Math.abs(p.qty || 0);
    const iv = impliedVol(p.price, S, opt.strike, T, opt.type);
    if (!(S > 0) || !contracts || iv == null) { unmodeled.push(p.symbol); continue; }
    const v0 = bsPrice(S, opt.strike, T, iv, opt.type);
    net += contracts * 100 * S * bsDelta(S, opt.strike, T, iv, opt.type);
    legs.push((shock) => contracts * 100 * (bsPrice(S * (1 + shock / 100), opt.strike, T, iv, opt.type) - v0));
  }
  const out = [];
  for (let i = 0; i < steps; i++) {
    const shock = -range + (2 * range * i) / (steps - 1);
    out.push({ shock, pnl: legs.reduce((s, leg) => s + leg(shock), 0) });
  }
  return { net, points: out, unmodeled };
}

/** Each position's share of gross exposure, largest first. */
export function positionWeights(positions, limit = 6) {
  const gross = (positions || []).reduce((s, p) => s + Math.abs(p.marketValue || 0), 0);
  if (!gross) return [];
  return [...positions]
    .sort((a, b) => Math.abs(b.marketValue || 0) - Math.abs(a.marketValue || 0))
    .slice(0, limit)
    .map((p) => ({
      symbol: p.symbol,
      weight: Math.abs(p.marketValue || 0) / gross,
      short: (p.marketValue || 0) < 0,
      plPct: p.unrealizedPLpct,
    }));
}

/* --------------------------------------------------------------- market */

/** Annualised close-to-close volatility over the last `n` daily bars, as a fraction. */
export function realizedVol(bars, n = 20) {
  const closes = (bars || []).map((b) => b.close).filter((c) => c > 0);
  if (closes.length < n + 1) return null;
  const tail = closes.slice(-(n + 1));
  const lr = [];
  for (let i = 1; i < tail.length; i++) lr.push(Math.log(tail[i] / tail[i - 1]));
  return stdev(lr) * Math.sqrt(TRADING_DAYS);
}

/** Rolling realised vol for every window, oldest first (for a sparkline). */
export function realizedVolSeries(bars, n = 20) {
  const out = [];
  for (let end = n + 1; end <= (bars || []).length; end++) {
    out.push(realizedVol(bars.slice(0, end), n));
  }
  return out;
}

// The out-of-the-money side quotes the cleaner IV: puts below spot, calls above.
function otmIv(row, spot) {
  const primary = row.k >= spot ? row.civ : row.piv;
  const other = row.k >= spot ? row.piv : row.civ;
  const iv = primary > 0 ? primary : other;
  return iv > 0.01 && iv < 3 ? iv : null;
}

/**
 * At-the-money implied vol: the strike closest to spot on the first expiry at
 * least `minDays` out (0DTE IV is noisy), falling back to the front expiry.
 */
export function atmIv(chain, minDays = 5, now = Date.now()) {
  if (!chain || !chain.spot || !Array.isArray(chain.rows) || !chain.rows.length) return null;
  const exps = [...new Set(chain.rows.map((r) => r.e))].sort((a, b) => a - b);
  const exp = exps.find((e) => e - now >= minDays * DAY_MS) ?? exps[exps.length - 1];
  let best = null;
  for (const r of chain.rows) {
    if (r.e !== exp) continue;
    const iv = otmIv(r, chain.spot);
    if (iv == null) continue;
    if (!best || Math.abs(r.k - chain.spot) < Math.abs(best.k - chain.spot)) best = { k: r.k, iv };
  }
  return best ? best.iv : null;
}

/**
 * Regular grid for the 3-D surface: rows = expiries (days out), columns =
 * moneyness K/S from `lo` to `hi`. Each expiry's smile is linearly
 * interpolated onto the columns and held flat past its last quoted strike.
 * Expiries with fewer than 4 usable strikes are dropped.
 */
export function ivSurface(chain, { lo = 0.85, hi = 1.15, cols = 25, maxExpiries = 8, now = Date.now() } = {}) {
  if (!chain || !chain.spot || !Array.isArray(chain.rows)) return null;
  const S = chain.spot;
  const byExp = new Map();
  for (const r of chain.rows) {
    const iv = otmIv(r, S);
    if (iv == null) continue;
    const m = r.k / S;
    if (m < lo - 0.05 || m > hi + 0.05) continue;
    if (!byExp.has(r.e)) byExp.set(r.e, []);
    byExp.get(r.e).push({ m, iv });
  }
  const m = Array.from({ length: cols }, (_, i) => lo + ((hi - lo) * i) / (cols - 1));
  const rows = [];
  for (const [e, pts] of [...byExp.entries()].sort((a, b) => a[0] - b[0])) {
    if (pts.length < 4) continue;
    pts.sort((a, b) => a.m - b.m);
    const z = m.map((x) => {
      if (x <= pts[0].m) return pts[0].iv;
      if (x >= pts[pts.length - 1].m) return pts[pts.length - 1].iv;
      let j = 1;
      while (pts[j].m < x) j++;
      const a = pts[j - 1], b = pts[j];
      return a.iv + ((b.iv - a.iv) * (x - a.m)) / (b.m - a.m || 1);
    });
    rows.push({ days: Math.max(0, (e - now) / DAY_MS), z });
    if (rows.length >= maxExpiries) break;
  }
  if (rows.length < 2) return null;
  let zMin = Infinity, zMax = -Infinity;
  for (const r of rows) for (const v of r.z) { zMin = Math.min(zMin, v); zMax = Math.max(zMax, v); }
  return { m, rows, zMin, zMax };
}

/**
 * Open-interest "depth" around spot: walking outward from the current price,
 * cumulative put OI on strikes below it and cumulative call OI above it.
 * Strikes beyond ±`band` (fraction of spot) are ignored.
 */
export function oiDepth(chain, band = 0.15) {
  if (!chain || !chain.spot || !Array.isArray(chain.rows)) return null;
  const S = chain.spot;
  const byK = new Map();
  for (const r of chain.rows) {
    if (Math.abs(r.k / S - 1) > band + 1e-9) continue;
    const rec = byK.get(r.k) || { k: r.k, call: 0, put: 0 };
    rec.call += r.coi || 0;
    rec.put += r.poi || 0;
    byK.set(r.k, rec);
  }
  const strikes = [...byK.values()].sort((a, b) => a.k - b.k);
  const below = strikes.filter((s) => s.k < S).reverse();
  const above = strikes.filter((s) => s.k >= S);
  let c = 0;
  const puts = below.map((s) => ({ k: s.k, cum: (c += s.put) })).reverse();
  c = 0;
  const calls = above.map((s) => ({ k: s.k, cum: (c += s.call) }));
  if (!puts.length && !calls.length) return null;
  return { spot: S, puts, calls, putTotal: puts.length ? puts[0].cum : 0, callTotal: calls.length ? calls[calls.length - 1].cum : 0 };
}

/** Per-sector breadth from a quote map: how many names are up today and the average move. */
export function sectorBreadth(sections, quotes) {
  return sections.map((s) => {
    const chg = s.tickers.map((t) => quotes[t] && quotes[t].changePct).filter((v) => v != null && !Number.isNaN(v));
    return {
      name: s.name,
      total: chg.length,
      up: chg.filter((v) => v > 0).length,
      avg: chg.length ? mean(chg) : null,
    };
  });
}
