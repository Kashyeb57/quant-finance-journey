import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyReturns, rollingSharpe, drawdowns, historicalVar, pnlProfile, positionWeights,
  realizedVol, atmIv, ivSurface, oiDepth, sectorBreadth,
} from '../src/components/Desk/quant.mjs';

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 20);

test('dailyReturns and drawdowns follow the equity curve', () => {
  const h = [100, 110, 99, 121].map((value, t) => ({ t, value }));
  const r = dailyReturns(h);
  assert.equal(r.length, 3);
  assert.ok(Math.abs(r[0] - 0.1) < 1e-12);
  assert.ok(Math.abs(r[1] + 0.1) < 1e-12);
  const dd = drawdowns(h.map((p) => p.value));
  assert.deepEqual(dd.map((x) => +x.toFixed(6)), [0, 0, -10, 0]);
});

test('rollingSharpe is zero for flat windows and positive for steady gains', () => {
  assert.deepEqual(rollingSharpe(new Array(25).fill(0), 20), new Array(6).fill(0));
  const gains = Array.from({ length: 20 }, (_, i) => 0.01 + (i % 2 ? 0.002 : -0.002));
  const [s] = rollingSharpe(gains, 20);
  assert.ok(s > 10);
});

test('historicalVar needs history and returns a positive loss', () => {
  assert.equal(historicalVar([0.01, -0.02]), null);
  const r = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000); // -5% .. +4.9%
  const v = historicalVar(r, 0.95);
  assert.ok(v > 0.04 && v <= 0.05);
});

test('pnlProfile is linear in the net exposure, shorts netting out', () => {
  const p = pnlProfile([{ marketValue: 1000 }, { marketValue: -400 }], 10, 21);
  assert.equal(p.net, 600);
  assert.equal(p.points[0].shock, -10);
  assert.ok(Math.abs(p.points[0].pnl + 60) < 1e-9);
  assert.ok(Math.abs(p.points[20].pnl - 60) < 1e-9);
});

test('positionWeights share gross exposure and flag shorts', () => {
  const w = positionWeights([{ symbol: 'A', marketValue: 300 }, { symbol: 'B', marketValue: -100 }]);
  assert.deepEqual(w.map((x) => [x.symbol, x.weight, x.short]), [['A', 0.75, false], ['B', 0.25, true]]);
  assert.deepEqual(positionWeights([]), []);
});

test('realizedVol annualises close-to-close log returns', () => {
  assert.equal(realizedVol([{ close: 1 }], 20), null);
  const bars = Array.from({ length: 21 }, (_, i) => ({ close: 100 * Math.exp((i % 2 ? 0.01 : -0.01) * (i ? 1 : 0)) }));
  const flat = Array.from({ length: 21 }, () => ({ close: 50 }));
  assert.equal(realizedVol(flat, 20), 0);
  assert.ok(realizedVol(bars, 20) > 0.2);
});

// A tiny synthetic chain: 3 expiries, strikes 80..120, smile = 0.3 + skew.
function chain() {
  const rows = [];
  for (const d of [3, 10, 30]) {
    for (let k = 80; k <= 120; k += 5) {
      const iv = 0.3 + 0.002 * Math.abs(100 - k) + d / 1000;
      rows.push({ k, e: NOW + d * DAY, coi: k >= 100 ? 10 : 2, poi: k < 100 ? 20 : 1, civ: iv, piv: iv });
    }
  }
  return { spot: 100, rows };
}

test('atmIv picks the first expiry past minDays at the strike nearest spot', () => {
  const iv = atmIv(chain(), 5, NOW);
  assert.ok(Math.abs(iv - 0.31) < 1e-9);
  assert.equal(atmIv(null), null);
});

test('ivSurface builds a regular grid ordered by expiry', () => {
  const s = ivSurface(chain(), { cols: 9, now: NOW });
  assert.equal(s.rows.length, 3);
  assert.equal(s.m.length, 9);
  assert.ok(s.rows[0].days < s.rows[2].days);
  // smile: wings above the centre
  const mid = s.rows[0].z[4];
  assert.ok(s.rows[0].z[0] > mid && s.rows[0].z[8] > mid);
  assert.ok(s.zMin <= mid && s.zMax >= s.rows[2].z[0]);
});

