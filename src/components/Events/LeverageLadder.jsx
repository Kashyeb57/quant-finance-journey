import React from 'react';
import styles from './charts.module.css';

/*
 * LeverageLadder — heat-map table of how LONG exposure turns a fall in the long
 * positions into a loss of equity, before shorts, hedges and financing.
 *
 * Each cell = drop_in_longs × long_exposure_multiple.
 * Cells where the loss reaches 100% are flagged deep red — "past wipe-out".
 *
 * It is deliberately about long exposure, not gross leverage: gross counts
 * longs and shorts together, so a fund at 4× gross might be 3× long and 1×
 * short, and its shorts move the other way in a sell-off.
 *
 * Props:
 *   actualDrop  — the scenario drop in the longs, % (negative), default -30
 *   actualLev   — the long exposure to outline,               default 3
 *   badge       — label for the outlined column,               default 'Illustration'
 */

const LEVELS = [1, 2, 3, 4];
const DROPS  = [-10, -15, -20, -25, -30, -33];

function equity(drop, lev) {
  const v = drop * lev;
  // show one decimal only if not a whole number
  return Number.isInteger(v) ? v : Math.round(v * 10) / 10;
}

export default function LeverageLadder({ actualDrop = -30, actualLev = 3, badge = 'Illustration' }) {
  return (
    <div className={styles.ladderWrap}>
      <table className={styles.ladder}>
        <thead>
          <tr>
            <th className={styles.ladderCornerCell}>
              Drop in the<br />long positions
            </th>
            {LEVELS.map(lev => (
              <th
                key={lev}
                className={`${styles.ladderHeadCell} ${lev === actualLev ? styles.ladderActualColHead : ''}`}
              >
                {lev}× long
                {lev === actualLev && (
                  <span className={styles.ladderActualBadge}>{badge}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DROPS.map(drop => {
            const isActualRow = drop === actualDrop;
            return (
              <tr key={drop}>
                <td className={`${styles.ladderRowLabel} ${isActualRow ? styles.ladderActualRowLabel : ''}`}>
                  {drop}%
                  {isActualRow && <span className={styles.ladderActualBadge}>Jul 2026</span>}
                </td>
                {LEVELS.map(lev => {
                  const impact    = equity(drop, lev);
                  const isScen    = drop === actualDrop && lev === actualLev;
                  const isWipeout = impact <= -100;
                  const isBad     = impact <= -75 && !isWipeout;

                  let cellClass = styles.ladderCell;
                  if (isWipeout) cellClass += ` ${styles.ladderCrit}`;
                  else if (isBad) cellClass += ` ${styles.ladderWarn}`;
                  if (isScen)    cellClass += ` ${styles.ladderScen}`;

                  return (
                    <td key={lev} className={cellClass}>
                      {impact}%
                      {isWipeout && !isScen && (
                        <span className={styles.ladderWipeTag}>wipe-out</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.ladderNote}>
        Each cell is the long book&rsquo;s contribution to the equity loss, <em>before</em> the
        short side, hedges and financing costs. Cells in{' '}
        <strong style={{ color: 'var(--viz-crit)' }}>deep red</strong>{' '}
        reach 100% or more &mdash; the longs alone would erase the capital. The{' '}
        <strong style={{ color: 'var(--viz-crit)' }}>outlined cell</strong>{' '}
        is an illustration, not the fund&rsquo;s disclosed position: its reported ~4× is{' '}
        <em>gross</em> leverage (longs and shorts together), and the long/short split was not
        published. At 3× long and 1× short, a ~30% fall in the longs costs about 90% of equity
        before the shorts; only if all ~4× were long would it be ~120%.
      </p>
    </div>
  );
}
