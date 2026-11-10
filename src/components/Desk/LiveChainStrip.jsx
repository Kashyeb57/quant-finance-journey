import React, { useState } from 'react';
import { fmtPrice } from '../../lib/format';
import { shortDate } from './optionsPanels';
import { chainSignals, fmtUsdShort, HOLDS } from './liveSignals.mjs';
import styles from './styles.module.css';

/*
 * The owner's live chain as a compact strip, shown under the candles when the
 * Terminal deck is full screen. Each contract shows what trading it costs and
 * how active it is (see liveSignals.mjs); the marks follow fixed rules and are
 * not trade signals. `snap` comes from useLiveOptions().
 */

const EM = '—';
const STALE_AFTER_MS = 120_000;
const TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const ivText = (q) => (q.iv > 0 ? `${(q.iv * 100).toFixed(1)}%` : EM);
function ivChange(q) {
  if (!Number.isFinite(q.dIv) || Math.abs(q.dIv) < 0.002) return null;
  return <span className={q.dIv > 0 ? styles.up : styles.down}>{q.dIv > 0 ? '▲' : '▼'}{Math.abs(q.dIv * 100).toFixed(1)}</span>;
}

/* One side of a row, written for calls (flow … need); puts mirror it. */
function Side({ q, s, tags, mirror, itm }) {
  const has = (t) => tags && tags.includes(t);
  const cells = [
    <td key="flow" className={`${itm} ${has('active') ? styles.tagActive : ''}`} title={has('fresh') ? 'Volume today is larger than open interest' : undefined}>
      {has('fresh') && <span className={styles.tagFresh}>●</span>}
      {q && Number.isFinite(q.dVol) ? q.dVol.toLocaleString('en-US') : EM}
    </td>,
    <td key="iv" className={itm}>{q ? <>{ivText(q)} {ivChange(q)}</> : EM}</td>,
    <td key="bid" className={`${itm} ${has('tight') ? styles.tagTight : ''}`}>{q && q.bid > 0 ? fmtPrice(q.bid) : EM}</td>,
    <td key="ask" className={`${itm} ${has('tight') ? styles.tagTight : ''}`}>{q && q.ask > 0 ? fmtPrice(q.ask) : EM}</td>,
    <td key="need" className={`${itm} ${has('cheap') ? styles.tagCheap : ''}`}>{s && s.needMove != null ? `$${s.needMove.toFixed(2)}` : EM}</td>,
  ];
  return mirror ? cells.reverse() : cells;
}

export default function LiveChainStrip({ snap }) {
  const [hold, setHold] = useState(30);
  const { rows = [], stock, expiry, asOf, symbol, flowSec, error, message } = snap;
  const S = stock && stock.last;
  const { stats, tags, flow } = chainSignals(rows, hold);
  const stale = !asOf || Date.now() - Date.parse(asOf) > STALE_AFTER_MS;
  let atmK = null;
  for (const r of rows) if (atmK == null || Math.abs(r.k - S) < Math.abs(atmK - S)) atmK = r.k;
  const flowMin = flowSec ? Math.max(1, Math.round(flowSec / 60)) : null;
  const HEADS = ['Traded', 'IV', 'Bid', 'Ask', 'Needs'];

  return (
    <div className={`${styles.vars} ${styles.strip}`}>
      <div className={styles.stripHead}>
        <span className={styles.stripTitle}>Live options <b>{symbol}</b>{expiry ? ` · ${shortDate(expiry)}` : ''}</span>
        {S != null && <span>{fmtPrice(S)}</span>}
        <span className={stale ? styles.down : ''}>{asOf ? `read ${TIME.format(new Date(asOf))} CT${stale ? ' (old)' : ''}` : message || 'waiting…'}</span>
        {flowMin && (
          <span title="Dollars traded in these contracts in the window">
            traded last {flowMin}m: calls <b>{fmtUsdShort(flow.call)}</b> · puts <b>{fmtUsdShort(flow.put)}</b>
          </span>
        )}
        {error && <span className={styles.down}>last read failed</span>}
        <span className={styles.stripHold}>
          hold
          {HOLDS.map((m) => (
            <button key={m} type="button" className={`${styles.chip} ${m === hold ? styles.chipActive : ''}`} onClick={() => setHold(m)}>{m}m</button>
          ))}
        </span>
      </div>
      {rows.length > 0 && (
        <>
          <table className={`${styles.chainTable} ${styles.stripTable} ${stale ? styles.isStale : ''}`}>
            <thead>
              <tr>
                {HEADS.map((h) => <th key={`c${h}`}>{h}</th>)}
                <th className={styles.strikeCol}>Calls · Strike · Puts</th>
                {[...HEADS].reverse().map((h) => <th key={`p${h}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k} className={r.k === atmK ? styles.atmRow : ''}>
                  <Side q={r.call} s={stats[`${r.k}C`]} tags={tags[`${r.k}C`]} itm={r.k < S ? styles.itm : ''} />
                  <td className={styles.strikeCol}>{fmtPrice(r.k)}</td>
                  <Side q={r.put} s={stats[`${r.k}P`]} tags={tags[`${r.k}P`]} itm={r.k > S ? styles.itm : ''} mirror />
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.stripLegend}>
            <b>Needs</b> = how far {symbol} must move your way within {hold} min to cover the spread and time decay (estimate).{' '}
            <span className={styles.tagCheap}>green</span> = needs the least · <span className={styles.tagTight}>underlined</span> = tightest spread ·{' '}
            <span className={styles.tagActive}>amber</span> = most dollars traded{flowMin ? ` in ${flowMin}m` : ''} · <span className={styles.tagFresh}>●</span> = volume above open interest.
            These describe cost and activity. They are not buy or sell signals.
          </p>
        </>
      )}
    </div>
  );
}
