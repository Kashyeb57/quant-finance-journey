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

/** Line on the price pane, a second line in a pane below, marks on the candles. */
export function createOverlay(LC, chart, candles) {
  const quiet = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  const line = chart.addSeries(LC.LineSeries, { ...quiet, lineWidth: 2 });
  const lower = chart.addSeries(LC.LineSeries, { ...quiet, color: LOWER_COLOR, lineWidth: 1 }, 1);
  lower.createPriceLine({ price: 0, color: 'rgba(120,123,134,0.6)', lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
  const marks = LC.createSeriesMarkers(candles, []);
  const panes = chart.panes();
  if (panes.length > 1) {
    panes[0].setStretchFactor(0.78);
    panes[1].setStretchFactor(0.22);
  }
  return {
    chart,
    set(result) {
      line.setData(result.line);
      lower.setData(result.lower);
      marks.setMarkers(result.markers);
    },
    remove() {
      try {
        marks.detach();
        chart.removeSeries(line);
        chart.removeSeries(lower);
      } catch (_) { /* the chart was already disposed */ }
    },
  };
}
