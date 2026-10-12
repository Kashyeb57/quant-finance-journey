import React, {useId, useState} from 'react';
import {isSatsLearningSignal} from './satsLearningReport.mjs';

const date = value => new Date(value).toLocaleString('en-US', {timeZone: 'America/Chicago', timeZoneName: 'short'});
const number = value => Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits: 2}) : 'Unavailable';
const dollar = value => Number.isFinite(value) ? value.toLocaleString('en-US', {style: 'currency', currency: 'USD'}) : 'Unavailable';
const bps = value => Number.isFinite(value) ? `${number(value)} bps` : 'Not scored';
const decision = accepted => accepted ? 'ACCEPT' : 'SKIP';
const clock = value => {
  const minute = ((value % 1440) + 1440) % 1440;
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
};
const SERIES = [
  {key: 'sats', label: 'SATS alone', color: 'var(--g-500)'},
  {key: 'simple', label: 'SATS + simple learning', color: 'var(--tx-secondary)', dash: '7 4'},
  {key: 'fly', label: 'SATS + fly learning', color: 'var(--g-300)', dash: '2 4'},
];

export default function SatsLearningEvidence({evaluation, styles, signal = null, observationSource = 'saved', event = null, error = null}) {
  const [cursor, setCursor] = useState(null);
  const sliderId = useId();
  const report = evaluation.evaluation;
  const fresh = report.kind === 'fresh';
  const decisions = evaluation.decisions;
  const index = Math.max(0, Math.min(cursor ?? decisions.length - 1, decisions.length - 1));
  const selected = decisions[index];
  const curves = SERIES.map(series => ({...series, points: evaluation.metrics[series.key].curve}));
  const equityValues = curves.flatMap(series => series.points.map(point => point.equity));
  const equityLo = Math.min(1, ...equityValues), equityHi = Math.max(1, ...equityValues);
  const start = Date.parse(report.start), end = Date.parse(report.end);
  const x = time => 8 + (Date.parse(time) - start) / (end - start || 1) * 584;
  const y = equity => 150 - (equity - equityLo) / (equityHi - equityLo || .01) * 140;
  const current = !['saved', 'file'].includes(observationSource) && isSatsLearningSignal(signal, evaluation) ? signal : null;
  const latest = current ? {...current, signal: current.setup_signal} : evaluation.latest;
  const observationAge = current ? Date.now() - Date.parse(current.decision_time) : null;
  const observationStale = current && (observationAge < 0 || observationAge > 20 * 60000);
  const observationLabel = observationSource === 'local' ? 'Local runner observation' : 'Website runner observation';
  const policy = evaluation.settings.execution;
  const learning = evaluation.settings.learning;
  const simple = evaluation.metrics.simple, fly = evaluation.metrics.fly;
  const bars = evaluation.metrics.sats.bars;
  const scoredSimple = decisions.filter(point => point.simple_net_bps !== null).length;
  const scoredFly = decisions.filter(point => point.fly_net_bps !== null).length;

  return <>
    <section className={styles.section}>
      <div className={styles.sectionHead}><h2>SATS setup learning</h2><span>{current ? 'Current observations' : 'Saved research'} · execution paused</span></div>
      <p>MU · 15-minute bars. SATS supplies the trade setup; each learner estimates its net outcome and accepts or skips that same setup. Saved model: {evaluation.model_id}.</p>
      <p className={styles.message}>{fresh
        ? 'This evaluation window follows the previously inspected history. Its saved results still require forward testing before paper orders.'
        : 'Only historical exploration is available. These results use previously inspected history and cannot establish an improvement on unseen data.'}</p>
      <p>{fresh ? 'Fresh evaluation' : 'Historical exploration'}: {date(report.start)} → {date(report.end)}. Previously inspected through {date(report.previously_inspected_through)}.</p>
      <p className={styles.muted}>{evaluation.training.setups} labeled training setups
        {evaluation.training.start && evaluation.training.end ? <> · {date(evaluation.training.start)} → {date(evaluation.training.end)}</> : ' · no usable training interval'}.
        {' '}{evaluation.training.purged} labels purged at the evaluation boundary. Training labels must finish before evaluation; later outcomes below are saved audit data.</p>
      <div className={styles.readouts}>
        <div><span>{current ? 'Latest observed SATS signal' : 'Latest saved SATS signal'}</span><strong>{latest.signal.toUpperCase()}</strong></div>
        <div><span>Simple expected net outcome</span><strong className={styles.small}>{bps(latest.simple_net_bps)}</strong><span>{decision(latest.simple_accept)}</span></div>
        <div><span>Fly expected net outcome</span><strong className={styles.small}>{bps(latest.fly_net_bps)}</strong><span>{decision(latest.fly_accept)}</span></div>
      </div>
      <p className={styles.muted}>{latest.reason} Bar started {date(latest.bar_time)}{current && <>; confirmed at {date(current.decision_time)}</>}. These estimates are net basis points, not probabilities or active orders.</p>
      {current ? <>
        <p className={styles.muted}>{observationLabel}. {observationStale
          ? 'This completed bar is older than 20 minutes or has a future timestamp; the market may be closed or the runner delayed.'
          : 'The latest observed bar closed within the last 20 minutes.'} Forecasts use the frozen model; the saved comparison below remains unchanged.</p>
        <div className={styles.readouts}>
          <div><span>SATS trend / quality</span><strong className={styles.small}>{current.sats.trend === 1 ? 'UP' : 'DOWN'} · {number(current.sats.tqi)}</strong></div>
          <div><span>ATR / price · volatility ratio</span><strong className={styles.small}>{number(current.sats.atr_ratio * 100)}% · {number(current.sats.vol_ratio)}</strong></div>
          <div><span>Distance from trend line</span><strong className={styles.small}>{number(current.sats.line_distance_atr)} ATR</strong></div>
        </div>
        <p className={styles.muted}>{current.eligible_setup ? 'Eligible confirmed BUY setup.' : 'No eligible BUY setup is available on this bar.'} ACCEPT and SKIP describe the learned setup filter; execution stays paused.</p>
      </> : <p className={styles.muted}>This saved observation is not a current feed.{signal && !['saved', 'file'].includes(observationSource) && ' The runner observation did not match this frozen model or its expected format.'}</p>}
      {typeof event === 'string' && event && <p aria-live="polite">{event.slice(0, 200)}</p>}
      {typeof error === 'string' && error && <p className={styles.message} role="status">{error.slice(0, 200)}</p>}
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><h2>Three strategies, one trading rule</h2><span>{fresh ? 'Fresh window' : 'Historical window'} · not ready for paper orders</span></div>
      <p>Every strategy uses the same next-open fills, whole-share long/flat position, entry window, costs and exit rules. The learners change only which SATS setups are accepted. The entire position exits at {policy.exit_target.toUpperCase()}.</p>
      <p className={styles.muted}>{dollar(policy.capital)} starting research cash · {number(evaluation.cost_bps_per_side)} bps per order side · {bars} evaluation bars. Acceptance threshold: expected net outcome above {bps(learning.threshold_net_bps)}; regularization penalty {number(learning.penalty)}.</p>
      {policy.entry_clock_timezone === 'America/New_York' && Number.isFinite(policy.entry_end) && <p className={styles.muted}>Entry signal bars start {clock(policy.entry_start)}–{clock(policy.entry_end)} New York time ({clock(policy.entry_start - 60)}–{clock(policy.entry_end - 60)} CT). The 15-minute bar must close before a setup is confirmed; filling begins at the following open. Displayed observation dates use CT.</p>}
      {equityValues.length > 0 ? <figure className={styles.chart}>
        <svg viewBox="0 0 600 160" role="img" aria-label={`${fresh ? 'Fresh' : 'Historical'} evaluation equity for SATS alone, SATS with simple learning, and SATS with fly learning. Exact metrics follow.`}>
          <line x1="8" x2="592" y1={y(1)} y2={y(1)} stroke="currentColor" strokeDasharray="3 4" />
          {curves.map(series => <polyline key={series.key} fill="none" stroke={series.color} strokeWidth="2" strokeDasharray={series.dash}
            points={series.points.map(point => `${x(point.time)},${y(point.equity)}`).join(' ')} />)}
        </svg>
        <div className={styles.legend}>{SERIES.map(series => <span key={series.key}><svg viewBox="0 0 34 10" aria-hidden="true"><line x1="0" x2="34" y1="5" y2="5" stroke={series.color} strokeWidth="2" strokeDasharray={series.dash} /></svg>{series.label}</span>)}</div>
        <figcaption className={styles.muted}>Growth of starting research cash · range {equityLo.toFixed(4)}–{equityHi.toFixed(4)}. Curves retain at most 240 points each; metrics use every evaluation bar.</figcaption>
      </figure> : <p className={styles.empty}>No bars are available in this evaluation window. No equity curve or trading result is inferred from earlier history.</p>}
      <div className={styles.tableWrap}><table><thead><tr><th>Same {fresh ? 'fresh' : 'historical'} window</th><th>Net P&amp;L</th><th>Return</th><th>Max drawdown</th><th>Trades</th><th>Order sides</th></tr></thead><tbody>
        {SERIES.map(series => <tr key={series.key}><th scope="row">{series.label}</th><td>{dollar(evaluation.metrics[series.key].net_pnl)}</td><td>{number(evaluation.metrics[series.key].return_pct)}%</td><td>{number(evaluation.metrics[series.key].max_drawdown_pct)}%</td><td>{evaluation.metrics[series.key].trade_count}</td><td>{evaluation.metrics[series.key].order_sides}</td></tr>)}
      </tbody></table></div>
      <p>Fly minus simple net P&amp;L: {dollar(fly.net_pnl - simple.net_pnl)}. This is a descriptive difference over one saved window, not a claim of a reliable advantage.</p>
      <p className={styles.muted}>{fly.trade_count === 0 || simple.trade_count === 0
        ? 'At least one learner has no completed trades here. Its incremental value is inconclusive.'
        : 'Different accepted setups can change both exposure and later entry opportunities. A positive difference alone does not establish incremental value.'}
        {!fresh && ' These historical results are supporting exploration, not independent confirmation.'}
        {evaluation.checks.at_least_10_fresh_order_sides === false && ' The fresh sample is below the report’s minimum order-side check.'}</p>
      <ul className={styles.checks}>{Object.entries(evaluation.checks).map(([name, passed]) => <li key={name}><b className={passed ? styles.pass : styles.fail}>{passed ? 'MET' : 'NOT MET'}</b>{name.replaceAll('_', ' ')}</li>)}</ul>
      <p className={styles.message}>Research status: NOT READY FOR PAPER ORDERS. Execution remains paused. This saved report cannot authorize or enable orders.</p>
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><h2>Setup decision audit</h2><span>Saved decisions · later outcomes are historical</span></div>
      <p className={styles.muted}>{decisions.length} saved setup decisions · {scoredSimple} simple scores · {scoredFly} fly scores. An unavailable score means the model did not provide an eligible estimate; its decision is SKIP. The later outcome is the corresponding SATS setup’s net result, revealed after the decision.</p>
      {selected ? <>
        <label htmlFor={sliderId}>Inspect saved setup</label>
        <input id={sliderId} type="range" min="0" max={decisions.length - 1} value={index} onChange={event => setCursor(Number(event.target.value))} style={{width: '100%', minHeight: 44}} />
        <p aria-live="polite">{date(selected.time)} · price {dollar(selected.price)} · TQI {number(selected.tqi)} · ATR ratio {number(selected.atr_ratio)} · line distance {number(selected.line_distance_atr)} ATR.</p>
        <div className={styles.tableWrap}><table><thead><tr><th>At setup time</th><th>Expected net outcome</th><th>Decision</th></tr></thead><tbody>
          <tr><th scope="row">Simple learning</th><td>{bps(selected.simple_net_bps)}</td><td>{decision(selected.simple_accept)}</td></tr>
          <tr><th scope="row">Fly learning</th><td>{bps(selected.fly_net_bps)}</td><td>{decision(selected.fly_accept)}</td></tr>
        </tbody></table></div>
        <p>Later SATS net outcome, historical audit: {selected.outcome_net_bps === null ? 'Unavailable; no completed setup outcome is recorded.' : bps(selected.outcome_net_bps)}.</p>
        <p className={styles.muted}>A basis point is 0.01% of the filled entry price. Outcome estimates include the configured trading costs. Neither learner had access to this setup’s later outcome when making its saved decision.</p>
        <details><summary>All {decisions.length} saved decisions</summary><div className={styles.tableWrap}><table><thead><tr><th>Setup time (CT)</th><th>Simple net bps</th><th>Simple</th><th>Fly net bps</th><th>Fly</th><th>Later SATS net bps</th></tr></thead><tbody>
          {decisions.map(point => <tr key={point.time}><th scope="row">{date(point.time)}</th><td>{bps(point.simple_net_bps)}</td><td>{decision(point.simple_accept)}</td><td>{bps(point.fly_net_bps)}</td><td>{decision(point.fly_accept)}</td><td>{point.outcome_net_bps === null ? 'Unavailable' : bps(point.outcome_net_bps)}</td></tr>)}
        </tbody></table></div></details>
      </> : <p className={styles.empty}>No setup decisions are available in this evaluation window. Earlier historical decisions do not substitute for fresh observations.</p>}
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHead}><h2>Historical supporting evidence</h2><span>Previously inspected data · exploratory folds</span></div>
      <p className={styles.muted}>Each historical fold trains before its test interval and purges labels that cross the boundary. These folds remain historical exploration: they are not untouched or independent confirmation of the fresh result.</p>
      {evaluation.folds.length > 0 ? <div className={styles.tableWrap}><table><thead><tr><th>Training ends (CT)</th><th>Historical test (CT)</th><th>Training setups</th><th>Purged</th><th>SATS P&amp;L / trades</th><th>Simple P&amp;L / trades</th><th>Fly P&amp;L / trades</th></tr></thead><tbody>
        {evaluation.folds.map((fold, index) => <tr key={`${fold.test_start}-${index}`}><th scope="row">{date(fold.train_end)}</th><td>{date(fold.test_start)} → {date(fold.test_end)}</td><td>{fold.training_setups}</td><td>{fold.purged}</td>{SERIES.map(series => <td key={series.key}>{dollar(fold.metrics[series.key].net_pnl)} / {fold.metrics[series.key].trade_count}</td>)}</tr>)}
      </tbody></table></div> : <p className={styles.empty}>No historical folds are saved in this report.</p>}
      <details className={styles.help}><summary>Shared rules, features and limitations</summary>
        <p className={styles.muted}>{evaluation.attribution}</p>
        <p className={styles.muted}>Report saved {date(evaluation.created_at)}. Source: {evaluation.data.source} · {evaluation.data.rows} bars · {date(evaluation.data.first)} → {date(evaluation.data.last)}.</p>
        <p className={styles.muted}>Simple inputs: {evaluation.features.simple.join(', ')}. Fly inputs: {evaluation.features.fly.join(', ')}.</p>
        <p className={styles.muted}>All three strategies use this single execution configuration. Entry clock values are minutes after midnight in {policy.entry_clock_timezone || 'the report’s documented session timezone'}. Fill assumptions are documented in the limitations.</p>
        <pre>{JSON.stringify({execution: policy, learning, indicator: evaluation.settings.indicator}, null, 2)}</pre>
        <ul>{evaluation.limitations.map((text, index) => <li key={index}>{text}</li>)}</ul>
      </details>
    </section>
  </>;
}
