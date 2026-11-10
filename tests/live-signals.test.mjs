// The live option chain's cost and activity figures, and which contract each tag lands on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contractStats, chainSignals, fmtUsdShort } from '../src/components/Desk/liveSignals.mjs';

const q = (bid, ask, delta, theta, extra = {}) => ({ bid, ask, delta, theta, volume: 100, oi: 500, ...extra });

test('move needed = (spread + time decay over the hold) / delta', () => {
  // MU $735 call at the 2026-11-09 close: 28.05 / 28.20, delta 0.51, theta -3.70 per day.
  const s = contractStats(q(28.05, 28.20, 0.51, -3.70), 30);
  assert.ok(Math.abs(s.spread - 0.15) < 1e-9);
  assert.ok(Math.abs(s.decay - 3.70 * 30 / 390) < 1e-9);
  assert.ok(Math.abs(s.needMove - (0.15 + 3.70 * 30 / 390) / 0.51) < 1e-9);
  assert.ok(s.needMove > 0.8 && s.needMove < 0.9, 'about 85 cents on the stock');
  assert.ok(contractStats(q(28.05, 28.20, 0.51, -3.70), 10).needMove < s.needMove, 'a shorter hold needs less');
  assert.equal(contractStats(q(28.05, 28.20, -0.49, -3.70), 30).needMove > 0, true, 'puts use |delta|');
});

test('no figures without a two-sided quote; no move figure for a tiny delta', () => {
  assert.equal(contractStats(q(0, 1.2, 0.5, -1)), null);
  assert.equal(contractStats(q(1.3, 1.2, 0.5, -1)), null);
  assert.equal(contractStats(null), null);
  assert.equal(contractStats(q(0.05, 0.06, 0.01, -0.1)).needMove, null);
});

test('flow is the contracts traded in the window times the mid', () => {
  assert.equal(contractStats(q(2, 3, 0.5, -1, { dVol: 40 })).flowUsd, 40 * 2.5 * 100);
  assert.equal(contractStats(q(2, 3, 0.5, -1)).flowUsd, null, 'unknown until the bridge has two reads');
});

test('tags land on the right contract, one per side, cost tags only near the money', () => {
  const rows = [
    { k: 720, call: q(36.0, 36.6, 0.75, -3.0, { dVol: 5 }), put: q(22.2, 22.45, -0.25, -3.5) },   // call outside 0.3-0.7
    { k: 730, call: q(30.6, 30.8, 0.53, -3.6, { dVol: 60 }), put: q(26.5, 26.8, -0.47, -3.6, { dVol: 10 }) },
    { k: 740, call: q(25.5, 25.7, 0.48, -3.7, { dVol: 20, volume: 900 }), put: q(31.4, 31.65, -0.52, -3.5, { dVol: 80 }) },
  ];
  const { tags, flow, stats } = chainSignals(rows, 30);
  assert.deepEqual(tags['730C'], ['tight', 'cheap', 'active']);
  assert.deepEqual(tags['740C'], ['fresh'], 'volume 900 > open interest 500');
  assert.deepEqual(tags['720C'], []);
  assert.deepEqual(tags['740P'], ['tight', 'cheap', 'active']);
  assert.equal(flow.call, stats['720C'].flowUsd + stats['730C'].flowUsd + stats['740C'].flowUsd);
  assert.ok(flow.put > 0);
});

test('nothing is tagged active before any flow is known', () => {
  const { tags, flow } = chainSignals([{ k: 730, call: q(30.6, 30.8, 0.53, -3.6), put: null }]);
  assert.deepEqual(tags['730C'], ['tight', 'cheap']);
  assert.equal(flow.call, null);
  assert.deepEqual(chainSignals([]).tags, {});
});

test('short dollar format', () => {
  assert.equal(fmtUsdShort(1234000), '$1.23M');
  assert.equal(fmtUsdShort(45300), '$45K');
  assert.equal(fmtUsdShort(320), '$320');
  assert.equal(fmtUsdShort(null), '—');
});
