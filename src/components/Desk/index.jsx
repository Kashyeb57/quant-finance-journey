import React, { useMemo, useRef, useState } from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import Chart from '../Terminal/Chart';
import PriceHeader from '../Terminal/PriceHeader';
import { SECTIONS } from '../Terminal/tickers';
import { fetchBars, isCrypto } from '../Terminal/marketData';
import { getGex, getLedger, getQuotes } from '../../lib/market';
import { fmtPrice, fmtSignedMoney, fmtPct } from '../../lib/format';
import usePolling from '../../lib/usePolling';
import IvSurface from './IvSurface';
import { Spark, DepthWings, PnlProfile } from './charts';
import {
  dailyReturns, rollingSharpe, drawdowns, historicalVar, pnlProfile, positionWeights,
  realizedVol, realizedVolSeries, atmIv, ivSurface, oiDepth, sectorBreadth,
} from './quant.mjs';
import styles from './styles.module.css';

/*
 * Quant Desk — one-screen workstation laid out like an institutional
 * multi-panel terminal:
 *
 *   ┌ rail ┐┌──── price chart ─────┐┌ IV surface ┐
 *   │cards ││ candles · EMA · VWAP ││            │
 *   │      ││ GEX levels · position│├ SATS model ┤
 *   │      │└──────────────────────┘└────────────┘
 *   │      │┌ OI depth / P&L profile (toggle) ───┐
 *   └──────┘└────────────────────────────────────┘
 *
 * Every panel reads the same Worker endpoints the Terminal, Portfolio and
 * Brain pages already use; nothing here needs a new backend route.
 */

const LEDGER_MS = 30000;
const QUOTES_MS = 30000;
const GEX_MS = 300000;   // the Worker caches the chain for 5 minutes anyway
const DAILY_MS = 300000;

