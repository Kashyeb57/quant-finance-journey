/*
 * What the live option chain says about each contract, as plain arithmetic on
 * the latest quotes. These are facts about cost and activity, each with a fixed
 * rule; none of them is a prediction or a signal to trade.
 *
 *   spread     ask - bid, per share ($). Paid once on the way in and out.
 *   decay      |theta| x hold / 390: time value lost over the hold (theta is
 *              per day; 390 trading minutes). An estimate.
 *   needMove   (spread + decay) / |delta|: how far the STOCK must move your way
 *              within the hold just to break even on this contract.
 *   flowUsd    contracts traded in the bridge's last few minutes x mid x 100.
 *
 * Tags (per side, among contracts with |delta| 0.30-0.70 for the cost tags):
 *   tight   smallest spread as a share of the price
 *   cheap   smallest needMove
 *   active  most dollars traded in the flow window
 *   fresh   today's volume is larger than the open interest
 */

export const HOLDS = [10, 30, 60];
const NEAR = [0.3, 0.7];
const TRADING_MIN = 390;

const pos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function contractStats(q, holdMin = 30) {
  if (!q || !pos(q.bid) || !pos(q.ask) || q.ask < q.bid) return null;
  const mid = (q.bid + q.ask) / 2;
  const spread = q.ask - q.bid;
  const absDelta = Math.abs(q.delta ?? NaN);
  const decay = Number.isFinite(q.theta) ? Math.abs(q.theta) * holdMin / TRADING_MIN : null;
  return {
    mid,
    spread,
    spreadPct: spread / mid,
    decay,
    needMove: decay != null && absDelta >= 0.05 ? (spread + decay) / absDelta : null,
    flowUsd: Number.isFinite(q.dVol) ? q.dVol * mid * 100 : null,
    near: absDelta >= NEAR[0] && absDelta <= NEAR[1],
  };
}

const lowest = (items, key) => items.reduce((best, x) => (x.s[key] != null && (!best || x.s[key] < best.s[key]) ? x : best), null);

/** rows [{ k, call, put }] -> { stats: { '735C': {...} }, tags: { '735C': ['tight'] }, flow: { call, put } }. */
export function chainSignals(rows, holdMin = 30) {
  const stats = {}, tags = {}, flow = { call: null, put: null };
  for (const [side, letter] of [['call', 'C'], ['put', 'P']]) {
    const items = [];
    for (const r of rows || []) {
      const s = contractStats(r[side], holdMin);
      if (!s) continue;
      const id = `${r.k}${letter}`;
      stats[id] = s;
      tags[id] = [];
      items.push({ id, s, q: r[side] });
      if (s.flowUsd != null) flow[side] = (flow[side] || 0) + s.flowUsd;
      if (pos(r[side].oi) && r[side].volume > r[side].oi) tags[id].push('fresh');
    }
    const near = items.filter((x) => x.s.near);
    const tight = lowest(near, 'spreadPct');
    const cheap = lowest(near, 'needMove');
    const active = items.reduce((best, x) => (x.s.flowUsd > 0 && (!best || x.s.flowUsd > best.s.flowUsd) ? x : best), null);
    if (tight) tags[tight.id].push('tight');
    if (cheap) tags[cheap.id].push('cheap');
    if (active) tags[active.id].push('active');
  }
  return { stats, tags, flow };
}

/** $1,234,000 -> "$1.23M"; $45,300 -> "$45K". */
export function fmtUsdShort(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${Math.round(v)}`;
}
