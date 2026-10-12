import test from 'node:test';
import assert from 'node:assert/strict';
import {isSatsLearningEvaluation, isSatsLearningSignal} from '../src/components/Brain/satsLearningReport.mjs';

// Synthetic schema fixtures only. These numbers are never loaded as market data.
const fixture = () => {
  const start = '2026-09-16T13:30:00Z', end = '2026-09-16T20:00:00Z';
  const metric = () => ({net_pnl: 2, return_pct: .02, max_drawdown_pct: -.01,
    trade_count: 1, order_sides: 2, bars: 26,
    curve: [{time: '2026-09-16T13:45:00Z', equity: 1}, {time: end, equity: 1.0002}]});
  const compact = () => ({net_pnl: 0, return_pct: 0, max_drawdown_pct: 0, trade_count: 0, order_sides: 0, bars: 26});
  return {schema: 3, strategy: 'sats-learning', symbol: 'MU', timeframe: '15Min', paper_ready: false,
    model_id: 'synthetic-validator-fixture', created_at: '2026-09-17T12:00:00.123456+00:00',
    attribution: 'Synthetic schema fixture, not a market result.', limitations: ['Research only; synthetic test values.'],
    checks: {fit_available: true, at_least_10_fresh_order_sides: false, execution_adapter_verified: false},
    cost_bps_per_side: 5,
    settings: {indicator: {atr_length: 14, band_width: 2, er_length: 20, atr_baseline: 100,
      rsi_length: 14, rsi_memory: 20, volume_length: 20, pivot_length: 3, structure_length: 20,
      momentum_length: 10, source: 'close', adaptive: true, adaptation_strength: .5, quality: true,
      quality_strength: .4, quality_power: 1.5, smooth: true, asymmetric: true, asymmetry_strength: .5,
      efficiency_atr: true, character_flip: true, character_age: 5, character_high: .55, character_low: .25,
      weights: [.35, .20, .25, .20], score_structure: true, score_rsi: true, score_volume: true,
      rsi_overbought: 70, rsi_oversold: 30, stop_buffer: 1.5, stop_cap: 4, targets: [1, 2, 3],
      target_mode: 'Fixed', target_weights: [.6, .4], target_scale_min: .5, target_scale_max: 2,
      target_floor: .5, target_ceiling: 8, timeout_bars: 100},
      execution: {capital: 10000, cost_bps: 5, exit_target: 'tp3', entry_start: 795, entry_end: 915,
        flatten_start: 930, timeout_bars: 100, max_entries_per_day: 6, max_buy_price: 1500,
        entry_clock_timezone: 'America/New_York'},
      learning: {penalty: 10, threshold_net_bps: 0, min_training_setups: 10,
        distribution_limit_std: 6, fly_input_clip_std: 3, target: 'net_pnl / filled_entry_price * 10000'}},
    data: {source: 'Synthetic fixture only', rows: 500, first: '2026-08-01T13:30:00Z', last: end, sha256: 'a'.repeat(64)},
    features: {simple: ['tqi', 'atr_ratio', 'line_distance_atr'], fly: ['return', 'volume', 'volatility', 'trend', 'range', 'momentum']},
    training: {start: '2026-08-01T13:30:00Z', end: '2026-09-15T19:30:00Z', setups: 30, purged: 2},
    evaluation: {kind: 'fresh', start, end, previously_inspected_through: '2026-09-15T20:00:00Z'},
    metrics: {sats: metric(), simple: metric(), fly: metric()},
    folds: [{kind: 'historical', train_end: '2026-09-01T20:00:00Z', test_start: '2026-09-02T13:30:00Z',
      test_end: '2026-09-02T20:00:00Z', training_setups: 10, purged: 1,
      metrics: {sats: compact(), simple: compact(), fly: compact()}}],
    decisions: [{time: '2026-09-16T17:15:00Z', price: 100, tqi: .7, atr_ratio: 1.1, line_distance_atr: .5,
      simple_net_bps: 2, fly_net_bps: 4, simple_accept: true, fly_accept: true, outcome_net_bps: -20}],
    latest: {bar_time: end, signal: 'hold', reason: 'Synthetic saved observation.',
      simple_net_bps: null, fly_net_bps: null, simple_accept: false, fly_accept: false}};
};

