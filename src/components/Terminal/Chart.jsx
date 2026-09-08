import React, { useEffect, useRef, useState } from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import { fetchBars, tfConfig, isCrypto, cryptoGran, TIMEFRAMES, fmtPrice } from './marketData';
import { subscribeCryptoTicker } from './cryptoStream';
import { subscribeStockTrades } from './stockStream';
import { getGex, getPortfolio } from '../../lib/market';
import usePolling from '../../lib/usePolling';
import styles from './styles.module.css';
import GexProfile from './GexProfile';

/*
 * Live price chart.
 *
 * Rendered in-page with TradingView's open-source lightweight-charts library
 * (loaded from CDN, drawn into our own canvas). Candles refresh on a timer:
 * the newest bar is updated in place as it ticks, and completed bars are
 * appended — so the chart moves with the market instead of sitting still.
 */

const LIB = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';

let _libPromise = null;
function loadLib() {
  if (typeof window !== 'undefined' && window.LightweightCharts) {
    return Promise.resolve(window.LightweightCharts);
  }
  if (_libPromise) return _libPromise;
  _libPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIB;
    s.async = true;
    s.onload = () => resolve(window.LightweightCharts);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return _libPromise;
}

// Seconds -> "m:ss" (or "h:mm:ss" for long intervals like 1D).
function fmtCountdown(s) {
  if (s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}

// Render chart times in US Central Time (America/Chicago), regardless of the
// viewer's locale. lightweight-charts is UTC by default and has no tz setting,
// so we format the axis ticks and the crosshair tooltip ourselves.
function ctToDate(t) {
  if (typeof t === 'number') return new Date(t * 1000);
  if (t && typeof t === 'object' && t.year) return new Date(Date.UTC(t.year, (t.month || 1) - 1, t.day || 1));
  return new Date();
}
function ctTickFormatter(time, tickMarkType) {
  const base = { timeZone: 'America/Chicago' };
  let opts;
  if (tickMarkType === 0) opts = { ...base, year: 'numeric' };
  else if (tickMarkType === 1) opts = { ...base, month: 'short' };
  else if (tickMarkType === 2) opts = { ...base, month: 'short', day: 'numeric' };
  else opts = { ...base, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  return new Intl.DateTimeFormat('en-US', opts).format(ctToDate(time));
}
function ctTimeFormatter(time) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(ctToDate(time));
}

// Black–Scholes gamma (client copy) — lets us re-price the dealer gamma flip
// and walls at the LIVE spot on every tick (open interest is fixed intraday,
// but gamma moves with spot and with the collapsing time-to-expiry).
function bsmGammaC(S, K, T, sig) {
  if (!(T > 0) || !(sig > 0) || !(S > 0)) return 0;
  const d1 = (Math.log(S / K) + (0.045 + 0.5 * sig * sig) * T) / (sig * Math.sqrt(T));
  return Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI) / (S * sig * Math.sqrt(T));
}
const YEAR_MS = 365 * 86400000;
function gexLevels(rows, S) {
  if (!rows || !rows.length || !(S > 0)) return null;
  const now = Date.now();
  const SCALE = 100 * S * S * 0.01;
  const Tof = (e) => Math.max((e - now) / YEAR_MS, 1 / (365 * 24)); // floor ≈ 1 hour
  let netGex = 0, cw = 0, pw = 0, callWall = null, putWall = null;
  const byK = new Map();
  for (const r of rows) {
    const T = Tof(r.e);
    const cg = bsmGammaC(S, r.k, T, r.civ) * r.coi;
    const pg = bsmGammaC(S, r.k, T, r.piv) * r.poi;
    const net = (cg - pg) * SCALE;
    netGex += net;
    byK.set(r.k, (byK.get(r.k) || 0) + net);
    if (cg > cw) { cw = cg; callWall = r.k; }
    if (pg > pw) { pw = pg; putWall = r.k; }
  }
  const profile = [...byK.entries()].map(([strike, net]) => ({ strike, net })).sort((a, b) => a.strike - b.strike);
  const gexAt = (x) => {
    let s = 0;
    for (const r of rows) { const T = Tof(r.e); s += bsmGammaC(x, r.k, T, r.civ) * r.coi - bsmGammaC(x, r.k, T, r.piv) * r.poi; }
    return s;
  };
  let flip = null, pS = S * 0.9, pV = gexAt(pS);
  for (let i = 1; i <= 30; i++) {
    const x = S * 0.9 + S * 0.2 * (i / 30), v = gexAt(x);
    if ((pV < 0 && v >= 0) || (pV > 0 && v <= 0)) { flip = v === pV ? pS : pS + (x - pS) * (-pV) / (v - pV); break; }
    pS = x; pV = v;
  }
  return {
    netGex: Math.round(netGex),
    gammaFlip: flip ? Math.round(flip * 100) / 100 : null,
    regime: flip == null ? null : (S >= flip ? 'positive' : 'negative'),
    callWall, putWall, profile,
  };
}

