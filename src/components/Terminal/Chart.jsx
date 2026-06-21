import React, { useEffect, useRef, useState } from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import styles from './styles.module.css';

/*
 * Price chart — rendered in-page with TradingView's open-source lightweight-charts
 * library (loaded from CDN, draws into our own canvas — nothing external to block).
 * Daily OHLC data is keyless, pulled from Yahoo Finance's chart JSON through a
 * multi-proxy fallback chain (if one CORS proxy is throttled, it tries the next).
 */

const LIB = 'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';

let _libPromise = null;
function loadLib() {
  if (typeof window !== 'undefined' && window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
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

const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, // wraps body in {contents}
];

function ymd(sec) {
  const d = new Date(sec * 1000);
  return d.toISOString().slice(0, 10);
}

function parseYahoo(text) {
  let j;
  try { j = JSON.parse(text); } catch { return []; }
  if (j && typeof j.contents === 'string') {
    try { j = JSON.parse(j.contents); } catch { return []; }
  }
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp || !r.indicators || !r.indicators.quote) return [];
  const ts = r.timestamp;
  const q = r.indicators.quote[0];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ time: ymd(ts[i]), open: o, high: h, low: l, close: c });
  }
  return out;
}

async function fetchCandles(sym) {
  const bucket = Math.floor(Date.now() / 120000);
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1y&interval=1d&_=${bucket}`;
  for (const p of PROXIES) {
    try {
      const res = await fetch(p(target), { cache: 'no-store' });
      if (!res.ok) continue;
      const rows = parseYahoo(await res.text());
      if (rows.length) return rows;
    } catch (e) { /* try next proxy */ }
  }
  return [];
}

export default function Chart({ ticker }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const { colorMode } = useColorMode();
  const [status, setStatus] = useState('loading');

  function load(sym) {
    setStatus('loading');
    fetchCandles(sym).then((rows) => {
      if (!seriesRef.current) return;
      if (rows.length === 0) { setStatus('error'); return; }
      seriesRef.current.setData(rows);
      chartRef.current.timeScale().fitContent();
      setStatus('ok');
    });
  }

  // Create / theme the chart.
  useEffect(() => {
    let disposed = false;
    let resizeObs = null;
    loadLib().then((LC) => {
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
        timeScale: { borderColor: 'rgba(127,127,127,0.2)' },
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
          chartRef.current.applyOptions({ width: el.clientWidth, height: el.clientHeight || 460 });
        }
      });
      resizeObs.observe(el);
      load(ticker);
    }).catch(() => setStatus('error'));

    return () => {
      disposed = true;
      if (resizeObs) resizeObs.disconnect();
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode]);

  // Reload data when the ticker changes (chart already exists).
  useEffect(() => {
    if (seriesRef.current) load(ticker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  return (
    <div className={styles.chartArea}>
      {status !== 'ok' && (
        <div className={styles.chartMsg}>
          {status === 'error' ? 'Could not load chart data — proxy busy, try the ↻ ticker again.' : 'Loading chart…'}
        </div>
      )}
      <div ref={wrapRef} className={styles.chartWrap} />
    </div>
  );
}