test('setup-learning schema is distinct and never permits execution authorization', () => {
  assert.equal(isSatsLearningEvaluation(fixture()), true);
  for (const change of [{schema: 2}, {strategy: 'sats'}, {symbol: 'SPY'}, {timeframe: '1Min'},
    {paper_ready: true}, {paper_ready: 'false'}, {paper_ready: null}, {paper_ready: undefined}]) {
    assert.equal(isSatsLearningEvaluation({...fixture(), ...change}), false);
  }
  for (const value of [null, undefined, [], false, 3, {}, 'saved report']) {
    assert.equal(isSatsLearningEvaluation(value), false);
  }
});

test('empty fresh observations and unavailable fits remain honest valid research states', () => {
  const value = fixture();
  value.training = {start: null, end: null, setups: 0, purged: 12};
  value.decisions = [];
  value.folds = [];
  value.checks.fit_available = false;
  for (const strategy of ['sats', 'simple', 'fly']) {
    value.metrics[strategy] = {net_pnl: 0, return_pct: 0, max_drawdown_pct: 0,
      trade_count: 0, order_sides: 0, bars: 0, curve: []};
  }
  assert.equal(isSatsLearningEvaluation(value), true);
  value.metrics.fly.net_pnl = 1;
  assert.equal(isSatsLearningEvaluation(value), false);
  const unavailable = fixture();
  Object.assign(unavailable.decisions[0], {simple_net_bps: null, fly_net_bps: null,
    simple_accept: false, fly_accept: false, outcome_net_bps: null});
  assert.equal(isSatsLearningEvaluation(unavailable), true);
  unavailable.decisions[0].fly_accept = true;
  assert.equal(isSatsLearningEvaluation(unavailable), false);
});

test('fresh windows must follow inspected history; historical exploration may overlap it', () => {
  const value = fixture();
  value.evaluation.previously_inspected_through = value.evaluation.start;
  assert.equal(isSatsLearningEvaluation(value), false);
  value.evaluation.kind = 'historical_only';
  assert.equal(isSatsLearningEvaluation(value), true);
  value.evaluation.kind = 'independent';
  assert.equal(isSatsLearningEvaluation(value), false);
});

