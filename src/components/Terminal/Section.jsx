import React from 'react';
import styles from './styles.module.css';

/*
 * One movable, collapsible block of the Terminal page (chart & news, options,
 * volatility, risk, market, portfolio). The bar on top moves it up or down and
 * collapses it to just the bar. Its content stays mounted while collapsed, so
 * the chart keeps its state; sections that fetch data pause while closed.
 */
export default function Section({ id, title, index, count, open, onToggle, onMove, children }) {
  return (
    <div className={`${styles.section} ${open ? '' : styles.sectionClosed}`} data-section={id}>
      <div className={styles.sectionHead}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={onToggle}
          aria-expanded={open}
          title={open ? `Collapse ${title}` : `Expand ${title}`}
        >
          <span className={styles.sectionChevron} aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className={styles.sectionTitle}>{title}</span>
        </button>
        <span className={styles.sectionTools}>
          <button type="button" className={styles.sectionTool} onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${title} up`} title="Move up">↑</button>
          <button type="button" className={styles.sectionTool} onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${title} down`} title="Move down">↓</button>
          <button type="button" className={styles.sectionTool} onClick={onToggle} aria-label={open ? `Collapse ${title}` : `Expand ${title}`} title={open ? 'Collapse' : 'Expand'}>{open ? '−' : '+'}</button>
        </span>
      </div>
      <div className={styles.sectionBody} hidden={!open}>{children}</div>
    </div>
  );
}
