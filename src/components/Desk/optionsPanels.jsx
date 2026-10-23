import React, { useLayoutEffect, useRef, useState } from 'react';
import { isCrypto } from '../Terminal/marketData';
import { fmtPrice, fmtVolume, fmtDateCT } from '../../lib/format';
import { Panel, tickerLabel, dirClass } from './panels';
import { Spark } from './charts';
import styles from './styles.module.css';

/*
 * The options side of the desk: the chain for one expiry with its greeks, and
 * the expected move of every expiry. Both read one useOptionChain() result
 * (CBOE's free feed via the Worker, ~15 min delayed), passed in as `oc`.
 */

const EM = '—';
const pctOf = (v, d = 1) => (v == null ? EM : `${(v * 100).toFixed(d)}%`);
const num = (v, d) => (v == null || Number.isNaN(v) ? EM : v.toFixed(d));
const signed = (v, d) => (v == null || Number.isNaN(v) ? EM : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`);

// "2026-11-20" -> "Nov 20" without touching time zones (it is a calendar date).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;

// The Worker sends CBOE's snapshot time as ISO UTC; show it in CT.
const asOfLabel = (iso) => (iso ? `data ${fmtDateCT(iso, { withTime: true })}` : '');

function emptyText(ticker, oc) {
  if (isCrypto(ticker)) return 'No listed options for crypto';
  if (oc.error && !oc.chain) return 'Option chain unavailable right now';
  return 'Loading option chain…';
}

/* Columns per side, written for the call side; the put side mirrors them. */
const VIEWS = {
  quotes: [
    { key: 'oi', label: 'OI', fmt: (q) => fmtVolume(q.oi) },
    { key: 'volume', label: 'Vol', fmt: (q) => fmtVolume(q.volume) },
    { key: 'iv', label: 'IV', fmt: (q) => pctOf(q.iv) },
    { key: 'bid', label: 'Bid', fmt: (q) => (q.bid > 0 ? fmtPrice(q.bid) : EM) },
    { key: 'ask', label: 'Ask', fmt: (q) => (q.ask > 0 ? fmtPrice(q.ask) : EM) },
  ],
  greeks: [
    { key: 'vega', label: 'Vega', fmt: (q) => num(q.vega, 3) },
    { key: 'theta', label: 'Theta', fmt: (q) => num(q.theta, 3) },
    { key: 'gamma', label: 'Gamma', fmt: (q) => num(q.gamma, 4) },
    { key: 'delta', label: 'Delta', fmt: (q) => num(q.delta, 2) },
    { key: 'iv', label: 'IV', fmt: (q) => pctOf(q.iv) },
  ],
};
const VIEW_HELP = {
  quotes: 'Bid/ask and IV per contract; Vol is today’s contracts traded, OI the contracts open as of last night.',
  greeks: 'Per share, from CBOE: delta (price move per $1), gamma (delta change per $1), theta ($ per day), vega ($ per 1 vol point).',
};

/** Expiry chips, nearest first. */
function ExpiryStrip({ expiries, exp, onPick }) {
  return (
    <div className={styles.expStrip} role="tablist" aria-label="Expiry">
      {expiries.map((e) => (
        <button
          key={e.date}
          role="tab"
          aria-selected={e.date === exp}
          className={`${styles.chip} ${e.date === exp ? styles.chipActive : ''}`}
          onClick={() => onPick(e.date)}
          title={`${e.date} · ${e.days} days`}
        >
          {shortDate(e.date)} <span className={styles.expDays}>{e.days}d</span>
        </button>
      ))}
    </div>
  );
}

export function OptionChainPanel({ oc, ticker, setExp, className, bare }) {
  const [view, setView] = useState('quotes');
  const scrollRef = useRef(null);
  const atmRef = useRef(null);
  const { chain, stale } = oc;
  const cols = VIEWS[view];
  const current = chain && chain.expiries.find((e) => e.date === chain.exp);

  // Open each expiry with the at-the-money strikes in view, not the deepest puts.
  const chainKey = chain ? `${chain.symbol}|${chain.exp}` : '';
  useLayoutEffect(() => {
    const box = scrollRef.current, row = atmRef.current;
    if (box && row) box.scrollTop = Math.max(0, row.offsetTop - box.clientHeight / 2);
  }, [chainKey]);

  let body;
  if (!chain) {
    body = <div className={styles.empty}>{emptyText(ticker, oc)}</div>;
  } else {
    const S = chain.spot;
    let atmK = null;
    for (const r of chain.rows) if (atmK == null || Math.abs(r.k - S) < Math.abs(atmK - S)) atmK = r.k;
    const spotAt = chain.rows.findIndex((r) => r.k >= S); // the spot line goes before this row
    const spotRow = (
      <tr className={styles.spotRow}>
        <td colSpan={cols.length} />
        <td className={styles.strikeCol}><span>{fmtPrice(S)}</span></td>
        <td colSpan={cols.length} />
      </tr>
    );
    body = (
      <>
        <ExpiryStrip expiries={chain.expiries} exp={chain.exp} onPick={setExp} />
        <div className={`${styles.chainWrap} ${stale ? styles.isStale : ''}`} ref={scrollRef}>
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
              {chain.rows.map((r, i) => {
                const callItm = r.k < S, putItm = r.k > S;
                return (
                  <React.Fragment key={r.k}>
                    {i === spotAt && spotRow}
                    <tr ref={r.k === atmK ? atmRef : null} className={r.k === atmK ? styles.atmRow : ''}>
                      {cols.map((c) => <td key={`c${c.key}`} className={callItm ? styles.itm : ''}>{r.call ? c.fmt(r.call) : EM}</td>)}
                      <td className={styles.strikeCol}>{fmtPrice(r.k)}</td>
                      {[...cols].reverse().map((c) => <td key={`p${c.key}`} className={putItm ? styles.itm : ''}>{r.put ? c.fmt(r.put) : EM}</td>)}
                    </tr>
                  </React.Fragment>
                );
              })}
              {spotAt === -1 && spotRow}
            </tbody>
          </table>
        </div>
        <p className={styles.chainNote}>{VIEW_HELP[view]} Shaded = in the money.</p>
      </>
    );
  }

  return (
    <Panel
      bare={bare}
      className={className}
      title={`Option chain · ${tickerLabel(ticker)}`}
      meta={chain && current ? `${shortDate(chain.exp)} · ${current.days}d · CBOE ~15m delayed${asOfLabel(chain.asOf) ? ` · ${asOfLabel(chain.asOf)}` : ''}` : ''}
      actions={(
        <>
          <button className={`${styles.chip} ${view === 'quotes' ? styles.chipActive : ''}`} onClick={() => setView('quotes')}>Quotes</button>
          <button className={`${styles.chip} ${view === 'greeks' ? styles.chipActive : ''}`} onClick={() => setView('greeks')}>Greeks</button>
        </>
      )}
    >
      {body}
    </Panel>
  );
}

/**
 * The market's own forecast of how far the stock can travel by each expiry:
 * the at-the-money straddle's price, which is the expected absolute move
 * (about 0.8 standard deviations under a normal distribution, so ±straddle
 * holds roughly 57% of outcomes). Clicking an expiry opens it in the chain.
 */
export function ExpectedMovePanel({ oc, ticker, exp, setExp, className, bare }) {
  const { chain } = oc;
  const rows = chain ? chain.expiries.filter((e) => e.move != null).slice(0, 12) : [];
  const shown = chain ? chain.exp : exp;
  const term = rows.map((e) => e.atmIv).filter((v) => v != null);
  return (
    <Panel
      bare={bare}
      className={className}
      title={`Expected move · ${tickerLabel(ticker)}`}
      meta={chain ? `from the ATM straddle · spot ${fmtPrice(chain.spot)}` : ''}
    >
      {chain ? (
        <>
          <div className={styles.emHead}>
            <div>
              <span className={styles.k}>IV 30d</span>
              <span className={styles.v}>{chain.iv30 != null ? `${chain.iv30.toFixed(1)}%` : EM}</span>
              {chain.iv30Change != null && (
                <span className={`${styles.emChange} ${dirClass(chain.iv30Change)}`}>{signed(chain.iv30Change, 1)} pts today</span>
              )}
            </div>
            <div className={styles.emTerm}>
              <span className={styles.k}>ATM IV by expiry</span>
              <Spark values={term} color="var(--desk-accent)" fill={false} height={30} />
            </div>
          </div>
          <div className={styles.emWrap}>
            <table className={styles.emTable}>
              <thead>
                <tr><th>Expiry</th><th>Days</th><th>± Move</th><th>± %</th><th>Range</th><th>ATM IV</th></tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.date}
                    className={e.date === shown ? styles.emActive : ''}
                    onClick={() => setExp(e.date)}
                    title="Open this expiry in the chain"
                  >
                    <td>{shortDate(e.date)}</td>
                    <td>{e.days}</td>
                    <td>±{fmtPrice(e.move)}</td>
                    <td>±{e.movePct.toFixed(1)}%</td>
                    <td className={styles.emRange}>{fmtPrice(chain.spot - e.move)} – {fmtPrice(chain.spot + e.move)}</td>
                    <td>{pctOf(e.atmIv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.chainNote}>
            The straddle prices the average size of the move by expiry. If it is fair, the stock ends inside the
            range about 57% of the time; a one-standard-deviation range is about 1.25× wider. Earnings and other
            events are already in these prices.
          </p>
        </>
      ) : <div className={styles.empty}>{emptyText(ticker, oc)}</div>}
    </Panel>
  );
}
