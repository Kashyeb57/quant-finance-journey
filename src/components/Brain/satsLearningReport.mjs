// Saved setup-learning research only. This format never authorizes execution.
const STRATEGIES = ['sats', 'simple', 'fly'];
const METRIC_FIELDS = ['net_pnl', 'return_pct', 'max_drawdown_pct', 'trade_count', 'order_sides', 'bars'];
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const isText = (value, limit = 2000) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const isOptionalNumber = value => value === null || Number.isFinite(value);

// Date.parse alone normalizes impossible calendar dates and accepts non-ISO text.
const isIsoTime = value => {
  if (typeof value !== 'string' || value.length > 40) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second, zone] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1] && Number(hour) <= 23 &&
    Number(minute) <= 59 && Number(second) <= 59 &&
    (zone === 'Z' || Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59);
};
const isWindow = (start, end) => isIsoTime(start) && isIsoTime(end) && Date.parse(start) <= Date.parse(end);
const isTextArray = (value, limit, min = 0) => Array.isArray(value) && value.length >= min &&
  value.length <= limit && value.every(text => isText(text));
const isSettingsRecord = (value, numericArrays = false) => isRecord(value) && Object.keys(value).length > 0 && Object.keys(value).length <= 60 &&
  Object.entries(value).every(([key, setting]) => isText(key, 100) &&
    (typeof setting === 'boolean' || Number.isFinite(setting) || isText(setting, 1000) ||
      numericArrays && Array.isArray(setting) && setting.length > 0 && setting.length <= 16 && setting.every(Number.isFinite)));

const validMetrics = (metrics, {curves, start, end, rows}) => {
  if (!isRecord(metrics)) return false;
  let bars;
  for (const key of STRATEGIES) {
    const metric = metrics[key];
    if (!isRecord(metric) || !METRIC_FIELDS.every(field => Number.isFinite(metric[field])) ||
        !['trade_count', 'order_sides', 'bars'].every(field => isCount(metric[field])) ||
        metric.max_drawdown_pct > 0 || metric.bars > rows || metric.trade_count > metric.order_sides ||
        bars !== undefined && metric.bars !== bars) return false;
    bars = metric.bars;
    if (bars === 0 && METRIC_FIELDS.some(field => metric[field] !== 0)) return false;
    if (!curves) {
      if (Object.hasOwn(metric, 'curve')) return false;
      continue;
    }
    if (!Array.isArray(metric.curve) || metric.curve.length > 240 ||
        metric.bars > 0 && metric.curve.length === 0 || metric.bars === 0 && metric.curve.length !== 0) return false;
    let previousTime = -Infinity;
    for (const point of metric.curve) {
      if (!isRecord(point) || !isIsoTime(point.time) || !Number.isFinite(point.equity) || point.equity < 0) return false;
      const time = Date.parse(point.time);
      if (time < Date.parse(start) || time > Date.parse(end) || time <= previousTime) return false;
      previousTime = time;
    }
  }
  return true;
};

const validPrediction = value => isOptionalNumber(value.simple_net_bps) && isOptionalNumber(value.fly_net_bps) &&
  typeof value.simple_accept === 'boolean' && typeof value.fly_accept === 'boolean' &&
  !(value.simple_accept && value.simple_net_bps === null) && !(value.fly_accept && value.fly_net_bps === null);

