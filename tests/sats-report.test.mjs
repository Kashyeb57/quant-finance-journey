import test from 'node:test';
import assert from 'node:assert/strict';
import {isSatsEvaluation} from '../src/components/Brain/satsReport.mjs';

const fixture = () => {
  const point = {time: '2026-09-01T18:00:00Z', equity: 1};
  const metric = {return_pct: 0, net_pnl: 0, max_drawdown_pct: 0, order_sides: 0, trade_count: 0, bars: 100, curve: [point]};
  return {schema: 2, strategy: 'sats', symbol: 'MU', timeframe: '15Min', paper_ready: false,
    settings: {execution: {capital: 10000, exit_target: 'tp3'}}, cost_bps_per_side: 5,
    split: {test: 100, test_start: point.time, test_end: point.time}, data: {rows: 500},
    attribution: 'Source indicator', limitations: ['Research only'], checks: {verified: false},
    signal_counts: {buy: 5, sell: 5},
    latest: {trend: 1, signal: 'hold', reason: 'Waiting', bar_time: point.time,
      tqi: .7, er: .5, vol_ratio: 1, tqi_efficiency: .5, tqi_volume: .5, tqi_structure: .5, tqi_momentum: .5},
    metrics: {sats: metric, fixed_band: metric, passive: metric},
    test_observations: [{time: point.time, close: 100, line: 98, tqi: .7, trend: 1, signal: 'buy'}]};
};

test('SATS reports are a distinct research format, never paper authorization', () => {
  assert.equal(isSatsEvaluation(fixture()), true);
  for (const change of [{paper_ready: true}, {paper_ready: 'false'}, {schema: 1}, {strategy: 'fly'}, {symbol: 'SPY'}, {timeframe: '1Min'}]) {
    assert.equal(isSatsEvaluation({...fixture(), ...change}), false);
  }
});

test('missing display fields and object-valued text are rejected before rendering', () => {
  for (const change of [{latest: {}}, {split: {}}, {settings: {}}, {limitations: {}}, {checks: []},
    {attribution: {}}, {signal_counts: {}}]) {
    assert.equal(isSatsEvaluation({...fixture(), ...change}), false);
  }
  const value = fixture();
  value.latest.reason = {unexpected: true};
  assert.equal(isSatsEvaluation(value), false);
});

test('malformed or oversized plot data cannot reach the SATS view', () => {
  for (const value of [null, {}, {...fixture(), metrics: {}}, {...fixture(), test_observations: []},
    {...fixture(), test_observations: Array(501).fill(fixture().test_observations[0])}]) {
    assert.equal(isSatsEvaluation(value), false);
  }
  for (const change of [{close: NaN}, {line: Infinity}, {time: 'invalid'}, {tqi: 1.5}, {signal: 'trade-live'}, {trend: 0}]) {
    const value = fixture();
    value.test_observations = [{...value.test_observations[0], ...change}];
    assert.equal(isSatsEvaluation(value), false);
  }
});