test('oiDepth accumulates puts below spot and calls above it, outward', () => {
  const d = oiDepth(chain(), 0.15);
  // strikes 85..95 below spot, 100..115 above (80 and 120 are outside ±15%)
  assert.deepEqual(d.puts.map((p) => p.k), [85, 90, 95]);
  assert.deepEqual(d.puts.map((p) => p.cum), [180, 120, 60]);
  assert.deepEqual(d.calls.map((p) => p.cum), [30, 60, 90, 120]);
  assert.equal(d.putTotal, 180);
  assert.equal(d.callTotal, 120);
});

test('sectorBreadth counts names up and skips missing quotes', () => {
  const b = sectorBreadth([{ name: 'X', tickers: ['A', 'B', 'C'] }], { A: { changePct: 1 }, B: { changePct: -3 } });
  assert.deepEqual(b, [{ name: 'X', total: 2, up: 1, avg: -1 }]);
});

// ── Option pricing behind the P&L profile ────────────────────────────────────
import { parseOptionSymbol, bsPrice, bsDelta, impliedVol } from '../src/components/Desk/quant.mjs';

test('parseOptionSymbol reads OCC symbols and rejects stock tickers', () => {
  assert.deepEqual(parseOptionSymbol('AMD261120C00500000'), { root: 'AMD', expiryMs: Date.UTC(2026, 10, 20, 20), type: 'call', strike: 500 });
  assert.equal(parseOptionSymbol('SPY261218P00412500').strike, 412.5);
  assert.equal(parseOptionSymbol('AMD'), null);
});

test('Black-Scholes satisfies put-call parity and a known value', () => {
  const [S, K, T, v, r] = [100, 100, 1, 0.2, 0.05];
  const c = bsPrice(S, K, T, v, 'call', r), p = bsPrice(S, K, T, v, 'put', r);
  assert.ok(Math.abs(c - 10.4506) < 1e-3, `call ${c}`); // textbook value
  assert.ok(Math.abs(c - p - (S - K * Math.exp(-r * T))) < 1e-9);
  assert.ok(Math.abs(bsDelta(S, K, T, v, 'call', r) - bsDelta(S, K, T, v, 'put', r) - 1) < 1e-9);
  assert.equal(bsPrice(110, 100, 0, 0.3, 'call'), 10, 'intrinsic at expiry');
});

test('impliedVol recovers the volatility that priced the option', () => {
  for (const [type, K, v] of [['call', 90, 0.35], ['put', 105, 0.6], ['call', 130, 0.9]]) {
    const price = bsPrice(100, K, 0.25, v, type);
    assert.ok(Math.abs(impliedVol(price, 100, K, 0.25, type) - v) < 1e-6, `${type} ${K}`);
  }
  assert.equal(impliedVol(0.0001, 100, 100, 0.25, 'call'), null, 'below any vol: no answer');
});

test('pnlProfile reprices a long call with curvature and sets aside options it cannot price', () => {
  const now = Date.UTC(2026, 9, 20, 20);
  const price = bsPrice(100, 100, 30 / 365, 0.5, 'call');
  const call = { symbol: 'AMD261119C00100000', qty: 2, side: 'long', price };
  const p = pnlProfile([call], 10, 21, { spots: { AMD: 100 }, now });
  const at = (s) => p.points.find((x) => Math.abs(x.shock - s) < 1e-9).pnl;
  assert.ok(Math.abs(at(0)) < 1e-6, 'no move, no P&L');
  assert.ok(at(10) > 0 && at(-10) < 0);
  assert.ok(at(10) > -at(-10), 'long gamma: gains outrun losses');
  assert.ok(p.net > 0 && p.net < 2 * 100 * 100, 'dollar delta is between 0 and the full notional');
  assert.deepEqual(p.unmodeled, []);
  const short = pnlProfile([{ ...call, side: 'short' }], 10, 21, { spots: { AMD: 100 }, now });
  assert.ok(Math.abs(short.points[20].pnl + p.points[20].pnl) < 1e-6, 'a short is the mirror image');
  const blind = pnlProfile([call, { marketValue: 1000 }], 10, 21, { spots: {}, now });
  assert.deepEqual(blind.unmodeled, ['AMD261119C00100000']);
  assert.equal(blind.net, 1000, 'the stock still counts');
});
