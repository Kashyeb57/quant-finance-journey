import React, {useState} from 'react';

const date = value => new Date(value).toLocaleString('en-US', {timeZone: 'America/Chicago', timeZoneName: 'short'});
const number = value => Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits: 2}) : '—';
const dollar = value => Number.isFinite(value) ? value.toLocaleString('en-US', {style: 'currency', currency: 'USD'}) : '—';
const SERIES = [{key: 'sats', label: 'SATS', color: 'var(--g-500)'},
  {key: 'fixed_band', label: 'Fixed-band trend control', color: 'var(--viz-s2)'},
  {key: 'passive', label: 'Passive intraday share', color: 'var(--tx-muted)'}];

export default function SatsEvidence({evaluation, styles}) {
  const bars = evaluation.test_observations;
  const [cursor, setCursor] = useState(null);
  const index = Math.min(cursor ?? bars.length - 1, bars.length - 1);
  const selected = bars[index];
  const latest = evaluation.latest;
  const prices = bars.flatMap(point => [point.close, point.line]);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const x = i => 8+i/Math.max(1, bars.length-1)*584;
  const y = price => 150-(price-lo)/(hi-lo || 1)*140;
  const checkEntries = Object.entries(evaluation.checks || {});
  const curves = SERIES.map(s => ({...s, points: evaluation.metrics[s.key].curve}));
  const equityValues = curves.flatMap(c => c.points.map(p => p.equity));
  const equityLo = Math.min(1, ...equityValues), equityHi = Math.max(1, ...equityValues);
  const ey = value => 150-(value-equityLo)/(equityHi-equityLo || .01)*140;
  const firstTime = Date.parse(evaluation.split.test_start), lastTime = Date.parse(evaluation.split.test_end);
  const ex = time => 8+(Date.parse(time)-firstTime)/(lastTime-firstTime || 1)*584;
  return <>
    <section className={styles.section}>
      <div className={styles.sectionHead}><h2>SATS observation</h2><span>Historical snapshot · execution paused</span></div>
      <p>{latest.reason}. Observed on {date(latest.bar_time)}. This is saved history, not a live feed.</p>
      <div className={styles.readouts}>
        <div><span>Trend bias</span><strong>{latest.trend === 1 ? 'BULLISH' : 'BEARISH'}</strong></div>
        <div><span>Trend quality · 0–1</span><strong>{number(latest.tqi)}</strong></div>
        <div><span>Efficiency / volatility ratio</span><strong className={styles.small}>{number(latest.er)} / {number(latest.vol_ratio)}</strong></div>
      </div>
      <p className={styles.muted}>Quality components: efficiency {number(latest.tqi_efficiency)} · volume {number(latest.tqi_volume)} · structure {number(latest.tqi_structure)} · momentum {number(latest.tqi_momentum)}. These are measurements, not probabilities.</p>
      <figure className={styles.chart}>
        <svg viewBox="0 0 600 160" role="img" aria-label="Historical MU close and SATS trend line. Use the candle slider below for values.">
          <polyline fill="none" stroke="var(--tx-secondary)" strokeWidth="1.5" points={bars.map((p, i) => `${x(i)},${y(p.close)}`).join(' ')} />
          <polyline fill="none" stroke="var(--g-500)" strokeWidth="2" points={bars.map((p, i) => `${x(i)},${y(p.line)}`).join(' ')} />
          {bars.map((p, i) => p.signal !== 'hold' && <circle key={p.time} cx={x(i)} cy={y(p.close)} r="3.5" fill={p.signal === 'buy' ? 'var(--g-300)' : 'var(--amber-500)'} />)}
          <line x1={x(index)} x2={x(index)} y1="5" y2="155" stroke="var(--tx-muted)" strokeDasharray="3 4" />
        </svg>
        <figcaption className={styles.muted}>Grey = close · green = trend line · dots = retained flip signals. Earlier bars on the left; overnight gaps are compressed. {bars.length} displayed observations.</figcaption>
      </figure>
      <label htmlFor="sats-candle">Inspect historical candle</label>
      <input id="sats-candle" type="range" min="0" max={bars.length-1} value={index} onChange={event => setCursor(Number(event.target.value))} style={{width: '100%'}} />
      <p aria-live="polite">{date(selected.time)} · close {dollar(selected.close)} · trend line {dollar(selected.line)} · TQI {number(selected.tqi)} · {selected.signal === 'hold' ? 'No new flip' : selected.signal.toUpperCase()}.</p>
      {latest.last_signal && <p className={styles.muted}>Last flip: {latest.last_signal.side.toUpperCase()} on {date(latest.last_signal.bar_time)} at {dollar(latest.last_signal.price)}. Proposed stop {dollar(latest.last_signal.stop)}; targets {dollar(latest.last_signal.tp1)} / {dollar(latest.last_signal.tp2)} / {dollar(latest.last_signal.tp3)}. These are historical indicator levels, not active orders.</p>}
    </section>
    <section className={styles.section}>
      <div className={styles.sectionHead}><h2>Strategy evidence</h2><span>SATS v1.12.0 research port · not ready for paper orders</span></div>
      <p>{evaluation.signal_counts.buy} buy flips and {evaluation.signal_counts.sell} sell flips across {evaluation.data.rows} historical bars. The test uses the final {evaluation.split.test} bars; earlier history initializes the indicator. No parameters were selected from these test results.</p>
      <p className={styles.muted}>{date(evaluation.split.test_start)} → {date(evaluation.split.test_end)}. One whole share, long or flat; entire position exits at {evaluation.settings.execution.exit_target.toUpperCase()}. {dollar(evaluation.settings.execution.capital)} starting research cash; {evaluation.cost_bps_per_side} bps assumed per side.</p>
      <figure className={styles.chart}>
        <svg viewBox="0 0 600 160" role="img" aria-label="Test-period equity for SATS and the two controls. Exact results are in the table below.">
          <line x1="8" x2="592" y1={ey(1)} y2={ey(1)} stroke="currentColor" strokeDasharray="3 4" />
          {curves.map(c => <polyline key={c.key} fill="none" stroke={c.color} strokeWidth="2" strokeDasharray={c.key === 'sats' ? undefined : '5 4'} points={c.points.map(p => `${ex(p.time)},${ey(p.equity)}`).join(' ')} />)}
        </svg>
        <figcaption className={styles.muted}>Growth of research cash · range {equityLo.toFixed(4)}–{equityHi.toFixed(4)} · curves thinned; metrics use every bar.</figcaption>
      </figure>
      <div className={styles.tableWrap}><table><thead><tr><th>Same test window</th><th>Net P&amp;L</th><th>Return</th><th>Max drawdown</th><th>Trades</th></tr></thead><tbody>
        {SERIES.map(s => <tr key={s.key}><th scope="row">{s.label}</th><td>{dollar(evaluation.metrics[s.key].net_pnl)}</td><td>{number(evaluation.metrics[s.key].return_pct)}%</td><td>{number(evaluation.metrics[s.key].max_drawdown_pct)}%</td><td>{evaluation.metrics[s.key].trade_count}</td></tr>)}
      </tbody></table></div>
      <p className={styles.muted}>Cost sensitivity, SATS net P&amp;L: {Object.entries(evaluation.cost_sensitivity_net_pnl || {}).map(([bps, pnl]) => `${bps} bps: ${dollar(pnl)}`).join(' · ')}.</p>
      <ul className={styles.checks}>{checkEntries.map(([name, passed]) => <li key={name}><b className={passed === true ? styles.pass : styles.fail}>{passed === true ? 'MET' : 'NOT MET'}</b>{name.replaceAll('_', ' ')}</li>)}</ul>
      <p className={styles.message}>The simulation assumes resting stop/target protection. The scheduled runner has no SATS execution adapter yet. This report cannot enable paper orders.</p>
      <details><summary>Assumptions and attribution</summary><p className={styles.muted}>{evaluation.attribution}</p><ul>{evaluation.limitations.map(text => <li key={text}>{text}</li>)}</ul></details>
    </section>
  </>;
}
