import React, {useEffect, useRef, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import PageHeader from '@site/src/components/PageHeader';
import {fmtPrice, isCrypto, fetchSnapshot} from '@site/src/components/Terminal/marketData';
import {SECTIONS} from '@site/src/components/Terminal/tickers';
import {getBars} from '@site/src/lib/market';
import styles from './portfolio.module.css';

/*
 * Portfolio — "Spatial Command Deck". A Robinhood-grade read of the Alpaca
 * *paper* account, plus the analytics Robinhood never ships. Two audiences:
 *   • Everyone      — a live, read-only view. Each held symbol's snapshot is
 *                     polled every 5s to tick the equity value and position marks
 *                     (Alpaca's free tier allows one stream, so not per-symbol
 *                     sockets).
 *   • The owner     — unlocks a buy/sell panel with a passphrase (stored only in
 *                     the browser, sent as X-Trade-Token). The real gate is the
 *                     Worker: POST /_m/order and /_m/cancel reject anything
 *                     without a valid TRADE_TOKEN. Paper account only.
 */

const POLL_MS = 30000;

// A snapshot price may override Alpaca's own position mark only if its trade is
// recent. The snapshot comes from the IEX feed, which doesn't trade overnight or
// at weekends, while Alpaca marks positions to overnight-session prices — so a
// "last" from Friday afternoon was replacing a fresher Sunday-night mark and put
// the page $1.2k away from Alpaca's own account value. No timestamp (the keyless
// fallback) counts as stale.
const FRESH_TRADE_MS = 2 * 60 * 1000;
function isFreshTrade(at) {
  if (!at) return false;
  // Alpaca sends nanoseconds; trim to milliseconds so every browser parses it.
  const ms = Date.parse(String(at).replace(/(\.\d{3})\d+/, '$1'));
  return Number.isFinite(ms) && Date.now() - ms <= FRESH_TRADE_MS;
}
const TRADE_TOKEN_KEY = 'pf_trade_token';
// Tradeable universe = the terminal's sectors, minus crypto (the equity order
// path can't place -USD pairs). Grouped so the picker mirrors the terminal.
const TRADE_SECTIONS = SECTIONS
  .map((s) => ({name: s.name, tickers: s.tickers.filter((t) => !isCrypto(t))}))
  .filter((s) => s.tickers.length);
const DEFAULT_SYMBOL = 'AMD';
const PENDING = ['new', 'accepted', 'partially_filled', 'pending_new', 'held', 'accepted_for_bidding'];

const money = (v) => (v == null || Number.isNaN(v) ? '—' : `$${fmtPrice(v)}`);
const signedMoney = (v) => (v == null || Number.isNaN(v) ? '—' : `${v >= 0 ? '+' : '−'}$${fmtPrice(Math.abs(v))}`);
const signedPct = (v) => (v == null || Number.isNaN(v) ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`);
const pctWhole = (v) => (v == null || Number.isNaN(v) ? '—' : `${v.toFixed(0)}%`);

// Zero is NEUTRAL — a flat/dead account must not glow green. null → neutral too.
const dirCls = (v) => (v == null || v === 0 ? '' : v > 0 ? styles.up : styles.down);
const caret = (v) => (v == null || v === 0 ? '' : v > 0 ? '▲' : '▾');

// Order/closed timestamps are ISO strings.
function fmtWhen(iso, withTime) {
  if (!iso) return '—';
  try {
    const o = {timeZone: 'America/Chicago', month: 'short', day: '2-digit'};
    if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; o.hour12 = false; }
    return new Intl.DateTimeFormat('en-US', o).format(new Date(iso)) + (withTime ? ' CT' : '');
  } catch (_) { return '—'; }
}

// Trading date (YYYY-MM-DD, New York) of an epoch-seconds stamp. Portfolio
// history stamps day D at 00:00 UTC of D+1 (20:00 New York on D) and daily bars
// at 00:00 New York on D, so both map to D here and can be matched.
function nyDay(sec) {
  try {
    return new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(sec * 1000));
  } catch (_) { return ''; }
}

// Equity-curve timestamps are Alpaca epoch *seconds* (guard covers ms too).
function fmtDay(t) {
  if (t == null) return '';
  const ms = typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(t);
  if (Number.isNaN(ms)) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {timeZone: 'America/Chicago', month: 'short', day: '2-digit'}).format(new Date(ms));
  } catch (_) { return ''; }
}

async function fetchLedger() {
  const res = await fetch('/_m/ledger', {cache: 'no-store'});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postJson(path, token, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Trade-Token': token},
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* The signature line: full-bleed, no axes/grid, a dashed open-baseline, and a
 * scrub that drives the hero above it. Controlled — the parent owns the scrub
 * index so the hero and the chart read from one source of truth. The paths live
 * in a stretched (aspect-none) SVG for responsive height; the markers are HTML
 * overlays positioned by percent, so dots stay round instead of squashing. */
function EquityChart({points, scrubIdx, onScrub}) {
  const ref = useRef(null);

  if (!points || points.length < 2) {
    return <div className={styles.chartFlat}>Flat line — no open risk. The curve comes alive once the account has a few days of activity.</div>;
  }

  const W = 900, H = 260, PAD = {t: 16, r: 8, b: 16, l: 8};
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const vals = points.map((p) => p.value);
  const vmin = Math.min(...vals), vmax = Math.max(...vals);
  const span = (vmax - vmin) || Math.max(1, vmax * 0.01);
  const lo = vmin - span * 0.16, hiV = vmax + span * 0.16;
  const x = (i) => PAD.l + (i / (points.length - 1)) * iw;
  const y = (v) => PAD.t + ih - ((v - lo) / (hiV - lo)) * ih;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.t + ih).toFixed(1)} L${PAD.l.toFixed(1)},${(PAD.t + ih).toFixed(1)} Z`;

  const start = points[0].value;
  const last = points[points.length - 1].value;
  const up = last >= start;
  const stroke = up ? 'var(--g-500)' : 'var(--amber-500)';

  const sel = scrubIdx == null ? points.length - 1 : scrubIdx;
  const sx = x(sel), sy = y(points[sel].value);
  const pctX = (px) => `${(px / W) * 100}%`;
  const pctY = (py) => `${(py / H) * 100}%`;
  const labelLeft = Math.max(9, Math.min(91, (sx / W) * 100));

  const move = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
    const vx = ((cx - r.left) / r.width) * W;
    let i = Math.round(((vx - PAD.l) / iw) * (points.length - 1));
    i = Math.max(0, Math.min(points.length - 1, i));
    onScrub(i);
  };

  return (
    <div
      ref={ref}
      className={styles.chartBox}
      onMouseMove={move}
      onMouseLeave={() => onScrub(null)}
      onTouchStart={move}
      onTouchMove={move}
      onTouchEnd={() => onScrub(null)}>
      <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Account equity over time">
        <defs>
          <linearGradient id="eqArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="1" stopColor={stroke} stopOpacity="0.012" />
          </linearGradient>
        </defs>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(start)} y2={y(start)} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#eqArea)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {scrubIdx != null && (
          <line x1={sx} x2={sx} y1={PAD.t} y2={PAD.t + ih} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {scrubIdx == null ? (
        <span className={styles.endDot} style={{left: pctX(x(points.length - 1)), top: pctY(y(last)), background: stroke}} aria-hidden="true" />
      ) : (
        <>
          <span className={styles.scrubDot} style={{left: pctX(sx), top: pctY(sy), borderColor: stroke, '--glow': stroke}} aria-hidden="true" />
          <span className={styles.scrubTime} style={{left: `${labelLeft}%`}} aria-hidden="true">{fmtDay(points[sel].t)}</span>
        </>
      )}
    </div>
  );
}