export default function Chart({ ticker, timeframe, setTimeframe, onStatus, fsTargetRef }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const lastBarRef = useRef(null);
  const pollRef = useRef(null);
  const areaRef = useRef(null);
  const { colorMode } = useColorMode();
  const [status, setStatus] = useState('loading');
  const [countdown, setCountdown] = useState('');
  const [cdTop, setCdTop] = useState(8);
  const [isFs, setIsFs] = useState(false);
  const [pos, setPos] = useState(null);   // open position in this ticker (or null)
  const [pl, setPl] = useState(null);      // live { value, pct } for that position
  const [plY, setPlY] = useState(null);    // y-pixel of the entry line (for the pill)
  const entryLineRef = useRef(null);
  const [gex, setGex] = useState(null);          // dealer gamma levels (recomputed live)
  const [gexChain, setGexChain] = useState(null); // per-strike chain from the worker
  const [gexExp, setGexExp] = useState('day');    // expiry bucket: day | week | 15d | 30d
  const [showGex, setShowGex] = useState(false);
  const [gexSym, setGexSym] = useState('SPX');    // GEX instrument: '' = follow chart, else an index
  const [gexErr, setGexErr] = useState(false);    // fetch failed / no options — distinct from "loading"
  const gexLinesRef = useRef({});
  const [gexW, setGexW] = useState(210); // GEX panel width (px) — drag to resize
  const gexDragRef = useRef(false);

  // GEX instrument options. Index options (cash-settled, European) are the
  // canonical dealer-gamma view — SPX and its 1/10-size cousin XSP, plus NDX/
  // RUT/DJX. '' means "follow the charted stock" (equities/ETFs only).
  const GEX_INSTRUMENTS = [['', 'Chart'], ['SPX', 'SPX'], ['XSP', 'XSP'], ['NDX', 'NDX'], ['RUT', 'RUT'], ['DJX', 'DJX']];
  const gexTarget = gexSym || (ticker || '').toUpperCase();
  const gexFollows = gexSym === '';   // GEX tracks the charted symbol (draws on-chart lines)

  const toggleFs = () => {
    // Fullscreen the whole deck (chart + news) when the parent hands us its ref,
    // so the news panel is visible in fullscreen too — fall back to the chart.
    const el = (fsTargetRef && fsTargetRef.current) || areaRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
    else el.requestFullscreen && el.requestFullscreen();
  };

  // Track fullscreen state + resize the chart to fill (or leave) the screen.
  useEffect(() => {
    const onFs = () => {
      setIsFs(!!document.fullscreenElement);
      setTimeout(() => {
        if (chartRef.current && wrapRef.current && wrapRef.current.clientWidth) {
          chartRef.current.applyOptions({
            width: wrapRef.current.clientWidth,
            height: wrapRef.current.clientHeight || 460,
          });
        }
      }, 60);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Drag the divider between the GEX panel and the chart to resize the GEX
  // sidebar. GexProfile and the chart both watch their own size, so they re-fit.
  const startGexResize = (e) => {
    gexDragRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    if (e.cancelable) e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!gexDragRef.current || !areaRef.current) return;
      if (e.cancelable) e.preventDefault();
      const rect = areaRef.current.getBoundingClientRect();
      const cx = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
      setGexW(Math.max(120, Math.min(rect.width * 0.6, cx - rect.left)));
    };
    const onUp = () => {
      if (!gexDragRef.current) return;
      gexDragRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  /* ---- create the chart once (and re-create on theme change) ---- */
  useEffect(() => {
    let disposed = false;
    let resizeObs = null;

    loadLib()
      .then((LC) => {
        if (disposed || !wrapRef.current) return;
        const dark = colorMode === 'dark';
        const el = wrapRef.current;
        el.innerHTML = '';

        const chart = LC.createChart(el, {
          width: el.clientWidth || 600,
          height: el.clientHeight || 460,
          layout: {
            background: { type: 'solid', color: 'transparent' },
            textColor: dark ? '#cbd5e1' : '#334155',
          },
          grid: {
            vertLines: { color: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
            horzLines: { color: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
          },
          rightPriceScale: { borderColor: 'rgba(127,127,127,0.2)' },
          localization: { timeFormatter: ctTimeFormatter },
          timeScale: {
            borderColor: 'rgba(127,127,127,0.2)',
            timeVisible: true,
            secondsVisible: false,
            tickMarkFormatter: ctTickFormatter,
          },
          crosshair: { mode: 0 },
        });

        const series = chart.addCandlestickSeries({
          upColor: '#22c55e', downColor: '#ef4444',
          borderUpColor: '#22c55e', borderDownColor: '#ef4444',
          wickUpColor: '#22c55e', wickDownColor: '#ef4444',
        });

        chartRef.current = chart;
        seriesRef.current = series;

        resizeObs = new ResizeObserver(() => {
          if (chartRef.current && el.clientWidth) {
            chartRef.current.applyOptions({
              width: el.clientWidth,
              height: el.clientHeight || 460,
            });
          }
        });
        resizeObs.observe(el);
      })
      .catch(() => setStatus('error'));

    return () => {
      disposed = true;
      if (resizeObs) resizeObs.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode]);

  /* ---- load data + keep it live ---- */
  useEffect(() => {
    let cancelled = false;
    let unsub = null;
    lastBarRef.current = null;

    async function fullLoad() {
      setStatus('loading');
      const { bars, source } = await fetchBars(ticker, timeframe);
      if (cancelled || !seriesRef.current) return;
      if (!bars.length) {
        setStatus('error');
        if (onStatus) onStatus({ source: 'none' });
        return;
      }
      seriesRef.current.setData(bars);
      chartRef.current.timeScale().fitContent();
      lastBarRef.current = bars[bars.length - 1];
      setStatus('ok');
      if (onStatus) onStatus({ source });
    }

    // Incremental tick: only touch the newest bar(s), never redraw everything.
    async function tick() {
      if (document.visibilityState === 'hidden') return;
      const { bars, source } = await fetchBars(ticker, timeframe);
      if (cancelled || !seriesRef.current || !bars.length) return;
      const prev = lastBarRef.current;
      if (!prev) {
        seriesRef.current.setData(bars);
        lastBarRef.current = bars[bars.length - 1];
      } else {
        for (const b of bars) {
          if (b.time >= prev.time) seriesRef.current.update(b);
        }
        lastBarRef.current = bars[bars.length - 1];
      }
      setStatus('ok');
      if (onStatus) onStatus({ source });
    }

    // Wait for the chart instance, then load and start polling.
    const startTimer = setInterval(() => {
      if (seriesRef.current) {
        clearInterval(startTimer);
        fullLoad().then(() => {
          if (cancelled) return;
          const gran = cryptoGran(timeframe);
          // Rebuild the forming candle from one live trade (shared by crypto & stocks).
          const applyTrade = (t) => {
            if (cancelled || !seriesRef.current) return;
            const bucket = Math.floor(t.timeSec / gran) * gran;
            const prev = lastBarRef.current;
            let bar;
            if (prev && bucket === prev.time) {
              bar = { time: bucket, open: prev.open, high: Math.max(prev.high, t.price), low: Math.min(prev.low, t.price), close: t.price };
            } else if (!prev || bucket > prev.time) {
              bar = { time: bucket, open: t.price, high: t.price, low: t.price, close: t.price };
            } else {
              return; // out-of-order tick older than the current bar
            }
            seriesRef.current.update(bar);
            lastBarRef.current = bar;
            setStatus('ok');
            const y = seriesRef.current.priceToCoordinate(bar.close);
            if (y != null && !Number.isNaN(y)) setCdTop(y + 11);
          };

          if (isCrypto(ticker)) {
            unsub = subscribeCryptoTicker(ticker, applyTrade);
          } else {
            // Stocks: polling is the always-on baseline (works when closed, or if
            // the stream Worker isn't deployed); the WS adds tick-by-tick when open.
            const { pollMs } = tfConfig(timeframe);
            pollRef.current = setInterval(tick, pollMs);
            unsub = subscribeStockTrades(ticker, applyTrade);
          }
        });
      }
    }, 120);

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(startTimer);
      if (pollRef.current) clearInterval(pollRef.current);
      if (unsub) unsub();
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, timeframe, colorMode]);

  /* ---- countdown to the current candle's close (updates every second) ---- */
  useEffect(() => {
    const gran = cryptoGran(timeframe);
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      setCountdown(fmtCountdown(gran - (now % gran)));
      // pin the badge just under the live price label on the right axis
      const s = seriesRef.current;
      const lp = lastBarRef.current ? lastBarRef.current.close : null;
      if (s && lp != null) {
        const y = s.priceToCoordinate(lp);
        if (y != null && !Number.isNaN(y)) setCdTop(y + 11);
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timeframe]);

  /* ---- open-position overlay: is there a position in THIS ticker? ---- */
  // Clear the previous symbol's overlay the moment the chart changes symbol.
  useEffect(() => {
    setPos(null); setPl(null); setPlY(null);
  }, [ticker]);

  usePolling(async ({ signal, cancelled }) => {
    const sym = (ticker || '').toUpperCase();
    try {
      const d = await getPortfolio({ signal });
      if (cancelled() || !d || !Array.isArray(d.positions)) return;
      setPos(d.positions.find((x) => (x.symbol || '').toUpperCase() === sym) || null);
    } catch (_) { /* overlay is optional — never break the chart */ }
  }, 20000, [ticker]);

  /* ---- draw the entry line + keep the live P/L in sync (TradingView-style) ---- */
  useEffect(() => {
    const removeLine = () => {
      if (entryLineRef.current && seriesRef.current) {
        try { seriesRef.current.removePriceLine(entryLineRef.current); } catch (_) {}
      }
      entryLineRef.current = null;
    };
    removeLine();
    if (!pos || pos.avgEntry == null) { setPl(null); setPlY(null); return undefined; }

    const signedQty = pos.side === 'short' ? -Math.abs(pos.qty) : Math.abs(pos.qty);
    const cost = Math.abs(pos.avgEntry * pos.qty);

    const update = () => {
      const s = seriesRef.current;
      if (!s) return;
      if (!entryLineRef.current) {
        try {
          entryLineRef.current = s.createPriceLine({
            price: pos.avgEntry,
            color: '#3b82f6',
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: `${pos.side === 'short' ? 'SHORT' : 'LONG'} ${pos.qty}`,
          });
        } catch (_) {}
      }
      const last = lastBarRef.current ? lastBarRef.current.close : null;
      if (last != null) {
        const value = (last - pos.avgEntry) * signedQty;
        setPl({ value, pct: cost ? (value / cost) * 100 : null });
      }
      const y = s.priceToCoordinate(pos.avgEntry);
      setPlY(y != null && !Number.isNaN(y) && y >= 0 ? y : null);
    };
    update();
    const id = setInterval(update, 1000);
    return () => { clearInterval(id); removeLine(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  /* ---- gamma exposure: fetch the per-strike chain for this ticker + expiry ---- */
  useEffect(() => {
    let cancelled = false;
    setGexChain(null); setGex(null); setGexErr(false);
    if (!showGex) return undefined;                          // don't fetch until the panel is open
    // Options exist for equities/ETFs and index products — but not crypto, so
    // only bail when we're following a crypto chart (an index pick still works).
    if (gexFollows && isCrypto(ticker)) return undefined;
    const sym = gexTarget;
    (async () => {
      try {
        const d = await getGex(sym, gexExp);
        if (cancelled) return;
        if (!d || !d.spot) { setGexChain(null); setGex(null); setGexErr(true); return; }
        // Tag the chain with its instrument so the live re-compute below never
        // prices a stale chain against a just-switched target (garbage flash).
        setGexChain({ ...d, sym });
        // paint the server's (delayed-spot) levels immediately; the live
        // re-compute below refines them at the terminal's real-time price.
        setGex({ gammaFlip: d.gammaFlip, callWall: d.callWall, putWall: d.putWall, regime: d.regime, netGex: d.netGex });
      } catch (_) { if (!cancelled) { setGexChain(null); setGex(null); setGexErr(true); } }
    })();
    return () => { cancelled = true; };
  }, [gexTarget, gexFollows, ticker, gexExp, showGex]);

  /* ---- re-price the gamma flip + walls at the LIVE spot (every ~2s) ---- */
  useEffect(() => {
    // Guard against pricing a stale chain (still the previous instrument) after
    // an instrument switch — its strikes belong to a different symbol/scale.
    if (!showGex || !gexChain || !gexChain.rows || gexChain.sym !== gexTarget) return undefined;
    const recompute = () => {
      // When following the chart, re-price at the live candle; for an index the
      // chart's price is a different instrument, so use the chain's own spot.
      const S = (gexFollows && lastBarRef.current) ? lastBarRef.current.close : gexChain.spot;
      const lv = gexLevels(gexChain.rows, S);
      if (lv) setGex(lv);
    };
    recompute();
    const id = setInterval(recompute, 2000);
    return () => clearInterval(id);
  }, [gexChain, showGex, gexFollows, gexTarget]);

  /* ---- draw/update the gamma-flip + call/put walls as labeled price lines ---- */
  useEffect(() => {
    const s = seriesRef.current;
    const L = gexLinesRef.current;
    const drop = (key) => { if (s && L[key]) { try { s.removePriceLine(L[key]); } catch (_) {} } L[key] = null; };
    // Only overlay lines on the chart when GEX is tracking the charted symbol;
    // an index's price levels are on a different scale and don't belong here.
    if (!showGex || !gex || !s || !gexFollows) { for (const k of ['flip', 'call', 'put']) drop(k); return undefined; }
    // update lines in place (no flicker) as the live re-compute nudges them
    const set = (key, price, color, title) => {
      if (price == null) { drop(key); return; }
      if (L[key]) { try { L[key].applyOptions({ price, title }); } catch (_) {} }
      else { try { L[key] = s.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title }); } catch (_) {} }
    };
    set('flip', gex.gammaFlip, '#a855f7', `Γ flip ${gex.gammaFlip}`);
    set('call', gex.callWall, '#f97316', `Call wall ${gex.callWall}`);
    set('put', gex.putWall, '#14b8a6', `Put wall ${gex.putWall}`);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gex, showGex, gexFollows]);

  return (
    <div className={styles.chartRow} ref={areaRef} style={showGex ? {'--gex-w': gexW + 'px'} : undefined}>
      {showGex && gex && gex.profile && (
        <>
          <GexProfile
            profile={gex.profile}
            spot={(lastBarRef.current && lastBarRef.current.close) || (gexChain && gexChain.spot)}
            callWall={gex.callWall}
            putWall={gex.putWall}
            gammaFlip={gex.gammaFlip}
            resetKey={`${gexTarget}|${gexExp}`}
          />
          <div className={styles.gexResizer} onMouseDown={startGexResize} onTouchStart={startGexResize} role="separator" aria-orientation="vertical" aria-label="Resize GEX panel" />
        </>
      )}
      <div className={styles.chartArea}>
      <div className={styles.chartToolbar}>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.key}
            className={`${styles.tfBtn} ${tf.key === timeframe ? styles.tfBtnActive : ''}`}
            onClick={() => setTimeframe && setTimeframe(tf.key)}
          >
            {tf.label}
          </button>
        ))}
        <button
          className={`${styles.tfBtn} ${styles.gexBtn} ${showGex ? styles.tfBtnActive : ''}`}
          onClick={() => setShowGex((v) => !v)}
          disabled={!showGex && isCrypto(ticker) && gexFollows}
          title="Gamma exposure — dealer gamma-flip level and call/put walls"
          aria-label="Toggle gamma exposure (GEX)"
        >
          Γ GEX
        </button>
        {showGex && (
          <select
            className={`${styles.tfBtn} ${styles.gexSymSel}`}
            value={gexSym}
            onChange={(e) => setGexSym(e.target.value)}
            title="GEX instrument — index options (SPX/XSP/NDX/RUT/DJX) or follow the chart"
            aria-label="GEX instrument"
          >
            {GEX_INSTRUMENTS.map(([v, l]) => (
              <option key={v || 'chart'} value={v}>{l}</option>
            ))}
          </select>
        )}
        {showGex && [['day', 'Day'], ['week', '1W'], ['15d', '15D'], ['30d', '30D']].map(([v, l]) => (
          <button
            key={v}
            className={`${styles.tfBtn} ${styles.gexExpBtn} ${gexExp === v ? styles.tfBtnActive : ''}`}
            onClick={() => setGexExp(v)}
            title={`Gamma expiry window: ${l}`}
          >
            {l}
          </button>
        ))}
      </div>
      <button
        className={styles.fsBtn}
        onClick={toggleFs}
        title={isFs ? 'Exit full screen (Esc)' : 'Full-screen chart'}
        aria-label={isFs ? 'Exit full screen' : 'Full-screen chart'}
      >
        {isFs ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        )}
      </button>
      {status !== 'ok' && (
        <div className={styles.chartMsg}>
          {status === 'error'
            ? 'Could not load price data — retrying on the next tick.'
            : 'Loading chart…'}
        </div>
      )}
      {status === 'ok' && countdown && (
        <div
          className={styles.candleCountdown}
          style={{ top: cdTop }}
          title="Time until the current candle closes"
        >
          <span className={styles.cdDot} />
          {countdown}
        </div>
      )}
      {status === 'ok' && pos && pl && plY != null && (
        <div
          className={styles.posPill}
          style={{ top: plY }}
          title={`${pos.side === 'short' ? 'Short' : 'Long'} ${pos.qty} ${pos.symbol} @ ${fmtPrice(pos.avgEntry)}`}
        >
          <span className={styles.posMeta}>{pos.side === 'short' ? 'SHORT' : 'LONG'} {pos.qty}</span>
          <span className={pl.value >= 0 ? styles.up : styles.down}>
            {pl.value >= 0 ? '+' : '−'}${fmtPrice(Math.abs(pl.value))}
            {pl.pct != null && ` (${pl.value >= 0 ? '+' : '−'}${Math.abs(pl.pct).toFixed(2)}%)`}
          </span>
        </div>
      )}
      {status === 'ok' && showGex && (
        <div className={styles.gexBadge}>
          {gex ? (
            <>
              <span className={styles.gexBadgeSym}>{gexTarget}</span>
              {' '}
              <span className={gex.regime === 'positive' ? styles.up : styles.down}>
                γ {gex.regime || '—'}
              </span>
              {' · '}{gexExp === 'day' ? '0DTE' : gexExp}
              {gex.gammaFlip != null && <> · flip {gex.gammaFlip}</>}
              {(gex.putWall != null || gex.callWall != null) && <> · walls {gex.putWall ?? '—'}/{gex.callWall ?? '—'}</>}
            </>
          ) : (gexFollows && isCrypto(ticker) ? 'γ: n/a for crypto' : (gexErr ? `γ: no options data for ${gexTarget}` : 'γ: loading…'))}
        </div>
      )}
      <div ref={wrapRef} className={styles.chartWrap} />
      </div>
    </div>
  );
}
