import React, { useState } from 'react';
import styles from './styles.module.css';

/*
 * Market Terminal — scaffold.
 * Layout: price chart (left) + news feed (right) for a selected ticker.
 * Data sources are wired in incrementally; for now both panels show placeholders.
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
              The price chart for {ticker} will render here once we wire in the data source.
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span>News</span>
            <span className={styles.panelTicker}>{ticker}</span>
          </div>
          <div className={styles.panelBody}>
            <div className={styles.placeholder}>
              <strong>News Feed</strong>
              Latest headlines for {ticker} will appear here once we connect the news source.
            </div>
          </div>
        </div>
      </div>

      <p className={styles.note}>
        Market Terminal — work in progress. Chart and news panels are wired in one piece at a time.
      </p>
    </div>
  );
}
