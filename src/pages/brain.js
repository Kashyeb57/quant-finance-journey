import React, {useEffect, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import PageHeader from '@site/src/components/PageHeader';
import {getBrainStatus, getLocalBrainStatus, setBrainEnabled} from '@site/src/lib/brain';
import styles from './brain.module.css';

const number = (n, digits = 2) => Number.isFinite(n) ? n.toLocaleString('en-US', {maximumFractionDigits: digits}) : null;
const pct = n => { const v = number(n); return v === null ? '—' : `${v}%`; };
const plain = n => number(n, 0) ?? '—';
const when = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-US', {timeZone: 'America/Chicago', timeZoneName: 'short'}) : '—';

// Error codes from the Worker, in words.
const ERRORS = {
  unauthorized: 'Passphrase rejected.',
  paper_runner_and_evaluation_required: 'Enabling needs the runner online in paper mode with a passed research gate.',
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

  useEffect(() => {
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) { setLocal(true); setSource('local'); }
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
      if (evaluation.schema !== 1 || evaluation.symbol !== 'SPY' || !evaluation.metrics?.fly || !evaluation.graph) throw new Error('This is not a Joyeb Brain evaluation file.');
      setSource('file'); setState({report: {evaluation, mode: 'saved evaluation'}, online: false, orders: [], enabled: null}); setStale(false); setError('');
    } catch (e) { setError(e instanceof SyntaxError ? 'That file is not valid JSON.' : e.message); }
  }

  const report = state?.report;
  const evaluation = report?.evaluation && typeof report.evaluation === 'object' ? report.evaluation : null;
  const graph = evaluation?.graph && typeof evaluation.graph === 'object' ? evaluation.graph : null;
  const metrics = evaluation?.metrics && typeof evaluation.metrics === 'object' ? evaluation.metrics : null;
  const checks = evaluation?.checks && typeof evaluation.checks === 'object' ? Object.entries(evaluation.checks) : [];
  const signal = report?.signal;
  const ready = evaluation?.paper_ready === true;
  const canEnable = source === 'website' && state?.online && ready && report?.mode === 'paper';
  const automation = source !== 'website' ? 'Not visible from here' : state?.enabled ? 'Enabled on backend' : state ? 'Paused' : 'Not connected';

  return <Layout title="Brain · Paper Trading" description="An experimental fly-connectome readout for SPY, evaluated on market data and connected to a paper-trading runner that starts paused.">
    <PageHeader eyebrow="Research experiment · Paper only" title="Brain"
      subtitle="An experimental readout built on measured fruit-fly wiring, tested on SPY data. It is not a trained financial brain. The latest signal, the latest evaluation and recent automated paper orders appear here.">
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
        <span className={styles.status}>{state?.online ? 'Runner online' : source === 'file' ? 'Saved results' : 'Runner offline'} · {report?.mode || 'No report yet'}{stale ? ' · not updated' : ''}</span>
      </div>
      {error && <p className={styles.message} role="status">{error}</p>}
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Latest decision</h2><span>SPY · completed 15-minute bars</span></div>
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
      <section className={styles.section}>
        <div className={styles.sectionHead}><h2>Paper execution</h2><span>{automation}</span></div>
        <p>SPY only · at most one bot-owned share · buy quote capped at $1,000 · six entry attempts per day (the count resets at 7:00 PM CT, 6:00 PM CT in winter). The strategy targets flat on the 2:30 PM CT bar, exiting about 2:45 PM CT. Exits stay available after the entry limit. Positions opened by hand are never adopted or sold.</p>
        <p className={styles.muted}>Pause blocks every new automated order, including that scheduled exit. It does not cancel submitted orders or close a position; close one yourself on the paper account if needed.</p>
        <div className={styles.controls}>
          <label>Owner passphrase<input type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" placeholder="Kept in this tab's memory only" /></label>
          <button type="button" disabled={busy || !token || !canEnable} onClick={() => control(true)}>Enable paper orders</button>
          <button type="button" disabled={busy || !token || source !== 'website'} onClick={() => control(false)}>Pause new orders</button>
          <button type="button" disabled={!token} onClick={() => setToken('')}>Lock controls</button>
        </div>
        {!canEnable && <p className={styles.muted}>Enabling needs the website backend, a runner online in paper mode, and a passed research gate.</p>}
        {notice && <p role="status" className={styles.message}>{notice}</p>}
        {!!state?.orders?.length && <div className={styles.tableWrap}><table><thead><tr><th>Time (CT)</th><th>Side</th><th>Status</th><th>Filled shares</th><th>Order id</th></tr></thead><tbody>{state.orders.map(order => <tr key={order.client_id}><td>{when(order.created_at)}</td><td>{order.side}</td><td>{order.status}</td><td>{plain(order.filled_qty)}</td><td><code>{order.client_id}</code></td></tr>)}</tbody></table></div>}
      </section>
      <details className={styles.help}><summary>Run the service on your own computer</summary>
        <p>In a terminal with the project's Python environment, open the repository's <code>brain</code> folder and run:</p>
        <pre><code>python -m joyeb_brain run</code></pre>
        <p>That starts observation only. Open this page from the local preview and choose "My local runner". Keep the computer awake and the terminal open. The Brain README in the repository covers data collection, training and publishing.</p>
      </details>
    </main>
  </Layout>;
}
