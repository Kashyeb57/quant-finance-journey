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
  const r = await fetch(`${base}/_x/overlay?${q}`, { signal: AbortSignal.timeout(8000) });
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

/** Marks with two colors ({ split: [left, right], price }) are drawn by splitMarks; the rest by the library. */
export function partitionMarks(markers) {
  const plain = [];
  const split = [];
  for (const m of markers || []) (Array.isArray(m.split) && Number.isFinite(m.price) ? split : plain).push(m);
  return { plain, split };
}

/*
 * A triangle colored half and half (left | right) under a buy bar or over a sell
 * bar, with its label, drawn on the candle series.
 */
function splitMarks() {
  let marks = [];
  let ctx = null;
  const SIZE = 13;
  const GAP = 7;
  const renderer = {
    draw(target) {
      if (!ctx || !marks.length) return;
      const ts = ctx.chart.timeScale();
      target.useMediaCoordinateSpace(({ context: c }) => {
        c.save();
        c.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        c.textAlign = 'center';
        for (const m of marks) {
          const x = ts.timeToCoordinate(m.time);
          const yPrice = ctx.series.priceToCoordinate(m.price);
          if (x == null || yPrice == null) continue;
          const up = m.position === 'belowBar';
          const tip = up ? yPrice + GAP : yPrice - GAP;
          const base = up ? tip + SIZE : tip - SIZE;
          const half = SIZE * 0.55;
          const side = (color, dx) => {
            c.beginPath();
            c.moveTo(x, tip);
            c.lineTo(x + dx, base);
            c.lineTo(x, base);
            c.closePath();
            c.fillStyle = color;
            c.fill();
          };
          side(m.split[0], -half);
          side(m.split[1], half);
          if (m.text) {
            c.fillStyle = m.split[0];
            c.textBaseline = up ? 'top' : 'bottom';
            c.fillText(m.text, x, up ? base + 3 : base - 3);
          }
        }
        c.restore();
      });
    },
  };
  const view = { zOrder: () => 'top', renderer: () => renderer };
  return {
    attached(param) { ctx = param; },
    detached() { ctx = null; },
    updateAllViews() {},
    paneViews: () => [view],
    set(list) { marks = list; if (ctx) ctx.requestUpdate(); },
  };
}

/** Line on the price pane; in the pane below a line, bars from zero at its marks, and a zero line. */
export function createOverlay(LC, chart, candles) {
  const quiet = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  const line = chart.addSeries(LC.LineSeries, { ...quiet, lineWidth: 2 });
  let lowerData = [];
  const visibleLower = () => {
    const r = chart.timeScale().getVisibleRange();
    return lowerData.filter((p) => !r || (p.time >= r.from && p.time <= r.to)).map((p) => p.value);
  };
  const zeroScale = { autoscaleInfoProvider: (original) => robustRange(visibleLower()) || withZero(original()) };
  const lowerMarks = chart.addSeries(LC.HistogramSeries, { ...quiet, ...zeroScale, base: 0 }, 1);
  const lower = chart.addSeries(LC.LineSeries, { ...quiet, ...zeroScale, color: LOWER_COLOR, lineWidth: 2 }, 1);
  lower.createPriceLine({ price: 0, color: 'rgba(120,123,134,0.75)', lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
  const marks = LC.createSeriesMarkers(candles, []);
  const twoTone = splitMarks();
  candles.attachPrimitive(twoTone);
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
      lowerMarks.setData(result.lowerMarks || []);
      const { plain, split } = partitionMarks(result.markers);
      marks.setMarkers(plain);
      twoTone.set(split);
    },
    remove() {
      try {
        marks.detach();
        candles.detachPrimitive(twoTone);
        chart.removeSeries(line);
        chart.removeSeries(lower);
        chart.removeSeries(lowerMarks);
      } catch (_) { /* the chart was already disposed */ }
    },
  };
}
