import React, { useState } from 'react';
import { marketStatus } from './marketData';
import { fmtPrice, fmtSignedMoney, fmtClockCT } from '../../lib/format';
import { getPortfolio } from '../../lib/market';
import usePolling from '../../lib/usePolling';
import styles from './styles.module.css';

/*
 * Paper Portfolio panel — read-only.
 *
 * Fetches the terminal's own Cloudflare Worker at /_m/portfolio, which reads the
 * Alpaca *paper* account (equity + open positions) server-side. It never places
 * or cancels orders. If no paper keys are configured (or the Worker isn't
 * deployed yet) it shows a friendly "not connected" state instead of an error.
 */

const POLL_MS = 15000;

const money = (v) => (v == null || Number.isNaN(v) ? '—' : `$${fmtPrice(v)}`);
const signedMoney = (v) => fmtSignedMoney(v);
const signedPct = (v) => (v == null || Number.isNaN(v) ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`);
const dirClassOf = (v) => (v == null ? '' : v >= 0 ? styles.up : styles.down);
const fmtAsOf = (iso) => fmtClockCT(iso);

export default function Portfolio() {
  const [state, setState] = useState({ status: 'loading' });

  usePolling(async ({ signal, cancelled }) => {
    try {
      const d = await getPortfolio({ signal });
      if (cancelled()) return;
      if (d && d.account && !d.error) setState({ status: 'ok', data: d });
      else setState((s) => (s.status === 'ok' ? s : { status: 'idle' }));
    } catch (_) {
      // Keep showing the last good snapshot; otherwise fall back to "not connected".
      if (!cancelled()) setState((s) => (s.status === 'ok' ? s : { status: 'idle' }));
    }
  }, POLL_MS);

  const status = marketStatus();

  const header = (
    <div className={styles.pfHead}>
      <span className={styles.pfTitle}>
        <span className={styles.pfPip} />
        Paper Portfolio
      </span>
      <span className={styles.pfSub}>Alpaca · paper account</span>
      <span className={`${styles.marketBadge} ${styles['mkt_' + status.state]}`}>
        <span className={styles.marketDot} />
        {status.label}
      </span>
    </div>
  );

  if (state.status === 'loading') {
    return (
      <div className={styles.portfolio}>
        {header}
        <div className={styles.pfEmpty}>Loading portfolio…</div>
      </div>
    );
  }

  if (state.status === 'idle') {
    return (
      <div className={styles.portfolio}>
        {header}
        <div className={styles.pfEmpty}>
          <strong>Paper portfolio isn’t connected yet.</strong>
          <span>
            Once an Alpaca paper account is linked to the market worker, this panel shows live account
            equity and open positions here — no real money involved.
          </span>
        </div>
      </div>
    );
  }

  const { account: a, positions, asOf } = state.data;

  return (
    <div className={styles.portfolio}>
      {header}

      <div className={styles.pfSummary}>
        <div className={styles.pfStat}>
          <div className={styles.pfStatLabel}>Equity</div>
          <div className={styles.pfStatVal}>{money(a.portfolioValue != null ? a.portfolioValue : a.equity)}</div>
        </div>
        <div className={styles.pfStat}>
          <div className={styles.pfStatLabel}>Day P/L</div>
          <div className={`${styles.pfStatVal} ${dirClassOf(a.dayPL)}`}>
            {signedMoney(a.dayPL)} {a.dayPLpct != null && <span className={styles.pfStatSub}>({signedPct(a.dayPLpct)})</span>}
          </div>
        </div>
        <div className={styles.pfStat}>
          <div className={styles.pfStatLabel}>Cash</div>
          <div className={styles.pfStatVal}>{money(a.cash)}</div>
        </div>
        <div className={styles.pfStat}>
          <div className={styles.pfStatLabel}>Buying power</div>
          <div className={styles.pfStatVal}>{money(a.buyingPower)}</div>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className={styles.pfEmpty}>No open positions right now.</div>
      ) : (
        <div className={styles.pfTableWrap}>
          <table className={styles.pfTable}>
            <thead>
              <tr>
                <th>Symbol</th>
                <th className={styles.pfNum}>Qty</th>
                <th className={styles.pfNum}>Avg entry</th>
                <th className={styles.pfNum}>Last</th>
                <th className={styles.pfNum}>Mkt value</th>
                <th className={styles.pfNum}>Unrealized P/L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.symbol}>
                  <td>
                    <span className={styles.pfSym}>{p.symbol}</span>
                    {p.side === 'short' && <span className={styles.pfShort}>SHORT</span>}
                  </td>
                  <td className={styles.pfNum}>{p.qty}</td>
                  <td className={styles.pfNum}>{money(p.avgEntry)}</td>
                  <td className={styles.pfNum}>{money(p.price)}</td>
                  <td className={styles.pfNum}>{money(p.marketValue)}</td>
                  <td className={`${styles.pfNum} ${dirClassOf(p.unrealizedPL)}`}>
                    {signedMoney(p.unrealizedPL)}
                    {p.unrealizedPLpct != null && <span className={styles.pfStatSub}> ({signedPct(p.unrealizedPLpct)})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.pfFoot}>
        Read-only paper account via Alpaca · positions refresh automatically
        {asOf && <> · updated {fmtAsOf(asOf)}</>}
      </div>
    </div>
  );
}