export function isSatsLearningEvaluation(value) {
  if (!isRecord(value) || value.schema !== 3 || value.strategy !== 'sats-learning' || value.symbol !== 'MU' ||
      value.timeframe !== '15Min' || value.paper_ready !== false || !isText(value.model_id, 200) ||
      !isIsoTime(value.created_at) || !isText(value.attribution, 5000) || !isTextArray(value.limitations, 25) ||
      !Number.isFinite(value.cost_bps_per_side) || value.cost_bps_per_side < 0) return false;

  if (!isRecord(value.checks) || Object.keys(value.checks).length < 1 || Object.keys(value.checks).length > 40 ||
      !Object.entries(value.checks).every(([key, passed]) => isText(key, 100) && typeof passed === 'boolean')) return false;

  const settings = value.settings, execution = settings?.execution, learning = settings?.learning;
  if (!isRecord(settings) || !isSettingsRecord(settings.indicator, true) || !isSettingsRecord(execution) ||
      !isSettingsRecord(learning) || !Number.isFinite(execution.capital) || execution.capital <= 0 ||
      !['tp1', 'tp2', 'tp3'].includes(execution.exit_target) || !isCount(execution.entry_start) ||
      execution.entry_start >= 1440 || !Number.isFinite(learning.penalty) || learning.penalty < 0 ||
      !Number.isFinite(learning.threshold_net_bps)) return false;
  for (const field of ['entry_end', 'flatten_start']) {
    if (Object.hasOwn(execution, field) && (!isCount(execution[field]) || execution[field] >= 1440 ||
        execution[field] < execution.entry_start)) return false;
  }
  if (Object.hasOwn(execution, 'cost_bps') && execution.cost_bps !== value.cost_bps_per_side) return false;

  const data = value.data, training = value.training, evaluation = value.evaluation;
  if (!isRecord(data) || !isText(data.source, 1000) || !isCount(data.rows) || data.rows < 1 ||
      !isWindow(data.first, data.last) || typeof data.sha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(data.sha256) ||
      !isRecord(value.features) || !isTextArray(value.features.simple, 40, 1) || !isTextArray(value.features.fly, 40, 1) ||
      !isRecord(training) || !isCount(training.setups) || !isCount(training.purged) ||
      !isRecord(evaluation) || !['fresh', 'historical_only'].includes(evaluation.kind) ||
      !isWindow(evaluation.start, evaluation.end) || !isIsoTime(evaluation.previously_inspected_through)) return false;
  if (training.setups === 0 && training.start === null && training.end === null) {
    // All candidate labels may have been purged; no training interval is invented.
  } else if (!isWindow(training.start, training.end)) return false;
  if (training.end !== null && Date.parse(training.end) >= Date.parse(evaluation.start)) return false;
  if (evaluation.kind === 'fresh' && Date.parse(evaluation.start) <= Date.parse(evaluation.previously_inspected_through)) return false;
  if (!validMetrics(value.metrics, {curves: true, start: evaluation.start, end: evaluation.end, rows: data.rows})) return false;

  if (!Array.isArray(value.folds) || value.folds.length > 20 || !value.folds.every(fold =>
    isRecord(fold) && fold.kind === 'historical' && isIsoTime(fold.train_end) &&
    isWindow(fold.test_start, fold.test_end) && Date.parse(fold.train_end) < Date.parse(fold.test_start) &&
    isCount(fold.training_setups) && isCount(fold.purged) &&
    validMetrics(fold.metrics, {curves: false, start: fold.test_start, end: fold.test_end, rows: data.rows}))) return false;

  if (!Array.isArray(value.decisions) || value.decisions.length > 300) return false;
  let previousTime = -Infinity;
  for (const point of value.decisions) {
    if (!isRecord(point) || !isIsoTime(point.time) || !Number.isFinite(point.price) || point.price <= 0 ||
        !Number.isFinite(point.tqi) || point.tqi < 0 || point.tqi > 1 || !Number.isFinite(point.atr_ratio) ||
        point.atr_ratio < 0 || !Number.isFinite(point.line_distance_atr) || !validPrediction(point) ||
        !isOptionalNumber(point.outcome_net_bps)) return false;
    const time = Date.parse(point.time);
    if (time < Date.parse(evaluation.start) || time > Date.parse(evaluation.end) || time <= previousTime) return false;
    previousTime = time;
  }

  const latest = value.latest;
  return isRecord(latest) && isIsoTime(latest.bar_time) && ['buy', 'sell', 'hold'].includes(latest.signal) &&
    isText(latest.reason) && validPrediction(latest);
}

// A current observation is separate from the frozen research and never an order.
export function isSatsLearningSignal(value, evaluation) {
  if (!isSatsLearningEvaluation(evaluation) || evaluation.evaluation.kind !== 'fresh' || !isRecord(value) ||
      value.strategy !== 'sats-learning' || value.pipeline !== 'sats-setup-net-bps-v1' ||
      value.symbol !== 'MU' || value.timeframe !== '15Min' ||
      value.model_id !== evaluation.model_id || !/^[a-f0-9]{16}$/.test(value.model_id) ||
      !isIsoTime(value.bar_time) || !isIsoTime(value.decision_time) ||
      /\.\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(value.bar_time) ||
      /\.\d*[1-9]\d*(?:Z|[+-]\d{2}:\d{2})$/.test(value.decision_time) ||
      Date.parse(value.bar_time) % 900000 !== 0 ||
      Date.parse(value.decision_time) !== Date.parse(value.bar_time) + 900000 ||
      !Number.isFinite(value.price) || value.price <= 0 || value.target_position !== 0 ||
      value.predicted_return !== null || typeof value.distribution_ok !== 'boolean' ||
      typeof value.eligible_setup !== 'boolean' || !['buy', 'sell', 'hold'].includes(value.setup_signal) ||
      !isText(value.reason) || !validPrediction(value)) return false;

  const cutoff = evaluation.evaluation.fresh_training_cutoff;
  if (!isIsoTime(cutoff) || !isIsoTime(value.training_boundary) ||
      Date.parse(value.training_boundary) !== Date.parse(cutoff) || Date.parse(value.bar_time) < Date.parse(cutoff)) return false;

  const sats = value.sats;
  if (!isRecord(sats) || ![-1, 1].includes(sats.trend) ||
      !Number.isFinite(sats.tqi) || sats.tqi < 0 || sats.tqi > 1 ||
      !Number.isFinite(sats.atr_ratio) || sats.atr_ratio < 0 ||
      !Number.isFinite(sats.vol_ratio) || sats.vol_ratio < 0 ||
      !Number.isFinite(sats.line_distance_atr) ||
      !Number.isFinite(sats.er) || sats.er < 0 || sats.er > 1) return false;

  if (value.eligible_setup && value.setup_signal !== 'buy') return false;
  const scored = value.eligible_setup && value.setup_signal === 'buy' && value.distribution_ok;
  const threshold = evaluation.settings.learning.threshold_net_bps;
  for (const arm of ['simple', 'fly']) {
    const prediction = value[`${arm}_net_bps`], accepted = value[`${arm}_accept`];
    if (scored ? !Number.isFinite(prediction) || accepted !== (prediction > threshold)
      : prediction !== null || accepted !== false) return false;
  }
  return !value.distribution_ok || scored;
}