/* Owner-only buy/sell. Hidden from visitors; gated for real by the Worker. */
function TradePanel({token, symbols, onPlaced, onLock}) {
  const [form, setForm] = useState({symbol: DEFAULT_SYMBOL, side: 'buy', qty: ''});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  // Held symbols not already in a sector (e.g. an older buy) still need a home,
  // so you can always sell what you hold.
  const listed = new Set(TRADE_SECTIONS.flatMap((s) => s.tickers));
  const heldExtra = symbols.filter((s) => !listed.has(s));

  const submit = async (e) => {
    e.preventDefault();
    const qty = parseInt(form.qty, 10);
    const symbol = form.symbol.trim().toUpperCase();
    if (!symbol || !(qty > 0)) { setMsg({ok: false, text: 'Enter a symbol and a whole share count.'}); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await postJson('/_m/order', token, {symbol, side: form.side, qty});
      setMsg({ok: true, text: `${form.side === 'buy' ? 'Bought' : 'Sold'} ${qty} ${symbol} — order ${r.order && r.order.status ? r.order.status : 'submitted'}.`});
      setForm((f) => ({...f, qty: ''}));
      onPlaced && onPlaced();
    } catch (err) {
      const m = String(err.message || err);
      setMsg({ok: false, text: m === 'unauthorized' ? 'Passphrase rejected — lock and re-unlock.' : `Order failed: ${m}`});
    } finally { setBusy(false); }
  };

  return (
    <div className={`p-card ${styles.tradeCard}`}>
      <div className={styles.tradeHead}>
        <h2 className={styles.h2}>Trade <span className={styles.count}>owner · paper</span></h2>
        <button type="button" className={styles.lockBtn} onClick={onLock}>Lock</button>
      </div>
      <form className={styles.tradeForm} onSubmit={submit}>
        <div className={styles.sideToggle} role="group" aria-label="Order side">
          <button type="button" className={`${styles.sideBtn} ${form.side === 'buy' ? styles.sideBuy : ''}`} onClick={() => setForm((f) => ({...f, side: 'buy'}))}>Buy</button>
          <button type="button" className={`${styles.sideBtn} ${form.side === 'sell' ? styles.sideSell : ''}`} onClick={() => setForm((f) => ({...f, side: 'sell'}))}>Sell</button>
        </div>
        <select className={`${styles.tradeInput} ${styles.tradeSelect}`} value={form.symbol} onChange={(e) => setForm((f) => ({...f, symbol: e.target.value}))} aria-label="Symbol">
          {heldExtra.length > 0 && (
            <optgroup label="Holdings">
              {heldExtra.map((t) => <option key={t} value={t}>{t}</option>)}
            </optgroup>
          )}
          {TRADE_SECTIONS.map((s) => (
            <optgroup key={s.name} label={s.name}>
              {s.tickers.map((t) => <option key={t} value={t}>{t}</option>)}
            </optgroup>
          ))}
        </select>
        <input className={styles.tradeInput} type="number" min="1" step="1" value={form.qty} onChange={(e) => setForm((f) => ({...f, qty: e.target.value}))} placeholder="Shares" aria-label="Shares" />
        <button className={`${styles.submitBtn} ${form.side === 'sell' ? styles.submitSell : ''}`} type="submit" disabled={busy}>
          {busy ? 'Placing…' : `${form.side === 'buy' ? 'Buy' : 'Sell'} at market`}
        </button>
      </form>
      {msg && <p className={`${styles.tradeMsg} ${msg.ok ? styles.tradeOk : styles.tradeErr}`}>{msg.text}</p>}
      <p className={styles.tradeNote}>Market orders · whole shares · paper account. Market orders fill during regular hours.</p>
    </div>
  );
}

