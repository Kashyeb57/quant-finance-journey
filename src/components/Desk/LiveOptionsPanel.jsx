import React, { useState } from 'react';
import { fmtPrice, fmtDateCT } from '../../lib/format';
import { Panel, dirClass } from './panels';
import { VIEWS, shortDate } from './optionsPanels';
import styles from './styles.module.css';

/*
 * The owner-only live chain: this week's contracts around the price, read from
 * Robinhood by the bridge on his PC. `snap` comes from useLiveOptions(); the
 * tile only exists while the bridge is running. Display only, no order controls.
 */

const STALE_AFTER_MS = 180_000;
const EM = '—';

export default function LiveOptionsPanel({ snap, bare }) {
  const [view, setView] = useState('quotes');
  const cols = VIEWS[view];
  const { rows = [], stock, expiry, asOf, error, message, refreshSec } = snap;
  const stale = !asOf || Date.now() - Date.parse(asOf) > STALE_AFTER_MS;
  const S = stock && stock.last;

  let atmK = null;
  for (const r of rows) if (atmK == null || Math.abs(r.k - S) < Math.abs(atmK - S)) atmK = r.k;
  const change = stock && stock.prevClose ? (stock.last / stock.prevClose - 1) * 100 : null;

  return (
    <Panel
      bare={bare}
      title="Live options"
      meta={expiry ? `${shortDate(expiry)} · Robinhood live${asOf ? ` · read ${fmtDateCT(asOf, { withTime: true })}` : ''}` : 'Robinhood live'}
      actions={(
        <>
          <button className={`${styles.chip} ${view === 'quotes' ? styles.chipActive : ''}`} onClick={() => setView('quotes')}>Quotes</button>
          <button className={`${styles.chip} ${view === 'greeks' ? styles.chipActive : ''}`} onClick={() => setView('greeks')}>Greeks</button>
        </>
      )}
    >
      {!rows.length ? (
        <div className={styles.empty}>{error ? `Bridge error: ${error}` : message || 'Waiting for the first read…'}</div>
      ) : (
        <>
          <div className={styles.emHead}>
            <div>
              <span className={styles.k}>Last</span>
              <span className={styles.v}>{fmtPrice(S)}</span>
              {change != null && <span className={`${styles.emChange} ${dirClass(change)}`}>{change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(2)}%</span>}
            </div>
            <div>
              <span className={styles.k}>Bid / ask</span>
              <span className={styles.v}>{stock.bid > 0 ? fmtPrice(stock.bid) : EM} / {stock.ask > 0 ? fmtPrice(stock.ask) : EM}</span>
            </div>
          </div>
          <div className={`${styles.chainWrap} ${stale ? styles.isStale : ''}`}>
            <table className={styles.chainTable}>
              <thead>
                <tr className={styles.sideHead}>
                  <th colSpan={cols.length}>Calls</th>
                  <th />
                  <th colSpan={cols.length}>Puts</th>
                </tr>
                <tr>
                  {cols.map((c) => <th key={`c${c.key}`}>{c.label}</th>)}
                  <th className={styles.strikeCol}>Strike</th>
                  {[...cols].reverse().map((c) => <th key={`p${c.key}`}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.k} className={r.k === atmK ? styles.atmRow : ''}>
                    {cols.map((c) => <td key={`c${c.key}`} className={r.k < S ? styles.itm : ''}>{r.call ? c.fmt(r.call) : EM}</td>)}
                    <td className={styles.strikeCol}>{fmtPrice(r.k)}</td>
                    {[...cols].reverse().map((c) => <td key={`p${c.key}`} className={r.k > S ? styles.itm : ''}>{r.put ? c.fmt(r.put) : EM}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.chainNote}>
            {error ? `Last read failed (${error}), showing the one before. ` : ''}
            {stale ? 'These prices are more than 3 minutes old. ' : ''}
            Read from Robinhood every {refreshSec}s by the bridge on this PC. Only you can see this, and it cannot place orders.
          </p>
        </>
      )}
    </Panel>
  );
}
