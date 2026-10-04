import React from 'react';
import { Bone, Skeleton } from '@site/src/components/Skeleton';
import styles from './styles.module.css';

/*
 * Loading shapes for the Terminal panels, laid out with each panel's own
 * classes so the real content replaces them without anything moving. Also
 * the server-rendered fallbacks shown before the page hydrates, which is why
 * this file imports nothing browser-only.
 */

const TITLE_WIDTHS = ['92%', '70%', '84%', '62%', '88%', '74%', '80%', '58%'];

export function NewsSkeleton() {
  return (
    <Skeleton label="Loading headlines">
      {TITLE_WIDTHS.map((w, i) => (
        <div key={w + i} className={`${styles.row} ${styles.rowSkeleton}`}>
          <span className={styles.rowTime}>
            <Bone w="44px" h="0.6rem" />
            <Bone w="30px" h="0.5rem" />
          </span>
          <Bone w="7px" h="7px" round className={styles.skDot} />
          <span className={styles.rowSrc}><Bone w="72px" h="0.6rem" /></span>
          <span className={styles.rowTitle}>
            <Bone w={w} />
            <Bone w={i % 2 ? '38%' : '52%'} />
          </span>
        </div>
      ))}
    </Skeleton>
  );
}

// A fixed candle silhouette (no randomness, so server and browser agree).
const CANDLES = Array.from({ length: 42 }, (_, i) => {
  const mid = 100 - 34 * Math.sin(i / 6) - 12 * Math.sin(i / 2.3) - i * 0.9;
  const body = 6 + ((i * 37) % 13);
  return { x: 8 + i * 9.4, mid, body, wick: body + 6 + ((i * 53) % 9) };
});

export function ChartSkeleton() {
  return (
    <Skeleton label="Loading chart" className={styles.chartSkeleton}>
      <svg className={styles.skCandles} viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {[40, 80, 120, 160].map((y) => (
          <line key={y} x1="0" x2="400" y1={y} y2={y} className={styles.skGrid} />
        ))}
        {CANDLES.map((c) => (
          <g key={c.x}>
            <line x1={c.x} x2={c.x} y1={c.mid - c.wick / 2} y2={c.mid + c.wick / 2} className={styles.skWick} />
            <rect x={c.x - 2.6} y={c.mid - c.body / 2} width="5.2" height={c.body} className={styles.skBody} />
          </g>
        ))}
      </svg>
      <div className={styles.skAxisY}>
        {[0, 1, 2, 3, 4, 5].map((i) => <Bone key={i} w="40px" h="0.55rem" />)}
      </div>
      <div className={styles.skAxisX}>
        {[0, 1, 2, 3, 4].map((i) => <Bone key={i} w="44px" h="0.55rem" />)}
      </div>
    </Skeleton>
  );
}

export function PriceSkeleton() {
  return (
    <Skeleton label="Loading price" className={styles.priceHeader}>
      <div className={styles.skRow}>
        <Bone w="48px" h="1.05rem" />
        <Bone w="112px" h="1.6rem" />
        <Bone w="120px" h="0.9rem" />
      </div>
      <div className={styles.skRow}>
        {[80, 70, 76, 84].map((w) => <Bone key={w} w={`${w}px`} h="0.6rem" />)}
      </div>
    </Skeleton>
  );
}

export function PortfolioSkeletonBody() {
  return (
    <Skeleton label="Loading portfolio">
      <div className={styles.pfSummary}>
        {['Equity', 'Day P/L', 'Cash', 'Buying power'].map((k, i) => (
          <div key={k} className={styles.pfStat}>
            <Bone w="64px" h="0.55rem" />
            <Bone w={i === 1 ? '124px' : '96px'} h="1.05rem" style={{ marginTop: '0.45rem' }} />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skTableRow}>
          {[48, 28, 64, 64, 76, 96].map((w) => <Bone key={w} w={`${w}px`} h="0.7rem" />)}
        </div>
      ))}
    </Skeleton>
  );
}
