import React, { useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import styles from './styles.module.css';

/*
 * Market Terminal.
 * Left: price chart (placeholder — wired next).  Right: live news feed.
 */

const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'SPY'];

export default function Terminal() {
  const [ticker, setTicker] = useState(TICKERS[0]);

  return (
    <div className={styles.wrap}>
      <div className={styles.tickerBar}>
        <span className={styles.tickerLabel}>Ticker:</span>
        {TICKERS.map((t) => (
          <button
            key={t}
            className={`${styles.tickerBtn} ${t === ticker ? styles.tickerBtnActive : ''}`}
            onClick={() => setTicker(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Price Chart</span>
            <span className={styles.panelTicker}>{ticker}</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.placeholder}>
              <strong>Chart</strong>
              The price chart for {ticker} will render here once we wire in the data source (next step).
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span>Market News</span>
            <span className={styles.panelTicker}>LIVE</span>
          </div>
          <BrowserOnly fallback={<div className={styles.panelBody}><div className={styles.placeholder}>Loading news…</div></div>}>
            {() => {
              const News = require('./News').default;
              return <News />;
            }}
          </BrowserOnly>
        </div>
      </div>

      <p className={styles.note}>
        Market Terminal — news feed is live (RSS via rss2json). Chart wiring is the next piece.
      </p>
    </div>
  );
}
