import React, { useEffect, useRef, useState } from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import styles from './styles.module.css';

/*
 * Price chart — rendered in-page with TradingView's open-source lightweight-charts
 * library (loaded from CDN, draws into our own canvas — nothing external to block)
 * fed by keyless daily OHLC data from Stooq via the CORS proxy.
 */

const STOOQ = { AAPL: 'aapl.us', MSFT: 'msft.us', NVDA: 'nvda.us', TSLA: 'tsla.us', SPY: 'spy.us' };
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

async function fetchCandles(stooqSym) {
  const bucket = Math.floor(Date.now() / 120000);
  const url = `https://stooq.com/q/d/l/?s=${stooqSym}&i=d&_=${bucket}`;
  const proxies = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  ];
  for (const p of proxies) {
    try {
      const res = await fetch(p(url), { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      const lines = text.trim().split('\n');
      if (lines.length < 2 || !/date/i.test(lines[0])) continue;
      const rows = lines.slice(1).map((ln) => {
        const [date, o, h, l, c] = ln.split(',');
        return { time: date, open: +o, high: +h, low: +l, close: +c };
      }).filter((r) => r.time && !isNaN(r.open) && !isNaN(r.close));
      if (rows.length) return rows.slice(-260); // ~1 trading year
    } catch (e) { /* next proxy */ }
  }
  return [];
}

export default function Chart({ ticker }) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const { colorMode } = useColorMode();
  const [status, setStatus] = useState('loading');

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
      // trigger data load for current ticker
      setStatus('loading');
      fetchCandles(STOOQ[ticker] || (ticker || '').toLowerCase() + '.us').then((rows) => {
        if (disposed || !seriesRef.current) return;
        if (rows.length === 0) { setStatus('error'); return; }
        seriesRef.current.setData(rows);
        chartRef.current.timeScale().fitContent();
        setStatus('ok');
      });
    }).catch(() => setStatus('error'));

    return () => {
      disposed = true;
      if (resizeObs) resizeObs.disconnect();
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; seriesRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorMode]);

  // Update data when the ticker changes (chart already exists).
  useEffect(() => {
    if (!seriesRef.current) return;
    setStatus('loading');
    fetchCandles(STOOQ[ticker] || (ticker || '').toLowerCase() + '.us').then((rows) => {
      if (!seriesRef.current) return;
      if (rows.length === 0) { setStatus('error'); return; }
      seriesRef.current.setData(rows);
      chartRef.current.timeScale().fitContent();
      setStatus('ok');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  return (
    <div className={styles.chartArea}>
      {status !== 'ok' && (
        <div className={styles.chartMsg}>
          {status === 'error' ? 'Could not load chart data.' : 'Loading chart…'}
        </div>
      )}
      <div ref={wrapRef} className={styles.chartWrap} />
    </div>
  );
}
