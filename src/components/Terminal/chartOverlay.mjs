/*
 * An overlay on the price chart. The server returns finished points and marks
 * for a symbol and timeframe, and this file draws them.
 */

export const OVERLAY_LABEL = 'SATS';
const LOWER_COLOR = '#2962FF';

/** Time of the newest finished candle (the one still forming does not count). */
export function lastClosedTime(bars, granSec, nowSec) {
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    if (bars[i].time + granSec <= nowSec) return bars[i].time;
  }
  return 0;
}

export async function requestOverlay(base, symbol, tfKey, last) {
  const q = new URLSearchParams({ symbol, tf: tfKey, last: String(last) });
  // no-cache: always check with the server (it answers from its own cache), so a
  // browser never draws an old copy it kept from earlier.
  const r = await fetch(`${base}/_x/overlay?${q}`, { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Stretch an autoscale range so it always includes zero (keeps the zero line on screen). */
export function withZero(info) {
  if (!info || !info.priceRange) return info;
  const { minValue, maxValue } = info.priceRange;
  return { ...info, priceRange: { minValue: Math.min(minValue, 0), maxValue: Math.max(maxValue, 0) } };
}

/*
 * Scale for the lower line from the visible points, ignoring the few most extreme
 * ones (a gap at the open makes a spike that would flatten the rest of the line).
 * The spike still draws; it just runs off the pane. Always includes zero.
 */
export function robustRange(values, tail = 0.04) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < 2) return null;
  const at = (q) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
  let lo = Math.min(at(tail), 0);
  let hi = Math.max(at(1 - tail), 0);
  const pad = (hi - lo) * 0.12 || 1;
  lo -= lo < 0 ? pad : 0;
  hi += hi > 0 ? pad : 0;
  return { priceRange: { minValue: lo, maxValue: hi } };
}

/**
 * Signal marks that carry a bar price are drawn as solid triangles (two-color when
 * { split: [left, right] }); the rest (dots, FLAT) stay with the library.
 */
export function partitionMarks(markers) {
  const plain = [];
  const triangles = [];
  for (const m of markers || []) (Number.isFinite(m.price) ? triangles : plain).push(m);
  return { plain, triangles };
}

/** Left and right colors of a triangle: both halves the mark's color unless it is split. */
export function triangleColors(m) {
  return Array.isArray(m.split) && m.split.length === 2 ? m.split : [m.color, m.color];
}

/* A series primitive that runs draw(context, series, timeScale) in media pixels. */
function canvasLayer(draw, zOrder) {
  let ctx = null;
  const renderer = {
    draw(target) {
      if (!ctx) return;
      target.useMediaCoordinateSpace(({ context }) => {
        context.save();
        draw(context, ctx.series, ctx.chart.timeScale());
        context.restore();
      });
    },
  };
  const view = { zOrder: () => zOrder, renderer: () => renderer };
  return {
    attached(param) { ctx = param; },
    detached() { ctx = null; },
    updateAllViews() {},
    paneViews: () => [view],
    refresh() { if (ctx) ctx.requestUpdate(); },
  };
}

/** Solid triangle under a buy bar or over a sell bar, with its label. */
function triangleLayer() {
  let marks = [];
  const SIZE = 13;
  const GAP = 7;
  const layer = canvasLayer((c, series, ts) => {
    c.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    c.textAlign = 'center';
    for (const m of marks) {
      const x = ts.timeToCoordinate(m.time);
      const yPrice = series.priceToCoordinate(m.price);
      if (x == null || yPrice == null) continue;
      const up = m.position === 'belowBar';
      const tip = up ? yPrice + GAP : yPrice - GAP;
      const base = up ? tip + SIZE : tip - SIZE;
      const half = SIZE * 0.55;
      const [left, right] = triangleColors(m);
      for (const [color, dx] of [[left, -half], [right, half]]) {
        c.beginPath();
        c.moveTo(x, tip);
        c.lineTo(x + dx, base);
        c.lineTo(x, base);
        c.closePath();
        c.fillStyle = color;
        c.fill();
      }
      if (m.text) {
        c.fillStyle = left;
        c.textBaseline = up ? 'top' : 'bottom';
        c.fillText(m.text, x, up ? base + 3 : base - 3);
      }
    }
  }, 'top');
  return { layer, set(list) { marks = list; layer.refresh(); } };
}

/** One-pixel lines from zero to the value, under the lower line (like TradingView's thin histogram). */
function stemLayer() {
  let stems = [];
  const layer = canvasLayer((c, series, ts) => {
    const y0 = series.priceToCoordinate(0);
    if (y0 == null) return;
    c.lineWidth = 1;
    for (const s of stems) {
      const x = ts.timeToCoordinate(s.time);
      const y = series.priceToCoordinate(s.value);
      if (x == null || y == null) continue;
      const px = Math.round(x) + 0.5;
      c.strokeStyle = s.color;
      c.beginPath();
      c.moveTo(px, y0);
      c.lineTo(px, y);
      c.stroke();
    }
  }, 'bottom');
  return { layer, set(list) { stems = list; layer.refresh(); } };
}

/** Line on the price pane; in the pane below a line, thin lines from zero at its marks, and a zero line. */
export function createOverlay(LC, chart, candles) {
  const quiet = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  const line = chart.addSeries(LC.LineSeries, { ...quiet, lineWidth: 2 });
  let lowerData = [];
  const visibleLower = () => {
    const r = chart.timeScale().getVisibleRange();
    return lowerData.filter((p) => !r || (p.time >= r.from && p.time <= r.to)).map((p) => p.value);
  };
  const zeroScale = { autoscaleInfoProvider: (original) => robustRange(visibleLower()) || withZero(original()) };
  const lower = chart.addSeries(LC.LineSeries, { ...quiet, ...zeroScale, color: LOWER_COLOR, lineWidth: 2 }, 1);
  lower.createPriceLine({ price: 0, color: 'rgba(120,123,134,0.75)', lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
  const stems = stemLayer();
  lower.attachPrimitive(stems.layer);
  const marks = LC.createSeriesMarkers(candles, []);
  const triangles = triangleLayer();
  candles.attachPrimitive(triangles.layer);
  const panes = chart.panes();
  if (panes.length > 1) {
    panes[0].setStretchFactor(0.78);
    panes[1].setStretchFactor(0.22);
  }
  return {
    chart,
    set(result) {
      line.setData(result.line);
      lowerData = result.lower;
      lower.setData(result.lower);
      stems.set(result.lowerMarks || []);
      const parts = partitionMarks(result.markers);
      marks.setMarkers(parts.plain);
      triangles.set(parts.triangles);
    },
    remove() {
      try {
        marks.detach();
        candles.detachPrimitive(triangles.layer);
        lower.detachPrimitive(stems.layer);
        chart.removeSeries(line);
        chart.removeSeries(lower);
      } catch (_) { /* the chart was already disposed */ }
    },
  };
}
