import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchBars } from './marketData';
import { tradeStatus, isHit } from './stopRules.mjs';

/*
 * The newest SATS trade drawn on the chart: ENTRY, SL and TP1-TP3 as lines from
 * the signal candle to the right, each with a price label; reached targets get a
 * check mark. ENTRY and TP1-3 come from the private overlay server (`trade`);
 * SL is OUR tested 1-minute stop (stopRules), and the hits are re-checked on
 * 1-minute candles every 15 s, TPs only before our SL. Drawing only.
 */
const STYLE = {
  tp: [
    { color: '#26a69a', dash: [], width: 1 },        // TP1
    { color: '#00c853', dash: [4, 4], width: 1 },    // TP2
    { color: '#00e676', dash: [10, 8], width: 2 },   // TP3
  ],
  entry: { color: '#9e9e9e', dash: [], width: 2 },
  sl: { color: '#f23645', dash: [], width: 2 },
};
const LABEL_BG = { tp: ['#1f6f68', '#0b5d2a', '#0b5d2a'], entry: '#3a3a3e', sl: '#6b1622' };

function levelsLayer() {
  let lines = [], x0 = null;
  let ctx = null;
  const renderer = {
    draw(target) {
      if (!ctx || !lines.length) return;
      target.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
        const series = ctx.series;
        const start = ctx.chart.timeScale().timeToCoordinate(x0);
        const xa = start == null ? mediaSize.width * 0.55 : Math.max(start, 0);
        const xb = Math.max(xa + 60, mediaSize.width - 150); // leave room for the labels
        c.save();
        c.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        c.textBaseline = 'middle';
        for (const l of lines) {
          const y = series.priceToCoordinate(l.price);
          if (y == null) continue;
          const yy = Math.round(y) + 0.5;
          const xe = l.end != null ? ctx.chart.timeScale().timeToCoordinate(l.end) : xb;
          if (xe == null) continue;
          c.strokeStyle = l.color; c.lineWidth = l.width; c.setLineDash(l.dash);
          c.beginPath(); c.moveTo(xa, yy); c.lineTo(xe, yy); c.stroke();
          c.setLineDash([]);
          if (l.cross) { // stopped out: an x on the candle that hit the stop, no label
            c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(xe - 4, yy - 4); c.lineTo(xe + 4, yy + 4); c.moveTo(xe - 4, yy + 4); c.lineTo(xe + 4, yy - 4); c.stroke();
            continue;
          }
          const text = l.text, tw = c.measureText(text).width, bx = xb + 14, bh = 20;
          c.fillStyle = l.bg;
          c.beginPath(); // label box with a small pointer, like the SATS panel
          c.moveTo(bx - 8, yy); c.lineTo(bx, yy - bh / 2); c.lineTo(bx + tw + 14, yy - bh / 2);
          c.lineTo(bx + tw + 14, yy + bh / 2); c.lineTo(bx, yy + bh / 2); c.closePath(); c.fill();
          c.fillStyle = '#fff'; c.fillText(text, bx + 7, yy);
        }
        c.restore();
      });
    },
  };
  const view = { zOrder: () => 'top', renderer: () => renderer };
  const layer = { attached(p) { ctx = p; }, detached() { ctx = null; }, updateAllViews() {}, paneViews: () => [view] };
  return { layer, set(list, t) { lines = list; x0 = t; if (ctx) ctx.requestUpdate(); } };
}

export default function TradeLevels({ seriesRef, lastBarRef, trade, ticker, tfSec }) {
  const ref = useRef({ series: null, layer: null });
  const [bars, setBars] = useState(null);

  // 1-minute candles while a trade is shown: our SL and the hit marks follow them.
  useEffect(() => {
    setBars(null);
    if (!trade) return undefined;
    let alive = true;
    const get = () => fetchBars(ticker, '1Min').then(({ bars: b }) => { if (alive) setBars(b); }).catch(() => {});
    get();
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') get(); }, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [ticker, trade && trade.time]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => (trade && bars ? tradeStatus(bars, trade, tfSec) : null), [trade, bars, tfSec]);

  // Live: every second, the forming candle's high/low against our SL and the TPs,
  // so a touch shows at once instead of when the 1-minute candles are re-read.
  const [live, setLive] = useState(null); // { hitSec, hit: [3] } seen on the live candle
  useEffect(() => {
    setLive(null);
    if (!trade || !base || base.slHit) return undefined;
    const side = trade.side === 'buy' ? 'call' : 'put';
    const id = setInterval(() => {
      const b = lastBarRef.current;
      if (!b || b.time < trade.time) return;
      setLive((prev) => {
        const p = prev || { hitSec: null, hit: [false, false, false] };
        if (p.hitSec != null) return prev;
        const hitSec = isHit(side, base.sl, b.low, b.high) ? b.time : null;
        const hit = trade.tp.map((t, k) => p.hit[k] || (hitSec == null && isHit(side === 'call' ? 'put' : 'call', t, b.low, b.high)));
        return hitSec == null && hit.every((h, k) => h === p.hit[k]) ? prev : { hitSec, hit };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [trade, base, lastBarRef]);
  const status = base && live
    ? { ...base, slHit: live.hitSec != null, hitSec: live.hitSec ?? base.hitSec, hit: base.hit.map((h, k) => h || live.hit[k]) }
    : base;

  useEffect(() => {
    const series = seriesRef.current;
    if (ref.current.series !== series) {
      const old = ref.current;
      if (old.series && old.layer) { try { old.series.detachPrimitive(old.layer.layer); } catch (_) {} }
      ref.current = { series, layer: null };
      if (series) {
        const l = levelsLayer();
        try { series.attachPrimitive(l.layer); ref.current.layer = l; } catch (_) {}
      }
    }
    const l = ref.current.layer;
    if (!l) return;
    if (!trade || !status) { l.set([], null); return; }
    if (status.slHit) { // stopped out: only the stop, from the triangle to the candle that hit it
      const tf = tfSec || 60;
      l.set([{ price: status.sl, color: STYLE.sl.color, dash: [5, 4], width: 2, end: Math.floor(status.hitSec / tf) * tf, cross: true }], trade.time);
      return;
    }
    const f = (x) => x.toFixed(2);
    l.set([
      ...trade.tp.map((p, k) => ({ price: p, ...STYLE.tp[k], bg: LABEL_BG.tp[k], text: `TP${k + 1}${status.hit[k] ? ' ✓' : ''} ${f(p)}` })),
      { price: trade.entry, ...STYLE.entry, bg: LABEL_BG.entry, text: `ENTRY ${f(trade.entry)}` },
      { price: status.sl, ...STYLE.sl, bg: LABEL_BG.sl, text: `SL${status.slHit ? ' ✗' : ''} ${f(status.sl)}` },
    ], trade.time);
  });

  useEffect(() => () => {
    const { series, layer } = ref.current;
    if (series && layer) { try { series.detachPrimitive(layer.layer); } catch (_) {} }
  }, []);

  return null;
}