function Content() {
  const [state, setState] = useState({status: 'loading'});
  const [scrubIdx, setScrubIdx] = useState(null);
  const [ledgerTab, setLedgerTab] = useState('closed');
  const [livePrices, setLivePrices] = useState({});
  const [token, setToken] = useState('');
  const pullRef = useRef(null);

  // Owner token from the browser (never in the bundle).
  useEffect(() => {
    try { const t = localStorage.getItem(TRADE_TOKEN_KEY); if (t) setToken(t); } catch (_) { /* ignore */ }
  }, []);

  // SPY daily closes, once, as a benchmark for the since-start return. Purely
  // context: if it fails, the benchmark cell just stays empty.
  const [spyBars, setSpyBars] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getBars('SPY', '1Day')
      .then((d) => { if (!cancelled && d && Array.isArray(d.bars)) setSpyBars(d.bars); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      if (document.visibilityState === 'hidden') return;
      try {
        const d = await fetchLedger();
        if (cancelled) return;
        if (d && d.account && !d.error) setState({status: 'ok', data: d});
        else setState((s) => (s.status === 'ok' ? s : {status: 'idle'}));
      } catch (_) {
        if (!cancelled) setState((s) => (s.status === 'ok' ? s : {status: 'idle'}));
      }
    }
    pullRef.current = pull;
    pull();
    const timer = setInterval(pull, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Live prices: poll a cached snapshot for each held symbol every few seconds
  // and roll it into equity + marks. (Websocket streaming was dropped — Alpaca's
  // free plan caps live data at ONE connection, so per-symbol sockets hit a 406
  // "connection limit exceeded". Cached snapshot GETs have no such limit and
  // degrade to a keyless fallback if the Worker is down.)
  const okData = state.status === 'ok' ? state.data : null;
  const symbolsKey = okData ? okData.positions.map((p) => p.symbol).sort().join(',') : '';
  useEffect(() => {
    if (!symbolsKey) return undefined;
    const syms = symbolsKey.split(',').filter(Boolean);
    let cancelled = false;
    async function tick() {
      if (document.visibilityState === 'hidden') return;
      const quotes = await Promise.all(syms.map(async (sym) => {
        try {
          const s = await fetchSnapshot(sym);
          return [sym, s && s.last != null && isFreshTrade(s.at) ? s.last : null];
        } catch (_) { return [sym, null]; }
      }));
      if (cancelled) return;
      setLivePrices((prev) => {
        let changed = false;
        const next = {...prev};
        for (const [sym, price] of quotes) {
          if (price == null) {
            // Stale or unavailable: stop overriding and let Alpaca's mark stand.
            if (sym in next) { delete next[sym]; changed = true; }
          } else if (next[sym] !== price) { next[sym] = price; changed = true; }
        }
        return changed ? next : prev;
      });
    }
    tick();
    const timer = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [symbolsKey]);

  const unlock = () => {
    const t = window.prompt('Owner passphrase to enable trading:');
    if (t == null) return;
    const v = t.trim();
    if (!v) return;
    try { localStorage.setItem(TRADE_TOKEN_KEY, v); } catch (_) { /* ignore */ }
    setToken(v);
  };
  const lock = () => { try { localStorage.removeItem(TRADE_TOKEN_KEY); } catch (_) { /* ignore */ } setToken(''); };
  const owner = !!token;

  if (state.status === 'loading') {
    return (
      <p className={styles.loading}>
        <span className="p-pip" aria-hidden="true" />
        Reading the paper account…
      </p>
    );
  }
  if (state.status === 'idle') {
    return (
      <div className={styles.notice}>
        <div className={styles.noticeTag}>account offline</div>
        <strong>The paper account isn’t reachable right now.</strong>
        <span>This page reads a live Alpaca paper account through the site’s market worker. If it stays blank, the worker or its keys need attention — no real money is ever involved. Meanwhile you can still <Link to="/terminal">watch the tape on the terminal</Link>.</span>
      </div>
    );
  }

  const {account: a, positions, orders, closed, realizedTotal, history, historyPeriod = '3M', asOf} = state.data;

  // Drop Alpaca's pre-funding value:0 padding so the curve doesn't rocket from $0.
  const hist = (history || []).filter((p) => p && Number.isFinite(p.value) && p.value > 0);
  const canScrub = hist.length > 1;
  const sel = scrubIdx == null || !canScrub ? null : Math.min(scrubIdx, hist.length - 1);

  // Live-adjust each position from a fresh snapshot price, then roll that into a
  // live equity + today's P/L so the hero value moves in real time.
  const equityBase = a.portfolioValue != null ? a.portfolioValue : a.equity;
  const livePos = positions.map((p) => {
    const lp = livePrices[p.symbol];
    if (lp == null || !p.price) return p;
    const mv = p.marketValue != null ? p.marketValue * (lp / p.price) : p.marketValue;
    const dMV = mv != null && p.marketValue != null ? mv - p.marketValue : 0;
    return {
      ...p,
      price: lp,
      marketValue: mv,
      unrealizedPL: (p.unrealizedPL || 0) + dMV,
      unrealizedPLpct: p.costBasis ? (((p.unrealizedPL || 0) + dMV) / Math.abs(p.costBasis)) * 100 : p.unrealizedPLpct,
    };
  });
  const liveDelta = livePos.reduce((s, p, i) => s + ((p.marketValue || 0) - (positions[i].marketValue || 0)), 0);
  const equity = equityBase != null ? equityBase + liveDelta : equityBase;

  const unrealTotal = livePos.reduce((s, p) => s + (p.unrealizedPL || 0), 0);
  const invested = livePos.reduce((s, p) => s + Math.abs(p.marketValue || 0), 0);
  const exposure = equity ? (invested / equity) * 100 : null;
  const cash = a.cash != null ? a.cash : Math.max(0, (equity || 0) - invested);

  const lastEq = equityBase != null ? equityBase - (a.dayPL || 0) : null;
  const dayPLlive = (a.dayPL || 0) + liveDelta;
  const dayPctLive = lastEq ? (dayPLlive / lastEq) * 100 : a.dayPLpct;

  const wins = closed.filter((c) => c.pl > 0);
  const losses = closed.filter((c) => c.pl < 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : null;
  const best = closed.length ? closed.reduce((m, c) => (c.pl > m.pl ? c : m)) : null;
  const worst = closed.length ? closed.reduce((m, c) => (c.pl < m.pl ? c : m)) : null;

  // Hero: resting = live equity + today's (live) move; scrubbing = hovered point.
  const scrubbing = sel != null;
  const heroValue = scrubbing ? hist[sel].value : equity;
  const heroDelta = scrubbing
    ? {v: hist[sel].value - hist[0].value, pct: hist[0].value ? ((hist[sel].value - hist[0].value) / hist[0].value) * 100 : null, label: fmtDay(hist[sel].t)}
    : {v: dayPLlive, pct: dayPctLive, label: 'Today'};

  // ── Context for reading the numbers (what a return means here) ──
  // The start date is only certain when the history reaches back past funding:
  // Alpaca pads days before the account existed with value 0.
  const inceptionKnown = hist.length > 0 && (history || []).some((p) => p && p.value === 0);
  const startPoint = hist.length ? hist[0] : null;
  const startValue = startPoint ? startPoint.value : null;
  const sinceStart = equity != null && startValue ? {v: equity - startValue, pct: ((equity - startValue) / startValue) * 100} : null;
  const windowLabel = inceptionKnown ? 'since inception' : historyPeriod === '1A' ? 'last 12 months' : 'last 3 months';
  const daysLive = startPoint ? Math.max(0, Math.floor((Date.now() / 1000 - startPoint.t) / 86400)) : null;
  // SPY close-to-close from the same starting trading day to its latest close.
  let spy = null;
  if (spyBars && spyBars.length && startPoint) {
    const d0 = nyDay(startPoint.t);
    const b0 = spyBars.find((b) => nyDay(b.time) >= d0);
    const b1 = spyBars[spyBars.length - 1];
    if (b0 && b1 && b0.close && b1.time > b0.time) spy = {pct: (b1.close / b0.close - 1) * 100};
  }
  const perf = [
    {
      label: inceptionKnown ? 'Since inception' : windowLabel,
      val: sinceStart ? signedMoney(sinceStart.v) : '—',
      tone: dirCls(sinceStart && sinceStart.v),
      sub: sinceStart && startPoint ? `${signedPct(sinceStart.pct)} on ${money(startValue)} · ${fmtDay(startPoint.t)}` : null,
    },
    {label: 'SPY, same dates', val: spy ? signedPct(spy.pct) : '—', tone: '', sub: spy ? 'benchmark, for context' : null},
    {label: 'Track record', val: daysLive != null ? `${daysLive} days` : '—', tone: '', sub: `${orders.length} orders · ${closed.length} closed`},
  ];
  const rangeOn = inceptionKnown ? 'ALL' : historyPeriod === '1A' ? '1Y' : '3M';

  const metrics = [
    {label: 'Realized P/L', val: signedMoney(realizedTotal), tone: dirCls(realizedTotal), sub: closed.length ? `${closed.length} round-trips` : null},
    {label: 'Unrealized', val: signedMoney(unrealTotal), tone: dirCls(unrealTotal), sub: positions.length ? `${positions.length} open` : null},
    {label: 'Win rate', val: winRate != null ? pctWhole(winRate) : '—', tone: winRate != null && winRate >= 50 ? styles.up : '', sub: closed.length ? `${wins.length}W · ${losses.length}L` : null},
    {label: 'Exposure', val: pctWhole(exposure), tone: '', sub: `${money(invested)} in`},
    {label: 'Best trade', val: best ? signedMoney(best.pl) : '—', tone: best && best.pl > 0 ? styles.up : '', sub: best ? best.symbol : null},
    {label: 'Worst trade', val: worst ? signedMoney(worst.pl) : '—', tone: worst && worst.pl < 0 ? styles.down : '', sub: worst ? worst.symbol : null},
  ];

  const allocTotal = invested + Math.max(0, cash) || 1;
  const segs = livePos.map((p) => ({key: p.symbol, w: (Math.abs(p.marketValue || 0) / allocTotal) * 100, side: p.side}));
  const cashW = (Math.max(0, cash) / allocTotal) * 100;

  return (
    <div className={styles.dashboard}>
      {/* ── Top Hero: Equity & Chart ── */}
      <div className={`p-card ${styles.heroArea}`} data-reveal style={{'--i': 0}}>
        <div className={styles.heroHeader}>
          <div className={styles.heroLeft}>
            <div className={styles.heroTag}>
              <span className={styles.heroTagLeft}>
                <span className="p-pip" aria-hidden="true" /> Account equity · Alpaca paper
              </span>
              {asOf && <span className={styles.heroTagRight}>updated {fmtWhen(asOf, true)}</span>}
            </div>
            <div className={styles.heroValue}>{money(heroValue)}</div>
            <div className={`${styles.heroDelta} ${heroDelta.v == null || heroDelta.v === 0 ? styles.flat : dirCls(heroDelta.v)}`}>
              <span className={styles.caret} aria-hidden="true">{caret(heroDelta.v)}</span>
              <span className={styles.deltaNum}>{signedMoney(heroDelta.v)}</span>
              {heroDelta.pct != null && <span className={styles.deltaPct}>({signedPct(heroDelta.pct)})</span>}
              <span className={styles.deltaLabel}>{heroDelta.label}</span>
            </div>
          </div>
          <div className={styles.factsRail}>
            <div className={styles.factItem}><dt>Cash</dt><dd>{money(cash)}</dd></div>
            <div className={styles.factItem}><dt>Buying power</dt><dd>{money(a.buyingPower)}</dd></div>
            <div className={styles.factItem}><dt>Invested</dt><dd>{pctWhole(exposure)}</dd></div>
            <div className={styles.factItem}><dt>Positions</dt><dd>{positions.length}</dd></div>
          </div>
        </div>

        <EquityChart points={hist} scrubIdx={scrubIdx} onScrub={setScrubIdx} />

        {/* Dates and the starting value the curve is measured from. */}
        {hist.length > 1 && (
          <div className={styles.chartRefs}>
            <span>{fmtDay(hist[0].t)}</span>
            <span>dashed line = start, {money(hist[0].value)}</span>
            <span>{fmtDay(hist[hist.length - 1].t)}</span>
          </div>
        )}

        <div className={styles.pills} aria-hidden="true">
          {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((r) => (
            <span key={r} className={`${styles.pill} ${r === rangeOn ? styles.pillOn : styles.pillSoon}`}>{r}</span>
          ))}
          <span className={styles.pillNote}>{windowLabel} · daily</span>
        </div>
      </div>

      {/* ── Left Column: Trade & Allocation ── */}
      <div className={styles.leftCol}>
        {!owner ? (
          <div className={`p-card ${styles.tradeCard}`} data-reveal style={{'--i': 1}}>
            <div className={styles.tradeHead}>
              <h2 className={styles.h2}>Trade <span className={styles.count}>owner · paper</span></h2>
            </div>
            <div style={{padding: '1rem 1.7rem 1.6rem'}}>
              <button className={styles.submitBtn} onClick={unlock}>Unlock Terminal</button>
            </div>
          </div>
        ) : (
          <TradePanel token={token} symbols={positions.map((p) => p.symbol)} onPlaced={() => pullRef.current && pullRef.current()} onLock={lock} />
        )}

        <div className={`p-card ${styles.allocCard}`} data-reveal style={{'--i': 2}}>
          <h2 className={styles.h2}>Allocation <span className={styles.count}>{pctWhole(exposure)} invested</span></h2>
          <div className={styles.allocBar}>
            {segs.map((s) => (
              <span key={s.key} className={`${styles.allocSeg} ${s.side === 'short' ? styles.allocShort : ''}`} style={{width: `${s.w}%`}} title={`${s.key} ${s.w.toFixed(1)}%`} />
            ))}
            {cashW > 0 && <span className={styles.allocCash} style={{width: `${cashW}%`}} title={`Cash ${cashW.toFixed(1)}%`} />}
          </div>
          <div className={styles.allocLegend}>
            {segs.map((s) => (
              <span key={s.key} className={styles.legItem}>
                <i className={`${styles.legDot} ${s.side === 'short' ? styles.legShort : ''}`} />{s.key} <b>{s.w.toFixed(0)}%</b>
              </span>
            ))}
            {cashW > 0 && (
              <span className={styles.legItem}><i className={`${styles.legDot} ${styles.legCash}`} />Cash <b>{cashW.toFixed(0)}%</b></span>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Column: Holdings, Performance, Ledger ── */}
      <div className={styles.rightCol}>
        <div className={`p-card ${styles.holdingsCard}`} data-reveal style={{'--i': 3}}>
          <h2 className={styles.h2}>Holdings <span className={styles.count}>{positions.length} open</span></h2>
          {livePos.length === 0 ? (
            <p className={styles.empty}>No open positions — the account’s capital is parked in cash.</p>
          ) : (
            <div className={styles.holdings}>
              {livePos.map((p) => {
                const w = invested ? (Math.abs(p.marketValue || 0) / invested) * 100 : 0;
                return (
                  <div key={p.symbol} className={styles.holding}>
                    <div className={styles.hName}>
                      <span className={styles.hSym}>{p.symbol}</span>
                      {p.side === 'short' && <span className={styles.short}>SHORT</span>}
                      <span className={styles.hSub}>{p.qty} sh · avg {money(p.avgEntry)}</span>
                    </div>
                    <div className={styles.hWeight}>
                      <span className={styles.wtBar}><span className={`${styles.wtFill} ${p.side === 'short' ? styles.wtShort : ''}`} style={{width: `${Math.max(3, w)}%`}} /></span>
                      <span className={styles.wtPct}>{w.toFixed(0)}%</span>
                    </div>
                    <div className={styles.hPrice}>
                      <span className={styles.hLast}>{money(p.price)}</span>
                      <span className={`${styles.hChg} ${dirCls(p.changeToday)}`}>{caret(p.changeToday)} {signedPct(p.changeToday)}</span>
                    </div>
                    <div className={styles.hVal}>
                      <span className={styles.hMkt}>{money(p.marketValue)}</span>
                      <span className={`${styles.hUnreal} ${dirCls(p.unrealizedPL)}`}>{signedMoney(p.unrealizedPL)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={`p-card ${styles.metricsCard}`} data-reveal style={{'--i': 4}}>
          <h2 className={styles.h2}>The read <span className={styles.count}>performance</span></h2>
          <dl className={styles.perf}>
            {perf.map((m, i) => (
              <div key={i} className={styles.metric}>
                <dt className={styles.metricLabel}>{m.label}</dt>
                <dd className={`${styles.metricVal} ${m.tone || ''}`}>{m.val}</dd>
                {m.sub && <div className={styles.metricSub}>{m.sub}</div>}
              </div>
            ))}
          </dl>
          <dl className={styles.metrics}>
            {metrics.map((m, i) => (
              <div key={i} className={styles.metric}>
                <dt className={styles.metricLabel}>{m.label}</dt>
                <dd className={`${styles.metricVal} ${m.tone || ''}`}>{m.val}</dd>
                {m.sub && <div className={styles.metricSub}>{m.sub}</div>}
              </div>
            ))}
          </dl>
          <p className={styles.readNote}>
            <strong>How to read this.</strong> A paper account: Alpaca simulates the fills, with no
            commissions and none of the market impact, queue position or slippage a real order would
            face. Return is measured against {inceptionKnown ? 'the starting balance' : `the account value at the start of the ${windowLabel}`};
            a paper account has no deposits or withdrawals to distort it.
            {closed.length < 10 && (
              <>
                {' '}With {closed.length === 0 ? 'no closed trades' : `only ${closed.length} closed trade${closed.length === 1 ? '' : 's'}`} so
                far, this is an experiment, not a track record — win rate and best/worst trade fill in as
                positions close.
              </>
            )}
            {' '}SPY is a broad US-market benchmark shown for context, not a target.
          </p>
        </div>

        <div className={`p-card ${styles.ledgerCard}`} data-reveal style={{'--i': 5}}>
          <div className={styles.ledgerHeader}>
            <h2 className={styles.h2}>Ledger</h2>
            <div className={styles.ledgerTabs}>
              <button className={`${styles.tabBtn} ${ledgerTab === 'closed' ? styles.tabActive : ''}`} onClick={() => setLedgerTab('closed')}>
                Round-trips <span className={styles.tabCount}>{closed.length}</span>
              </button>
              <button className={`${styles.tabBtn} ${ledgerTab === 'orders' ? styles.tabActive : ''}`} onClick={() => setLedgerTab('orders')}>
                Orders <span className={styles.tabCount}>{orders.length}</span>
              </button>
            </div>
          </div>

          <div className={styles.ledgerScroller}>
            {ledgerTab === 'closed' && (
              closed.length === 0 ? <p className={styles.empty}>No closed round-trips yet.</p> : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>Symbol</th><th>Side</th><th className={styles.num}>Qty</th><th className={styles.num}>Entry</th><th className={styles.num}>Exit</th><th className={styles.num}>Realized P/L</th><th className={styles.num}>Closed</th></tr>
                  </thead>
                  <tbody>
                    {closed.map((c, i) => (
                      <tr key={i}>
                        <td><span className={styles.sym}>{c.symbol}</span></td>
                        <td><span className={c.side === 'short' ? styles.tagSell : styles.tagBuy}>{c.side}</span></td>
                        <td className={styles.num}>{+c.qty.toFixed(4)}</td>
                        <td className={styles.num}>{money(c.entry)}</td>
                        <td className={styles.num}>{money(c.exit)}</td>
                        <td className={`${styles.num} ${dirCls(c.pl)}`}>{signedMoney(c.pl)} <span className={styles.sub}>{signedPct(c.plpct)}</span></td>
                        <td className={`${styles.num} ${styles.dim}`}>{fmtWhen(c.closedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {ledgerTab === 'orders' && (
              orders.length === 0 ? <p className={styles.empty}>No orders yet.</p> : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>Time</th><th>Symbol</th><th>Side</th><th className={styles.num}>Qty</th><th>Type</th><th className={styles.num}>Fill</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 50).map((o) => {
                      const cancelable = owner && PENDING.includes((o.status || '').toLowerCase());
                      return (
                        <tr key={o.id}>
                          <td className={styles.dim}>{fmtWhen(o.submittedAt, true)}</td>
                          <td><span className={styles.sym}>{o.symbol}</span></td>
                          <td><span className={o.side === 'buy' ? styles.tagBuy : styles.tagSell}>{o.side}</span></td>
                          <td className={styles.num}>{o.qty}</td>
                          <td className={styles.dim}>{o.type}</td>
                          <td className={styles.num}>{o.filledAvgPrice != null ? money(o.filledAvgPrice) : '—'}</td>
                          <td>
                            <span className={`${styles.status} ${styles['st_' + (o.status || '').replace(/[^a-z_]/gi, '')]}`}>{o.status}</span>
                            {cancelable && <button className={styles.cancelBtn} onClick={() => postJson('/_m/cancel', token, {id: o.id}).then(() => pullRef.current && pullRef.current()).catch(() => {})}>cancel</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      </div>

      <p className={styles.foot} data-reveal style={{'--i': 6}}>
        Read-only paper account via Alpaca · auto-refreshes every 30s
        {asOf && <> · updated {fmtWhen(asOf, true)}</>} · live prices refresh every few seconds · scrub the curve to read any day ·
        {' '}watch the tape on the <Link to="/terminal">market terminal</Link>.
        {owner ? <> · <button className={styles.ownerLink} onClick={lock}>lock trading</button></> : <> · <button className={styles.ownerLink} onClick={unlock}>owner access</button></>}
      </p>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Layout
      title="Portfolio"
      description="A live, read-only view of my Alpaca paper-trading account — a scrubable equity curve, allocation, a performance read, open positions, closed round-trips, and the full order log.">
      <PageHeader
        eyebrow="Trading capital · Alpaca paper"
        title="Portfolio"
        subtitle="A live, read-only command deck for the paper-trading account — scrub the curve to read any day, then the allocation, the performance read, and every position and order. Play money; no real capital at risk."
      />
      <main className={`container ${styles.wrap}`}>
        <Content />
      </main>
    </Layout>
  );
}