test('all rendered text, feature arrays, checks and settings have bounded primitive types', () => {
  for (const change of [{model_id: {}}, {model_id: ''}, {created_at: {}}, {attribution: {}},
    {limitations: {}}, {limitations: [{}]}, {limitations: Array(26).fill('Too many')},
    {checks: []}, {checks: {}}, {checks: {fit_available: 'true'}}, {settings: {}}]) {
    assert.equal(isSatsLearningEvaluation({...fixture(), ...change}), false);
  }
  for (const path of ['source', 'sha256', 'rows']) {
    const value = fixture();
    value.data[path] = {};
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  for (const features of [{}, {simple: 'tqi', fly: ['return']}, {simple: [{}], fly: ['return']},
    {simple: [], fly: ['return']}, {simple: ['tqi'], fly: Array(41).fill('return')}]) {
    assert.equal(isSatsLearningEvaluation({...fixture(), features}), false);
  }
  for (const area of ['indicator', 'execution', 'learning']) {
    const value = fixture();
    value.settings[area].unexpected = {};
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  for (const weights of [[NaN], [Infinity], [{}], [[.5]], [], Array(17).fill(.1)]) {
    const value = fixture();
    value.settings.indicator.weights = weights;
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  const oversized = fixture();
  oversized.checks = Object.fromEntries(Array.from({length: 41}, (_, i) => [`check_${i}`, true]));
  assert.equal(isSatsLearningEvaluation(oversized), false);
});

test('dates must be ISO timestamps with real calendar dates and chronological windows', () => {
  const nanoseconds = fixture();
  nanoseconds.created_at = '2026-09-17T12:00:00.123456789Z';
  assert.equal(isSatsLearningEvaluation(nanoseconds), true);
  for (const time of ['September 16, 2026', '2026-09-16', '2026-02-30T13:30:00Z',
    '2026-09-16T25:00:00Z', '2026-09-16T13:30:00+99:00', 'invalid', 123]) {
    const value = fixture();
    value.created_at = time;
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  for (const [section, field] of [['data', 'first'], ['data', 'last'], ['training', 'start'],
    ['training', 'end'], ['evaluation', 'start'], ['evaluation', 'end'],
    ['evaluation', 'previously_inspected_through'], ['latest', 'bar_time']]) {
    const value = fixture();
    value[section][field] = 'invalid';
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  for (const section of ['data', 'training', 'evaluation']) {
    const value = fixture();
    const start = section === 'data' ? 'first' : 'start', end = section === 'data' ? 'last' : 'end';
    [value[section][start], value[section][end]] = [value[section][end], value[section][start]];
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  for (const change of [{setups: 1, start: null, end: null}, {setups: 0, start: null}, {purged: -1}, {setups: .5},
    {end: '2026-09-16T13:30:00Z'}]) {
    const value = fixture();
    Object.assign(value.training, change);
    assert.equal(isSatsLearningEvaluation(value), false);
  }
});

test('costs and shared policy fields must be well-formed', () => {
  for (const cost of [-1, NaN, Infinity, '5']) {
    assert.equal(isSatsLearningEvaluation({...fixture(), cost_bps_per_side: cost}), false);
  }
  for (const change of [{capital: 0}, {exit_target: 'trade-live'}, {entry_start: -1}, {entry_start: 1440},
    {entry_start: 1.5}, {entry_end: 500}, {flatten_start: Infinity}, {cost_bps: 7}]) {
    const value = fixture();
    Object.assign(value.settings.execution, change);
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  for (const change of [{penalty: -1}, {penalty: '10'}, {threshold_net_bps: NaN}]) {
    const value = fixture();
    Object.assign(value.settings.learning, change);
    assert.equal(isSatsLearningEvaluation(value), false);
  }
});

test('all three metric sets use finite results, whole counts and one window', () => {
  for (const strategy of ['sats', 'simple', 'fly']) {
    for (const field of ['net_pnl', 'return_pct', 'max_drawdown_pct', 'trade_count', 'order_sides', 'bars']) {
      const value = fixture();
      value.metrics[strategy][field] = Infinity;
      assert.equal(isSatsLearningEvaluation(value), false);
    }
  }
  for (const change of [{trade_count: -1}, {order_sides: .5}, {bars: 501}, {bars: 25},
    {max_drawdown_pct: 1}, {trade_count: 3}, {curve: []}]) {
    const value = fixture();
    Object.assign(value.metrics.fly, change);
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  const missing = fixture();
  delete missing.metrics.simple;
  assert.equal(isSatsLearningEvaluation(missing), false);
});

test('oversized, invalid and out-of-window curve data never reaches SVG plots', () => {
  for (const change of [{time: 'invalid'}, {time: '2026-09-01T13:30:00Z'}, {time: '2026-09-17T13:30:00Z'},
    {equity: NaN}, {equity: Infinity}, {equity: {}}, {equity: -1}]) {
    const value = fixture();
    Object.assign(value.metrics.fly.curve[0], change);
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  const value = fixture();
  value.metrics.fly.curve = Array(241).fill(value.metrics.fly.curve[0]);
  assert.equal(isSatsLearningEvaluation(value), false);
  value.metrics.fly.curve = [fixture().metrics.fly.curve[1], fixture().metrics.fly.curve[0]];
  assert.equal(isSatsLearningEvaluation(value), false);
});

test('decision audits require bounded values and distinguish unavailable outcomes from scores', () => {
  for (const change of [{time: 'invalid'}, {time: '2026-09-15T13:30:00Z'}, {price: 0}, {price: NaN},
    {tqi: 1.1}, {atr_ratio: -1}, {line_distance_atr: Infinity}, {simple_net_bps: {}},
    {fly_net_bps: NaN}, {simple_accept: 'true'}, {fly_accept: 1}, {outcome_net_bps: undefined}]) {
    const value = fixture();
    Object.assign(value.decisions[0], change);
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  const value = fixture();
  value.decisions = Array(301).fill(value.decisions[0]);
  assert.equal(isSatsLearningEvaluation(value), false);
  value.decisions = Array(2).fill(value.decisions[0]);
  assert.equal(isSatsLearningEvaluation(value), false);
  value.decisions = null;
  assert.equal(isSatsLearningEvaluation(value), false);
});

test('historical folds remain compact, bounded and chronologically purged', () => {
  for (const change of [{kind: 'fresh'}, {train_end: 'invalid'}, {test_end: 'invalid'},
    {train_end: '2026-09-02T13:30:00Z'}, {training_setups: -1}, {purged: .5}, {metrics: {}}]) {
    const value = fixture();
    Object.assign(value.folds[0], change);
    assert.equal(isSatsLearningEvaluation(value), false);
  }
  const value = fixture();
  value.folds[0].metrics.fly.curve = [];
  assert.equal(isSatsLearningEvaluation(value), false);
  value.folds = Array(21).fill(fixture().folds[0]);
  assert.equal(isSatsLearningEvaluation(value), false);
  value.folds = {};
  assert.equal(isSatsLearningEvaluation(value), false);
});

test('latest observation cannot contain untyped text or pretend an unscored setup is accepted', () => {
  for (const change of [{signal: 'buy-live'}, {reason: {}}, {reason: ''}, {simple_net_bps: Infinity},
    {fly_net_bps: undefined}, {simple_accept: true}, {fly_accept: 'false'}]) {
    const value = fixture();
    Object.assign(value.latest, change);
    assert.equal(isSatsLearningEvaluation(value), false);
  }
});

test('current observations match the frozen pipeline and leave saved evaluation unchanged', () => {
  const evaluation = fixture();
  evaluation.model_id = 'a4df9760250e34c1';
  evaluation.evaluation.fresh_training_cutoff = evaluation.evaluation.start;
  const before = structuredClone(evaluation);
  const signal = {strategy: 'sats-learning', pipeline: 'sats-setup-net-bps-v1', symbol: 'MU', timeframe: '15Min',
    model_id: evaluation.model_id, bar_time: '2026-10-09T17:15:00Z', decision_time: '2026-10-09T17:30:00Z',
    training_boundary: evaluation.evaluation.fresh_training_cutoff, price: 100, target_position: 0,
    predicted_return: null, distribution_ok: true, eligible_setup: true, setup_signal: 'buy',
    reason: 'Synthetic eligible setup forecast.', simple_net_bps: 2, fly_net_bps: -1, simple_accept: true, fly_accept: false,
    sats: {trend: 1, tqi: .7, atr_ratio: .01, vol_ratio: 1.2, line_distance_atr: .5, er: .4}};
  assert.equal(isSatsLearningSignal(signal, evaluation), true);
  assert.deepEqual(evaluation, before);
  assert.equal(isSatsLearningSignal(signal, {...evaluation, training: {...evaluation.training, model: undefined}}), true);
  for (const change of [{strategy: 'fly'}, {pipeline: 'legacy'}, {symbol: 'SPY'}, {timeframe: '1Min'},
    {model_id: 'bbbbbbbbbbbbbbbb'}, {bar_time: '2026-10-09T17:16:00Z'}, {bar_time: '2026-10-09T17:15:00.000000001Z'},
    {decision_time: '2026-10-09T17:31:00Z'}, {training_boundary: '2026-09-17T13:30:00Z'},
    {bar_time: '2026-09-15T17:15:00Z', decision_time: '2026-09-15T17:30:00Z'},
    {price: 0}, {price: '100'}, {target_position: 1}, {predicted_return: 0}, {distribution_ok: 'true'},
    {eligible_setup: 1}, {setup_signal: 'BUY'}, {reason: {}}, {reason: ''},
    {simple_net_bps: NaN}, {fly_net_bps: Infinity}, {simple_accept: false}, {fly_accept: true},
    {simple_net_bps: 0}, {simple_net_bps: null}, {distribution_ok: false}]) {
    assert.equal(isSatsLearningSignal({...signal, ...change}, evaluation), false, JSON.stringify(change));
  }
  for (const sats of [null, [], {trend: 0}, {trend: '1'}, {tqi: 1.1}, {tqi: -.1},
    {atr_ratio: -1}, {vol_ratio: Infinity}, {vol_ratio: -1}, {line_distance_atr: '0'}, {er: -1}, {er: 1.1}]) {
    assert.equal(isSatsLearningSignal({...signal, sats: sats && !Array.isArray(sats) ? {...signal.sats, ...sats} : sats}, evaluation), false);
  }
  for (const value of [null, [], {}, undefined]) assert.equal(isSatsLearningSignal(value, evaluation), false);
});

test('only eligible BUY forecasts can be accepted, with a strictly positive threshold margin', () => {
  const evaluation = fixture();
  evaluation.model_id = 'a4df9760250e34c1';
  evaluation.evaluation.fresh_training_cutoff = evaluation.evaluation.start;
  const signal = {strategy: 'sats-learning', pipeline: 'sats-setup-net-bps-v1', symbol: 'MU', timeframe: '15Min',
    model_id: evaluation.model_id, bar_time: '2026-10-09T17:15:00Z', decision_time: '2026-10-09T17:30:00Z',
    training_boundary: evaluation.evaluation.fresh_training_cutoff, price: 100, target_position: 0,
    predicted_return: null, distribution_ok: false, eligible_setup: false, setup_signal: 'hold',
    reason: 'Synthetic unscored observation.', simple_net_bps: null, fly_net_bps: null, simple_accept: false, fly_accept: false,
    sats: {trend: -1, tqi: 0, atr_ratio: 0, vol_ratio: 0, line_distance_atr: -.5, er: 1}};
  for (const setup_signal of ['buy', 'sell', 'hold']) {
    const unscored = {...signal, setup_signal};
    assert.equal(isSatsLearningSignal(unscored, evaluation), true);
    assert.equal(isSatsLearningSignal({...unscored, simple_net_bps: 1}, evaluation), false);
    assert.equal(isSatsLearningSignal({...unscored, fly_accept: true}, evaluation), false);
  }
  assert.equal(isSatsLearningSignal({...signal, eligible_setup: true}, evaluation), false);
  assert.equal(isSatsLearningSignal({...signal, eligible_setup: true, setup_signal: 'buy'}, evaluation), true);
  evaluation.settings.learning.threshold_net_bps = 3;
  const scored = {...signal, eligible_setup: true, setup_signal: 'buy', distribution_ok: true,
    simple_net_bps: 3, fly_net_bps: 3.1, simple_accept: false, fly_accept: true};
  assert.equal(isSatsLearningSignal(scored, evaluation), true);
  assert.equal(isSatsLearningSignal({...scored, simple_accept: true}, evaluation), false);
  assert.equal(isSatsLearningSignal({...scored, fly_accept: false}, evaluation), false);
  assert.equal(isSatsLearningSignal(scored, {...evaluation, evaluation: {...evaluation.evaluation, kind: 'historical_only'}}), false);
});
