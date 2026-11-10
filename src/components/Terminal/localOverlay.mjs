/*
 * An optional chart overlay supplied by a helper running on the owner's own PC.
 * The helper does the calculating and returns finished points, so this file
 * only draws what it receives. Nothing is requested unless the helper is
 * already known to be running (see useLiveOptions).
 */

const ENDPOINT = 'http://127.0.0.1:8765/overlay';
const LOWER_COLOR = '#2962FF';

/** Only finished candles: the one still forming is left out. */
export function closedBars(bars, granSec, nowSec) {
  return bars.filter((b) => b.time + granSec <= nowSec);
}

export async function requestOverlay(bars, tfKey, crypto) {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tf: tfKey, crypto, bars }),
    signal: AbortSignal.timeout(5000),
  });
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
