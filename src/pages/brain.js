import React, {useEffect, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import PageHeader from '@site/src/components/PageHeader';
import SatsEvidence from '@site/src/components/Brain/SatsEvidence';
import {isSatsEvaluation} from '@site/src/components/Brain/satsReport.mjs';
import SatsLearningEvidence from '@site/src/components/Brain/SatsLearningEvidence';
import {isSatsLearningEvaluation} from '@site/src/components/Brain/satsLearningReport.mjs';
import {getBrainStatus, getLocalBrainStatus, setBrainEnabled} from '@site/src/lib/brain';
import styles from './brain.module.css';

// The one stock this experiment models (Micron; SPY until 2026-09-24). The buy cap
// shown comes from the Worker when it answers.
const SYMBOL = 'MU';
const DEFAULT_CAP = 1500;

const number = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString('en-US', {maximumFractionDigits: digits}) : null;
const pct = n => { const v = number(n); return v === null ? '—' : `${v}%`; };
const plain = n => number(n, 0) ?? '—';
const when = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-US', {timeZone: 'America/Chicago', timeZoneName: 'short'}) : '—';

// Error codes from the Worker, in words.
const ERRORS = {
  unauthorized: 'Passphrase rejected.',
  paper_runner_and_evaluation_required: 'Enabling needs the runner online in paper mode with a passed research gate.',
  sats_research_observe_only: 'SATS learning publishes observations only. Paper execution is unavailable.',
  brain_storage_not_configured: 'The website backend has no storage configured yet.',
  enabled_must_be_boolean: 'The request was malformed.',
};
const describe = e => ERRORS[e?.message] || (e?.status === 0 ? 'Could not reach the website backend.' : 'The request did not succeed.');

const SERIES = [
  {key: 'fly', label: 'Fly readout', dash: undefined, color: 'var(--g-500)'},
  {key: 'market_only', label: 'Market-only model', dash: '9 6', color: 'var(--viz-s2)'},
  {key: 'always_long', label: 'Always long in evaluated bars', dash: '2 5', color: 'var(--tx-muted)'},
];

function EquityChart({metrics}) {
  const curves = SERIES.map(s => ({...s, curve: Array.isArray(metrics?.[s.key]?.curve) ? metrics[s.key].curve : []}));
  const values = curves.flatMap(c => c.curve.map(p => p.equity)).filter(Number.isFinite);
  if (!values.length) return null;
  const lo = Math.min(1, ...values), hi = Math.max(1, ...values);
  const y = v => 150 - (v - lo) / (hi - lo || .01) * 140;
  const x = (i, count) => 5 + i / Math.max(1, count - 1) * 590;
  return <figure className={styles.chart}>
    <svg viewBox="0 0 600 160" role="img" aria-label="Test-period growth of 1 for the fly readout, the market-only model and always-long. Exact returns are in the table below.">
      <line x1="5" x2="595" y1={y(1)} y2={y(1)} stroke="currentColor" opacity=".25" strokeDasharray="3 4" />
      {curves.map(c => <polyline key={c.key} fill="none" stroke={c.color} strokeWidth="2.5" strokeDasharray={c.dash}
        vectorEffect="non-scaling-stroke" points={c.curve.map((p, i, a) => `${x(i, a.length)},${y(p.equity)}`).join(' ')} />)}
    </svg>
    <div className={styles.legend}>{curves.map(c => <span key={c.key}>
      <svg viewBox="0 0 34 10" aria-hidden="true"><line x1="1" x2="33" y1="5" y2="5" stroke={c.color} strokeWidth="2.5" strokeDasharray={c.dash} /></svg>{c.label}
    </span>)}</div>
    <p className={styles.scale}>Growth of 1 · range {lo.toFixed(3)} to {hi.toFixed(3)} · dotted line = 1.000 · earlier bars on the left</p>
  </figure>;
}

export default function Brain() {
  const [local, setLocal] = useState(false); // page served from this computer (local preview)
  const [source, setSource] = useState('website');
  const [state, setState] = useState(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [publishedResearch, setPublishedResearch] = useState(null);

  useEffect(() => {
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) { setLocal(true); setSource('local'); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/brain-sats-evaluation.json', {signal: controller.signal})
      .then(response => response.ok ? response.json() : null)
      .then(evaluation => { if (isSatsLearningEvaluation(evaluation)) setPublishedResearch(evaluation); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (source === 'file') return undefined;
    let active = true;
    let controller;
    async function load() {
      if (document.hidden) return;
      controller?.abort();
      const mine = new AbortController();
      controller = mine;
      const timeout = setTimeout(() => mine.abort(), 10000);
      try {
        const next = await (source === 'local' ? getLocalBrainStatus(mine.signal) : getBrainStatus({signal: mine.signal}));
        if (active && controller === mine) { setState(next); setStale(false); setError(''); }
      } catch (e) {
        // A newer poll replaced this one; only the current request reports failure.
        if (!active || controller !== mine) return;
        // Keep the last good data on screen; say it is out of date.
        setStale(true);
        setError(source === 'local'
          ? 'The local runner is not answering. Start it with the command below; allow local-network access if the browser asks.'
          : 'The website backend is not answering right now. Showing the last data received, if any.');
      } finally { clearTimeout(timeout); }
    }
    load();
    const timer = setInterval(load, 15000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [source]);

  async function control(enabled) {
    setBusy(true); setNotice('');
    try {
      await setBrainEnabled(enabled, token);
      setNotice(enabled
        ? 'Paper automation enabled. The runner must stay online.'
        : 'Paused. No new automated orders, including the scheduled exit. Positions and submitted orders stay on the paper account.');
    } catch (e) {
      setNotice(describe(e));
      setBusy(false);
      return;
    }
    // A failed refresh must not replace the confirmation above.
    try { if (source === 'website') { setState(await getBrainStatus()); setStale(false); } } catch (_) { setStale(true); }
    setBusy(false);
  }

  async function importReport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('Choose an evaluation file smaller than 1 MB.');
      const evaluation = JSON.parse(await file.text());
      const satsFile = isSatsEvaluation(evaluation);
      const learningFile = isSatsLearningEvaluation(evaluation);
      if (!satsFile && !learningFile && (evaluation.schema !== 1 || evaluation.symbol !== SYMBOL || !evaluation.metrics?.fly || !evaluation.graph)) throw new Error('Choose a Joyeb Brain fly, SATS or SATS learning evaluation.');
      setSource('file'); setState({report: {evaluation, mode: learningFile ? 'SATS learning research' : satsFile ? 'SATS research' : 'saved evaluation'}, online: false, orders: [], enabled: null}); setStale(false); setError('');
    } catch (e) { setError(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message); }
  }

  const publishedFallback = source === 'website' && publishedResearch && !isSatsLearningEvaluation(state?.report?.evaluation);
  const report = publishedFallback ? {evaluation: publishedResearch, mode: 'published research snapshot'} : state?.report;
  const evaluation = report?.evaluation && typeof report.evaluation === 'object' ? report.evaluation : null;
  const graph = evaluation?.graph && typeof evaluation.graph === 'object' ? evaluation.graph : null;
  const metrics = evaluation?.metrics && typeof evaluation.metrics === 'object' ? evaluation.metrics : null;
  const checks = evaluation?.checks && typeof evaluation.checks === 'object' ? Object.entries(evaluation.checks) : [];
  const signal = report?.signal;
  const sats = isSatsEvaluation(evaluation);
  const learning = isSatsLearningEvaluation(evaluation);
  const scheduled = report?.runner_kind === 'github-actions';
  const ready = evaluation?.paper_ready === true;
  const canEnable = !sats && !learning && source === 'website' && state?.online && ready && report?.mode === 'paper';
  const automation = source !== 'website' ? 'Not visible from here' : state?.enabled ? 'Enabled on backend' : state ? 'Paused' : 'Not connected';

  return <Layout title="Brain · Strategy Research" description="Micron strategy research: inspect SATS trend signals and backtests, alongside the original experimental fly-connectome evaluation. Paper execution starts paused.">
    <PageHeader eyebrow="Research experiment · Paper only" title="Brain"
      subtitle={learning ? 'SATS identifies Micron (MU) setups; trained readouts assess their net outcomes. Compare direct SATS with simple and fly-informed filters, and inspect current forecasts when the scheduled runner reports. Paper execution remains unavailable.' : sats ? 'SATS trend rules on Micron (MU): inspect what changed, why a signal fired, and how it performed in historical testing. This saved research report cannot authorize paper orders.' : 'Micron (MU) strategy research. Load a SATS or SATS learning evaluation to inspect signals, learned filters and backtests.'}>
      <div className={styles.headerLinks}><Link to="/portfolio">Paper account →</Link><Link to="/terminal">Market terminal →</Link></div>
    </PageHeader>
    <main className={`container ${styles.main}`}>
      <div className={styles.toolbar}>
        {(local || source === 'file') && <label>Read from <select value={source} onChange={e => { setState(null); setStale(false); setSource(e.target.value); }}>
          <option value="website">Website backend</option>
          {local && <option value="local">My local runner</option>}
          {source === 'file' && <option value="file">Saved evaluation</option>}
        </select></label>}
        <label className={styles.file}>Load evaluation JSON<input type="file" accept=".json,application/json" onChange={importReport} /></label>
        <span className={styles.status}>{publishedFallback ? 'Published SATS research' : source === 'file' ? 'Saved results' : scheduled ? 'GitHub scheduled reports' : state?.online ? 'Runner online' : 'Runner offline'} · {report?.mode || 'No report yet'}{stale ? ' · not updated' : ''}</span>
      </div>
      {publishedFallback && <p className={styles.muted}>Showing the frozen SATS comparison through October 2, 2026. A current SATS runner report has not arrived. {state?.report ? `The backend's last report uses model ${state.report.evaluation?.model_id || 'unknown'}, received ${when(state.seen_at)}.` : 'Scheduled observation requires the GitHub setup below.'} This snapshot is saved research, not a current market forecast.</p>}
      {scheduled && <p className={styles.muted}>Last GitHub report received {when(state?.seen_at)}. Scheduled jobs run independently of your computer, but can be delayed or missed. This timestamp does not confirm that the schedule is still enabled. <a href="https://github.com/Kashyeb57/quant-finance-journey/actions/workflows/run-brain.yml" target="_blank" rel="noopener noreferrer">View runs and schedule →</a></p>}
      {error && <p className={styles.message} role="status">{error}</p>}
      {learning ? <SatsLearningEvidence key={evaluation.model_id + evaluation.created_at} evaluation={evaluation} styles={styles}
        signal={signal} observationSource={publishedFallback ? 'saved' : source}
        event={report?.event} error={report?.error} /> : sats ? <SatsEvidence key={evaluation.model_id + evaluation.created_at} evaluation={evaluation} styles={styles} /> : <>
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Latest decision</h2><span>{SYMBOL} · completed 15-minute bars</span></div>
        <div className={styles.readouts}>
          <div><span>Target position</span><strong>{signal ? signal.target_position === 1 ? 'LONG · 1 share' : 'FLAT · 0 shares' : 'Waiting'}</strong></div>
          <div><span>Predicted next-bar return</span><strong>{Number.isFinite(signal?.predicted_return) ? `${number(signal.predicted_return * 10000)} bps` : '—'}</strong></div>
          <div><span>Last completed bar started</span><strong className={styles.small}>{when(signal?.bar_time)}</strong></div>
        </div>
        <p aria-live="polite">{report?.event || 'No runner has published a report yet.'}</p>
        {report?.error && <p className={styles.message}>{report.error}</p>}
        <p className={styles.muted}>A target is a model output, not a filled order. Updated {when(state?.seen_at)}.</p>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Evidence before execution</h2><span>{evaluation ? ready ? 'Research gate passed' : 'Research gate not passed' : 'No evaluation'}</span></div>
        {evaluation ? <>
          {graph && <p><strong>{plain(graph.neurons)} neurons</strong> · {plain(graph.connection_rows)} measured connection rows{typeof graph.source === 'string' ? ` · ${graph.source}` : ''}. A reduced circuit with fixed wiring; only the output model is trained.</p>}
          {evaluation.split && <p className={styles.muted}>{plain(evaluation.samples)} usable examples · {plain(evaluation.split.train)} train / {plain(evaluation.split.validation)} validation / {plain(evaluation.split.test)} test · two decision rows purged at each boundary.</p>}
          {metrics && <EquityChart metrics={metrics} />}
          {(evaluation.curves_thinned || evaluation.curves_omitted) && <p className={styles.muted}>{evaluation.curves_omitted ? 'The curves were too long to publish; the table below has the results.' : 'The curves are thinned for publishing; the table uses every bar.'}</p>}
          {metrics && <div className={styles.tableWrap}><table><thead><tr><th>Untouched test period</th><th>Net return</th><th>Max drawdown</th><th>Order sides</th></tr></thead>
            <tbody>{SERIES.map(s => <tr key={s.key}><th scope="row">{s.label}</th><td>{pct(metrics[s.key]?.return_pct)}</td><td>{pct(metrics[s.key]?.max_drawdown_pct)}</td><td>{plain(metrics[s.key]?.order_sides)}</td></tr>)}</tbody></table></div>}
          <p className={styles.muted}>Next-open research fills{Number.isFinite(evaluation.cost_bps_per_side) ? `; ${evaluation.cost_bps_per_side} bps assumed per side` : ''}.{typeof evaluation.data?.source === 'string' ? ` Data: ${evaluation.data.source}.` : ''} Backtest results, not account profits.</p>
          {!!checks.length && <ul className={styles.checks}>{checks.map(([name, passed]) => <li key={name}>
            <b className={passed === true ? styles.pass : styles.fail}>{passed === true ? 'MET' : 'NOT MET'}</b>{name.replaceAll('_', ' ')}
          </li>)}</ul>}
          <p className={styles.muted}>Test window: {when(evaluation.split?.test_start)} → {when(evaluation.split?.test_end)}.{typeof evaluation.model_id === 'string' ? ` Model ${evaluation.model_id}.` : ''} Passing the gate does not establish future profitability.</p>
        </> : <div className={styles.empty}><p>No evaluation loaded yet.</p><p>Once a runner publishes, its latest evaluation appears here. A saved <code>evaluation.json</code> can also be loaded above.</p></div>}
      </section>
      </>}
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Paper execution</h2><span>{automation}</span></div>
        {learning ? <p>This SATS model publishes setup forecasts only. Its research gate fails, TradingView parity is unverified, and its hypothetical protective orders have no verified execution adapter. The runner and backend refuse paper orders for this strategy.</p> : <p>{SYMBOL} only · at most one bot-owned share · buy quote capped at ${(state?.limits?.max_buy_quote ?? DEFAULT_CAP).toLocaleString('en-US')} · six entry attempts per day (the count resets at 7:00 PM CT, 6:00 PM CT in winter). The strategy targets flat on the 2:30 PM CT bar, exiting about 2:45 PM CT. Exits stay available after the entry limit. Positions opened by hand are never adopted or sold.</p>}
        <p className={styles.muted}>Pause blocks every new automated order, including that scheduled exit. It does not cancel submitted orders or close a position; close one yourself on the paper account if needed.</p>
        <div className={styles.controls}>
          <label>Owner passphrase<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" placeholder="Kept in this tab's memory only" /></label>
          <button type="button" disabled={busy || !token || !canEnable} onClick={() => control(true)}>Enable paper orders</button>
          <button type="button" disabled={busy || !token || source !== 'website'} onClick={() => control(false)}>Pause new orders</button>
          <button type="button" disabled={!token} onClick={() => setToken('')}>Lock controls</button>
        </div>
        {!canEnable && <p className={styles.muted}>{learning ? 'SATS observation cannot enable paper execution.' : 'Enabling needs the website backend, a runner online in paper mode, and a passed research gate.'}</p>}
        {notice && <p role="status" className={styles.message}>{notice}</p>}
        {!!state?.orders?.length && <div className={styles.tableWrap}><table><thead><tr><th>Time (CT)</th><th>Side</th><th>Status</th><th>Filled shares</th><th>Order id</th></tr></thead><tbody>{state.orders.map(order => <tr key={order.client_id}><td>{when(order.created_at)}</td><td>{order.side}</td><td>{order.status}</td><td>{plain(order.filled_qty)}</td><td><code>{order.client_id}</code></td></tr>)}</tbody></table></div>}
      </section>
      <details className={styles.help}><summary>Run through GitHub or on your computer</summary>
        <p>For the learned SATS comparison, run <code>python -m joyeb_brain.sats_learning --csv runtime/sats-learning/data.csv --metadata runtime/sats-learning/data.json</code> from the <code>brain</code> folder, then load <code>runtime/sats-learning/evaluation.json</code>. It uses earlier completed setup outcomes to fit simple and fly-informed readouts, and compares their entry filters on later data. Read <code>brain/SATS.md</code> for the fixed protocol and source-data requirements.</p>
        <p>For SATS alone, run <code>python -m joyeb_brain.sats_research</code>, then load <code>runtime/sats-research/evaluation.json</code> above. Research commands calculate hypothetical fills and never place orders.</p>
        <p>The repository's <strong>Run Brain</strong> GitHub Actions workflow uses the frozen SATS learning snapshot to publish current setup forecasts with your computer off. It does not retrain the models. Follow <a href="https://github.com/Kashyeb57/quant-finance-journey/blob/main/brain/GITHUB.md" target="_blank" rel="noopener noreferrer">the GitHub setup guide</a> once to configure its secrets and activate the schedule. No terminal needs to stay open for GitHub runs.</p>
        <p>In a terminal with the project's Python environment, open the repository's <code>brain</code> folder and run:</p>
        <pre><code>python -m joyeb_brain run</code></pre>
        <p>That starts the original fly runner in observation mode. Open this page from the local preview and choose "My local runner". Keep the computer awake and the terminal open. The Brain README covers data collection, training and publishing; the GitHub workflow runs the SATS model.</p>
      </details>
    </main>
  </Layout>;
}
