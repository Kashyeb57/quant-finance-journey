import React, { useState } from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import { SECTIONS } from '../Terminal/tickers';
import { isCrypto } from '../Terminal/marketData';
import { fmtPrice, fmtSignedMoney, fmtPct } from '../../lib/format';
import IvSurface from './IvSurface';
import { Spark, DepthWings, PnlProfile } from './charts';
import styles from './styles.module.css';

/*
 * The desk's panels as standalone pieces. Each takes `d`, the object returned
 * by useDeskData(ticker), so the Quant Desk page and the Terminal's analytics
 * row lay out the same panels differently without fetching twice.
 */

export const tickerLabel = (t) => (t === 'BTC-USD' ? '₿ BTC' : t);
export const dirClass = (v) => (v == null ? '' : v >= 0 ? styles.up : styles.down);
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

export function Panel({ title, meta, className = '', children, actions }) {
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

/* ------------------------------------------------------------ risk cards */

export function EquityCard({ d }) {
  const { acct, equityVals } = d;
  const falling = equityVals.length > 1 && equityVals[equityVals.length - 1] < equityVals[0];
  return (
    <Panel title="Net equity" meta="paper">
      {acct ? (
        <>
          <div className={styles.bigNum}>${fmtPrice(acct.equity)}</div>
          <div className={`${styles.subNum} ${dirClass(acct.dayPL)}`}>
            {fmtSignedMoney(acct.dayPL)} today {acct.dayPLpct != null && `(${fmtPct(acct.dayPLpct)})`}
          </div>
          <Spark values={equityVals} color={falling ? 'var(--desk-down)' : 'var(--desk-up)'} />
        </>
      ) : <Empty>Paper account not connected</Empty>}
    </Panel>
  );
}

export function SharpeCard({ d }) {
  const { sharpe, dd } = d;
  return (
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
  );
}

export function RegimeCard({ d }) {
  const { breadth, quotes } = d;
  return (
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
  );
}

export function BreadthCard({ d }) {
  return (
    <Panel title="Sector breadth" meta="% names up">
      <div className={styles.vbars}>
        {d.breadth.map((b) => {
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
  );
}

export function VolCard({ d }) {
  const { rv, iv, rvSeries, ticker } = d;
  return (
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
  );
}

export function PositionsCard({ d }) {
  return (
    <Panel title="Top positions" meta="% of gross">
      {d.weights.length ? (
        <ul className={styles.hbars}>
          {d.weights.map((p) => (
            <li key={p.symbol}>
              <span className={styles.hlabel}>{p.symbol}{p.short && ' (S)'}</span>
              <span className={styles.htrack}><span className={styles.hfill} style={{ width: `${p.weight * 100}%` }} /></span>
              <span className={`${styles.hval} ${dirClass(p.plPct)}`}>{(p.weight * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      ) : <Empty>No open positions</Empty>}
    </Panel>
  );
}

/** All six risk cards, in rail order. */
export function RiskCards({ d }) {
  return (
    <>
      <EquityCard d={d} />
      <SharpeCard d={d} />
      <RegimeCard d={d} />
      <BreadthCard d={d} />
      <VolCard d={d} />
      <PositionsCard d={d} />
    </>
  );
}

/* --------------------------------------------------------- big panels */

export function SurfacePanel({ d, className }) {
  const { colorMode } = useColorMode();
  const { chain, surface, ticker } = d;
  return (
    <Panel
      className={className}
      title="Implied vol surface"
      meta={chain ? `${tickerLabel(ticker)} · ${chain.source === 'polygon' ? 'real-time' : 'CBOE ~15m delayed'} · drag to rotate` : tickerLabel(ticker)}
    >
      {surface ? <IvSurface surface={surface} dark={colorMode === 'dark'} /> : (
        <Empty>{isCrypto(ticker) ? 'No listed options for crypto' : chain ? 'Not enough expiries to draw a surface' : 'Loading option chain…'}</Empty>
      )}
    </Panel>
  );
}

export function SatsPanel({ d, className }) {
  const { sats } = d;
  const curves = sats && sats.metrics
    ? ['sats', 'simple', 'fly'].map((k) => ({ key: k, m: sats.metrics[k] })).filter((x) => x.m && Array.isArray(x.m.curve))
    : [];
  const checks = sats && sats.checks ? Object.entries(sats.checks) : [];
  const passed = checks.filter(([, v]) => v).length;
  return (
    <Panel
      className={className}
      title={`SATS model · ${sats ? sats.symbol : ''}`}
      meta={sats ? `fresh ${sats.evaluation.start.slice(5, 10)} → ${sats.evaluation.end.slice(5, 10)} · ${sats.paper_ready ? 'paper-ready' : 'research only'}` : ''}
    >
      {sats ? (
        <div className={styles.satsBody}>
          <div className={styles.satsCurves}>
            {curves.map(({ key, m }) => (
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
  );
}

/** Open-interest depth around spot, toggleable to the portfolio P&L / VaR profile. */
export function ExposurePanel({ d, className }) {
  const [mode, setMode] = useState('depth');
  const { depth, profile, varDollars, ticker } = d;
  return (
    <Panel
      className={className}
      title={mode === 'depth' ? `Open-interest depth · ${tickerLabel(ticker)}` : 'Portfolio P&L profile · ±10% spot'}
      meta={mode === 'depth'
        ? (depth ? `puts ${Math.round(depth.putTotal).toLocaleString()} ◂ spot ▸ calls ${Math.round(depth.callTotal).toLocaleString()} · ≤30d expiries` : '')
        : (profile ? `net exposure $${fmtPrice(profile.net)} · all positions shocked together` : '')}
      actions={(
        <>
          <button className={`${styles.chip} ${mode === 'depth' ? styles.chipActive : ''}`} onClick={() => setMode('depth')}>OI depth</button>
          <button className={`${styles.chip} ${mode === 'pnl' ? styles.chipActive : ''}`} onClick={() => setMode('pnl')}>P&amp;L / VaR</button>
        </>
      )}
    >
      {mode === 'depth'
        ? (depth ? <DepthWings depth={depth} /> : <Empty>{isCrypto(ticker) ? 'No listed options for crypto' : 'Loading option chain…'}</Empty>)
        : (profile ? <PnlProfile profile={profile} varDollars={varDollars} /> : <Empty>No open positions to stress</Empty>)}
    </Panel>
  );
}
