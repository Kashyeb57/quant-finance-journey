// Saved research results only. Never use this format as execution authorization.
export function isSatsEvaluation(value) {
  if (!value || value.schema !== 2 || value.strategy !== 'sats' || value.symbol !== 'MU' ||
      value.timeframe !== '15Min' || value.paper_ready !== false) return false;
  if (!Number.isFinite(value.settings?.execution?.capital) || value.settings.execution.capital <= 0) return false;
  if (!['tp1', 'tp2', 'tp3'].includes(value.settings.execution.exit_target) ||
      !Number.isFinite(value.cost_bps_per_side) || value.cost_bps_per_side < 0 ||
      !Number.isFinite(Date.parse(value.split?.test_start)) || !Number.isFinite(Date.parse(value.split?.test_end)) ||
      !Number.isFinite(value.split?.test) || !Number.isFinite(value.data?.rows) ||
      typeof value.attribution !== 'string' || !Array.isArray(value.limitations) ||
      value.limitations.length > 25 || !value.limitations.every(text => typeof text === 'string') ||
      !value.checks || typeof value.checks !== 'object' || Array.isArray(value.checks) ||
      !Object.values(value.checks).every(passed => typeof passed === 'boolean') ||
      !Number.isFinite(value.signal_counts?.buy) || !Number.isFinite(value.signal_counts?.sell)) return false;
  if (!value.latest || ![1, -1].includes(value.latest.trend) ||
      !['buy', 'sell', 'hold'].includes(value.latest.signal) || typeof value.latest.reason !== 'string' ||
      !Number.isFinite(Date.parse(value.latest.bar_time)) ||
      !['tqi', 'er', 'vol_ratio', 'tqi_efficiency', 'tqi_volume', 'tqi_structure', 'tqi_momentum']
        .every(name => Number.isFinite(value.latest[name]))) return false;
  if (value.latest.last_signal && (!['buy', 'sell'].includes(value.latest.last_signal.side) ||
      !Number.isFinite(Date.parse(value.latest.last_signal.bar_time)) ||
      !['price', 'stop', 'tp1', 'tp2', 'tp3'].every(name => Number.isFinite(value.latest.last_signal[name])))) return false;
  for (const key of ['sats', 'fixed_band', 'passive']) {
    const metric = value.metrics?.[key];
    if (!metric || !['return_pct', 'net_pnl', 'max_drawdown_pct', 'order_sides', 'trade_count', 'bars']
      .every(name => Number.isFinite(metric[name])) || metric.bars < 1 ||
      !Array.isArray(metric.curve) || metric.curve.length > 250 ||
      !metric.curve.every(point => point && Number.isFinite(point.equity) && Number.isFinite(Date.parse(point.time)))) return false;
  }
  if (!Array.isArray(value.test_observations) || value.test_observations.length < 1 || value.test_observations.length > 500 ||
      !value.test_observations.every(point => point && Number.isFinite(Date.parse(point.time)) &&
        [point.close, point.line, point.tqi].every(Number.isFinite) && point.close > 0 &&
        point.tqi >= 0 && point.tqi <= 1 && [1, -1].includes(point.trend) &&
        ['buy', 'sell', 'hold'].includes(point.signal))) return false;
  return true;
}