const ALL_EQUITIES = [...new Set(SECTIONS.flatMap((s) => s.tickers))].filter((t) => !isCrypto(t));
const tickerLabel = (t) => (t === 'BTC-USD' ? '₿ BTC' : t);
const sectionOf = (t) => (SECTIONS.find((s) => s.tickers.includes(t)) || SECTIONS[0]).name;
const dirClass = (v) => (v == null ? '' : v >= 0 ? styles.up : styles.down);
const pct = (v, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`);

const CHECK_LABELS = {
  fit_available: 'Fit available',
  at_least_10_training_setups: '≥10 training setups',
  training_labels_end_before_evaluation: 'No label leakage',
  six_market_inputs_preserved: 'Inputs preserved',
  no_fresh_parameter_tuning: 'No fresh tuning',
  at_least_10_fresh_order_sides: '≥10 fresh orders',
  positive_fresh_fly_after_costs: 'Positive after costs',
  pine_parity_verified: 'Pine parity',
  forward_test_verified: 'Forward test',
  execution_adapter_verified: 'Execution adapter',
};

function Panel({ title, meta, className = '', children, actions }) {
  return (
    <section className={`${styles.panel} ${className}`}>
      <header className={styles.panelHead}>
        <span className={styles.panelTitle}>{title}</span>
        {meta && <span className={styles.panelMeta}>{meta}</span>}
        {actions && <span className={styles.panelActions}>{actions}</span>}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

const Empty = ({ children }) => <div className={styles.empty}>{children}</div>;

export default function Desk() {
  const { colorMode } = useColorMode();
  const dark = colorMode === 'dark';
  const [ticker, setTicker] = useState('AMD');
  const [section, setSection] = useState(() => sectionOf('AMD'));
  const [timeframe, setTimeframe] = useState('5Min');
  const [bottomMode, setBottomMode] = useState('depth');
  const chartBoxRef = useRef(null);

  const [ledger, setLedger] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [chain, setChain] = useState(null);
  const [daily, setDaily] = useState([]);
  const [sats, setSats] = useState(null);

  usePolling(async ({ signal, cancelled }) => {
    try {
      const d = await getLedger({ signal });
      if (!cancelled() && d && d.account) setLedger(d);
    } catch (_) { /* rail shows "not connected" */ }
  }, LEDGER_MS);

  usePolling(async ({ signal, cancelled }) => {
    try {
      const q = await getQuotes(ALL_EQUITIES, { signal });
      if (!cancelled()) setQuotes(q);
    } catch (_) { /* keep last */ }
  }, QUOTES_MS);

  usePolling(async ({ signal, cancelled }) => {
    if (isCrypto(ticker)) { setChain(null); return; }
    try {
      const d = await getGex(ticker, '30d', { signal });
      if (!cancelled()) setChain(d && d.rows ? d : null);
    } catch (_) { if (!cancelled()) setChain(null); }
  }, GEX_MS, [ticker]);

  usePolling(async ({ cancelled }) => {
    const { bars } = await fetchBars(ticker, '1Day');
    if (!cancelled()) setDaily(bars || []);
  }, DAILY_MS, [ticker]);

  usePolling(async ({ signal, cancelled }) => {
    try {
      const r = await fetch('/brain-sats-evaluation.json', { signal });
      if (r.ok && !cancelled()) setSats(await r.json());
    } catch (_) { /* panel shows empty state */ }
  }, 600000);

  /* ---- derived numbers ---- */
  const history = useMemo(() => (ledger && ledger.history) || [], [ledger]);
  const equityVals = useMemo(() => history.map((p) => p.value), [history]);
  const rets = useMemo(() => dailyReturns(history), [history]);
  const sharpe = useMemo(() => rollingSharpe(rets, 20), [rets]);
  const dd = useMemo(() => drawdowns(equityVals), [equityVals]);
  const varFrac = useMemo(() => historicalVar(rets, 0.95), [rets]);
  const positions = useMemo(() => (ledger && ledger.positions) || [], [ledger]);
  const weights = useMemo(() => positionWeights(positions), [positions]);
  const profile = useMemo(() => (positions.length ? pnlProfile(positions) : null), [positions]);
  const acct = ledger && ledger.account;
  const varDollars = varFrac != null && acct && acct.equity ? varFrac * acct.equity : null;

  const breadth = useMemo(() => sectorBreadth(SECTIONS, quotes), [quotes]);
  const rv = useMemo(() => realizedVol(daily, 20), [daily]);
  const rvSeries = useMemo(() => realizedVolSeries(daily.slice(-80), 20), [daily]);
  const iv = useMemo(() => atmIv(chain), [chain]);
  const surface = useMemo(() => ivSurface(chain), [chain]);
  const depth = useMemo(() => oiDepth(chain), [chain]);

  const satsCurves = sats && sats.metrics
    ? ['sats', 'simple', 'fly'].map((k) => ({ key: k, m: sats.metrics[k] })).filter((x) => x.m && Array.isArray(x.m.curve))
    : [];
  const checks = sats && sats.checks ? Object.entries(sats.checks) : [];
  const passed = checks.filter(([, v]) => v).length;

  const active = SECTIONS.find((s) => s.name === section) || SECTIONS[0];

  return (
    <div className={styles.desk}>
      <div className={styles.toolbar}>
        <div className={styles.sections}>
          {SECTIONS.map((s) => (
            <button
              key={s.name}
              className={`${styles.chip} ${s.name === section ? styles.chipActive : ''}`}
              onClick={() => setSection(s.name)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className={styles.tickers}>
          {active.tickers.map((t) => (
            <button
              key={t}
              className={`${styles.tick} ${t === ticker ? styles.tickActive : ''}`}
              onClick={() => setTicker(t)}
            >
              {tickerLabel(t)}
              {quotes[t] && quotes[t].changePct != null && (
                <span className={dirClass(quotes[t].changePct)}>{fmtPct(quotes[t].changePct, 1)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        {/* ---------------- left rail ---------------- */}
        <div className={styles.rail}>
          <Panel title="Net equity" meta="paper">
            {acct ? (
              <>
                <div className={styles.bigNum}>${fmtPrice(acct.equity)}</div>
                <div className={`${styles.subNum} ${dirClass(acct.dayPL)}`}>
                  {fmtSignedMoney(acct.dayPL)} today {acct.dayPLpct != null && `(${fmtPct(acct.dayPLpct)})`}
                </div>
                <Spark values={equityVals} color={equityVals.length > 1 && equityVals[equityVals.length - 1] < equityVals[0] ? 'var(--desk-down)' : 'var(--desk-up)'} />
              </>
            ) : <Empty>Paper account not connected</Empty>}
          </Panel>

          <Panel title="Sharpe · drawdown" meta="20d rolling">
            {sharpe.length ? (
              <>
                <div className={styles.pair}>
                  <div><span className={styles.k}>Sharpe</span><span className={`${styles.v} ${dirClass(sharpe[sharpe.length - 1])}`}>{sharpe[sharpe.length - 1].toFixed(2)}</span></div>
                  <div><span className={styles.k}>Drawdown</span><span className={`${styles.v} ${styles.down}`}>{dd[dd.length - 1].toFixed(2)}%</span></div>
                  <div><span className={styles.k}>Max DD</span><span className={`${styles.v} ${styles.down}`}>{Math.min(...dd).toFixed(2)}%</span></div>
                </div>
                <Spark values={sharpe} baseline={0} color="var(--desk-accent)" fill={false} height={34} />
                <Spark values={dd} color="var(--desk-down)" height={30} />
              </>
            ) : <Empty>Needs 20+ days of equity history</Empty>}
          </Panel>

          <Panel title="Market regime" meta="today, by sector">
            {breadth.some((b) => b.total) ? (
              <div className={styles.dots}>
                {SECTIONS.map((s) => (
                  <div key={s.name} className={styles.dotRow}>
                    <span className={styles.dotLabel}>{s.name}</span>
                    <span className={styles.dotCells}>
                      {s.tickers.map((t) => {
                        const c = quotes[t] && quotes[t].changePct;
                        const cls = c == null ? styles.dotNa : c >= 1 ? styles.dotUp2 : c > 0 ? styles.dotUp : c <= -1 ? styles.dotDn2 : styles.dotDn;
                        return <i key={t} className={`${styles.dot} ${cls}`} title={`${t} ${c == null ? '—' : fmtPct(c)}`} />;
                      })}
                    </span>
                  </div>
                ))}
              </div>
            ) : <Empty>Waiting for quotes</Empty>}
          </Panel>

          <Panel title="Sector breadth" meta="% names up">
            <div className={styles.vbars}>
              {breadth.map((b) => {
                const f = b.total ? b.up / b.total : 0;
                return (
                  <div key={b.name} className={styles.vbar} title={`${b.name}: ${b.up}/${b.total} up · avg ${b.avg == null ? '—' : fmtPct(b.avg)}`}>
                    <span className={styles.vtrack}><span className={`${styles.vfill} ${f >= 0.5 ? styles.vfillUp : styles.vfillDn}`} style={{ height: `${Math.max(4, f * 100)}%` }} /></span>
                    <span className={styles.vlabel}>{b.name.slice(0, 4)}</span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Realized vs implied" meta={tickerLabel(ticker)}>
            <div className={styles.pair}>
              <div><span className={styles.k}>RV 20d</span><span className={styles.v}>{pct(rv)}</span></div>
              <div><span className={styles.k}>ATM IV</span><span className={styles.v}>{pct(iv)}</span></div>
              <div>
                <span className={styles.k}>IV − RV</span>
                <span className={`${styles.v} ${dirClass(iv != null && rv != null ? iv - rv : null)}`}>
                  {iv != null && rv != null ? `${((iv - rv) * 100).toFixed(1)} pts` : '—'}
                </span>
              </div>
            </div>
            <Spark values={rvSeries} baseline={iv} color="var(--desk-accent)" height={40} />
          </Panel>

          <Panel title="Top positions" meta="% of gross">
            {weights.length ? (
              <ul className={styles.hbars}>
                {weights.map((p) => (
                  <li key={p.symbol}>
                    <span className={styles.hlabel}>{p.symbol}{p.short && ' (S)'}</span>
                    <span className={styles.htrack}><span className={styles.hfill} style={{ width: `${p.weight * 100}%` }} /></span>
                    <span className={`${styles.hval} ${dirClass(p.plPct)}`}>{(p.weight * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            ) : <Empty>No open positions</Empty>}
          </Panel>
        </div>

        {/* ---------------- main chart ---------------- */}
        <section className={`${styles.panel} ${styles.chartPanel}`} ref={chartBoxRef}>
          <PriceHeader ticker={ticker} />
          <div className={styles.legend}>
            <span><i style={{ background: '#38bdf8' }} />EMA 20</span>
            <span><i style={{ background: '#a78bfa' }} />EMA 50</span>
            <span><i className={styles.dashed} style={{ borderColor: '#facc15' }} />VWAP (session)</span>
          </div>
          <Chart ticker={ticker} timeframe={timeframe} setTimeframe={setTimeframe} fsTargetRef={chartBoxRef} overlays />
        </section>

        {/* ---------------- IV surface ---------------- */}
        <Panel
          className={styles.surfacePanel}
          title="Implied vol surface"
          meta={chain ? `${tickerLabel(ticker)} · ${chain.source === 'polygon' ? 'real-time' : 'CBOE ~15m delayed'} · drag to rotate` : tickerLabel(ticker)}
        >
          {surface ? <IvSurface surface={surface} dark={dark} /> : (
            <Empty>{isCrypto(ticker) ? 'No listed options for crypto' : chain ? 'Not enough expiries to draw a surface' : 'Loading option chain…'}</Empty>
          )}
        </Panel>

        {/* ---------------- SATS ---------------- */}
        <Panel
          className={styles.satsPanel}
          title={`SATS model · ${sats ? sats.symbol : ''}`}
          meta={sats ? `fresh ${sats.evaluation.start.slice(5, 10)} → ${sats.evaluation.end.slice(5, 10)} · ${sats.paper_ready ? 'paper-ready' : 'research only'}` : ''}
        >
          {sats ? (
            <div className={styles.satsBody}>
              <div className={styles.satsCurves}>
                {satsCurves.map(({ key, m }) => (
                  <div key={key} className={styles.satsRow}>
                    <span className={styles.satsKey}>{key}</span>
                    <Spark values={m.curve.map((p) => p.equity)} baseline={1} color={key === 'sats' ? 'var(--desk-accent)' : key === 'fly' ? 'var(--desk-up)' : 'var(--desk-muted)'} height={30} />
                    <span className={`${styles.satsRet} ${dirClass(m.return_pct)}`}>{m.return_pct >= 0 ? '+' : ''}{m.return_pct.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
              <div className={styles.gates}>
                <div className={styles.gatesHead}>Gates <b>{passed}/{checks.length}</b></div>
                <ul>
                  {checks.map(([k, v]) => (
                    <li key={k} className={v ? styles.gateOk : styles.gateNo}>
                      <i />{CHECK_LABELS[k] || k}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : <Empty>Loading SATS evaluation…</Empty>}
        </Panel>

        {/* ---------------- bottom wide ---------------- */}
        <Panel
          className={styles.bottomPanel}
          title={bottomMode === 'depth' ? `Open-interest depth · ${tickerLabel(ticker)}` : 'Portfolio P&L profile · ±10% spot'}
          meta={bottomMode === 'depth'
            ? (depth ? `puts ${Math.round(depth.putTotal).toLocaleString()} ◂ spot ▸ calls ${Math.round(depth.callTotal).toLocaleString()} · ≤30d expiries` : '')
            : (profile ? `net exposure $${fmtPrice(profile.net)} · all positions shocked together` : '')}
          actions={(
            <>
              <button className={`${styles.chip} ${bottomMode === 'depth' ? styles.chipActive : ''}`} onClick={() => setBottomMode('depth')}>OI depth</button>
              <button className={`${styles.chip} ${bottomMode === 'pnl' ? styles.chipActive : ''}`} onClick={() => setBottomMode('pnl')}>P&amp;L / VaR</button>
            </>
          )}
        >
          {bottomMode === 'depth'
            ? (depth ? <DepthWings depth={depth} /> : <Empty>{isCrypto(ticker) ? 'No listed options for crypto' : 'Loading option chain…'}</Empty>)
            : (profile ? <PnlProfile profile={profile} varDollars={varDollars} /> : <Empty>No open positions to stress</Empty>)}
        </Panel>
      </div>
    </div>
  );
}
