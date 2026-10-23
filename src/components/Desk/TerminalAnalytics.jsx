import React from 'react';
import useDeskData from './useDeskData';
import { RiskCards, SurfacePanel, SatsPanel, ExposurePanel } from './panels';
import styles from './styles.module.css';

/*
 * The Quant Desk panels as a block under the Terminal's chart + news deck:
 * IV surface · OI depth (or P&L / VaR) · SATS across the top, then the six
 * risk cards as a strip. Follows whichever ticker the Terminal has selected.
 */
export default function TerminalAnalytics({ ticker }) {
  const d = useDeskData(ticker);
  return (
    <div className={`${styles.desk} ${styles.analytics}`}>
      <div className={styles.analyticsTop}>
        <SurfacePanel d={d} />
        <ExposurePanel d={d} />
        <SatsPanel d={d} />
      </div>
      <div className={styles.analyticsCards}>
        <RiskCards d={d} />
      </div>
    </div>
  );
}
