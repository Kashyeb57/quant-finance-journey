import React, { useEffect, useRef, useState } from 'react';
import { fetchSnapshot, marketStatus, fmtPrice, fmtVolume, isCrypto } from './marketData';
import { subscribeCryptoTicker } from './cryptoStream';
import { subscribeStockTrades } from './stockStream';
import styles from './styles.module.css';

/*
 * Live price header: last trade, day change, session high/low/volume and a
 * market open/closed badge. Refreshes fast while the tab is visible, and
 * flashes green/red briefly whenever the price moves.
 */

const REFRESH_MS = 2500;

// Crypto trades 24/7, so it shouldn't inherit the US-equities session badge.
function statusFor(ticker) {
  return isCrypto(ticker) ? { state: 'open', label: 'Crypto · 24/7' } : marketStatus();
}

// What the price on screen is actually coming from. The stream is a bonus layer
// over the 2.5s poll, not a replacement for it — so when the stream is not up,
// the number is still correct, just refreshed on a timer. Say which.
const FEED = {
  live: { label: 'Streaming', cls: 'feed_live',
          title: 'Tick-by-tick trades streaming live from Alpaca (IEX feed).' },
  polled: { label: `Polled ${REFRESH_MS / 1000}s`, cls: 'feed_polled',
            title: `Live stream unavailable — the price is refreshed every ${REFRESH_MS / 1000} seconds instead. `
                 + 'The data plan allows one streaming connection at a time, so this happens when it is already in use.' },
};

export default function PriceHeader({ ticker }) {
  const [snap, setSnap] = useState(null);
  const [flash, setFlash] = useState(null);
  const [status, setStatus] = useState(() => statusFor(ticker));
  // null until we know, so the badge doesn't flicker on every ticker change.
  const [feed, setFeed] = useState(null);
  const prevPrice = useRef(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    prevPrice.current = null;
    setSnap(null);
    setFeed(null);
    setStatus(statusFor(ticker));

    async function pull() {
      if (document.visibilityState === 'hidden') return;
      const s = await fetchSnapshot(ticker);
      if (cancelled || !s) return;
      if (prevPrice.current != null && s.last != null && s.last !== prevPrice.current) {
        setFlash(s.last > prevPrice.current ? 'up' : 'down');
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), 700);
      }
      prevPrice.current = s.last;
      setSnap(s);
    }

    let unsub = null;
    let dataTimer = null;

    if (isCrypto(ticker)) {
      // Immediate snapshot, then live tick-by-tick from Coinbase's stream.
      pull();
      unsub = subscribeCryptoTicker(ticker, (t) => {
        if (cancelled) return;
        const last = t.price;
        if (prevPrice.current != null && last !== prevPrice.current) {
          setFlash(last > prevPrice.current ? 'up' : 'down');
          clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(null), 700);
        }
        prevPrice.current = last;
        const change = t.open24h != null ? last - t.open24h : null;
        setSnap({
          symbol: ticker,
          last,
          prevClose: t.open24h,
          change,
          changePct: t.open24h ? (change / t.open24h) * 100 : null,
          dayHigh: t.high24h,
          dayLow: t.low24h,
          volume: t.volume24h,
          source: 'live',
        });
      });
      // Coinbase's public feed is not behind our Worker, so the single-connection
      // limit does not apply to it.
      setFeed('live');
    } else {
      pull();
      dataTimer = setInterval(pull, REFRESH_MS);
      // Live last price tick-by-tick when the market is open; the poll fills in
      // the rest of the stats (and keeps working when the market is closed).
      unsub = subscribeStockTrades(ticker, (t) => {
        if (cancelled) return;
        const last = t.price;
        if (prevPrice.current != null && last !== prevPrice.current) {
          setFlash(last > prevPrice.current ? 'up' : 'down');
          clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setFlash(null), 700);
        }
        prevPrice.current = last;
        setSnap((prev) => {
          if (!prev) return prev;
          const change = prev.prevClose != null ? last - prev.prevClose : prev.change;
          return {
            ...prev,
            last,
            change,
            changePct: prev.prevClose ? (change / prev.prevClose) * 100 : prev.changePct,
          };
        });
      }, (state) => {
        // 'unavailable' means the stream gave up for good (one connection at a
        // time, and it is taken). The poll above keeps the price right either way.
        if (!cancelled) setFeed(state === 'ready' ? 'live' : 'polled');
      });
    }

    const clockTimer = setInterval(() => setStatus(statusFor(ticker)), 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') pull(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (dataTimer) clearInterval(dataTimer);
      if (unsub) unsub();
      clearInterval(clockTimer);
      clearTimeout(flashTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ticker]);

  const up = snap && snap.change != null && snap.change >= 0;
  const dirClass = !snap || snap.change == null ? '' : up ? styles.up : styles.down;
  const flashClass = flash === 'up' ? styles.flashUp : flash === 'down' ? styles.flashDown : '';

  return (
    <div className={styles.priceHeader}>
      <div className={styles.priceMain}>
        <span className={styles.priceSymbol}>{ticker}</span>
        <span className={`${styles.priceLast} ${dirClass} ${flashClass}`}>
          {snap ? fmtPrice(snap.last) : '—'}
        </span>
        {snap && snap.change != null && (
          <span className={`${styles.priceChange} ${dirClass}`}>
            {up ? '▲' : '▼'} {fmtPrice(Math.abs(snap.change))}
            {snap.changePct != null && ` (${up ? '+' : '−'}${Math.abs(snap.changePct).toFixed(2)}%)`}
          </span>
        )}
      </div>

      <div className={styles.priceStats}>
        {snap && snap.dayHigh != null && (
          <span className={styles.stat}>H <b>{fmtPrice(snap.dayHigh)}</b></span>
        )}
        {snap && snap.dayLow != null && (
          <span className={styles.stat}>L <b>{fmtPrice(snap.dayLow)}</b></span>
        )}
        {snap && snap.prevClose != null && (
          <span className={styles.stat}>PC <b>{fmtPrice(snap.prevClose)}</b></span>
        )}
        {snap && snap.volume != null && (
          <span className={styles.stat}>Vol <b>{fmtVolume(snap.volume)}</b></span>
        )}
        <span className={`${styles.marketBadge} ${styles['mkt_' + status.state]}`}>
          <span className={styles.marketDot} />
          {status.label}
        </span>
        {feed && (
          <span
            className={`${styles.feedBadge} ${styles[FEED[feed].cls]}`}
            title={FEED[feed].title}>
            <span className={styles.marketDot} />
            {FEED[feed].label}
          </span>
        )}
      </div>
    </div>
  );
}
