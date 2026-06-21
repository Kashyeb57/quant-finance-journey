import React, { useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import styles from './styles.module.css';

/*
 * Market Terminal.
 * Left: live price chart (TradingView).  Right: live RSS news feed.
 */

const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'SPY'];

// TradingView symbol mapping (exchange-qualified for reliable resolution).
const TV_SYMBOL = {
  AAPL: 'NASDAQ:AAPL',
  MSFT: 'NASDAQ:MSFT',
  NVDA: 'NASDAQ:NVDA',
  TSLA: 'NASDAQ:TSLA',
  SPY: 'AMEX:SPY',
};

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
          <BrowserOnly fallback={<div className={styles.panelBody}><div className={styles.placeholder}>Loading chart…</div></div>}>
            {() => {
              const Chart = require('./Chart').default;
              return <Chart ticker={ticker} />;
            }}
          </BrowserOnly>
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
        Market Terminal — live TradingView chart (left) and live RSS news feed (right).
      </p>
    </div>
  );
}
