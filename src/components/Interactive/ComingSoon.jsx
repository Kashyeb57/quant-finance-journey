import React from 'react';
import Link from '@docusaurus/Link';
import styles from './comingsoon.module.css';

/*
 * A professional "in progress" panel for topics whose deep-dive notes aren't
 * written yet. Instead of a bare "coming soon" line, it tells the reader
 * exactly what the finished page will cover and where to learn the topic in
 * the meantime — so the page is useful even before it's complete.
 *
 * Props:
 *   covers    — string[] of subtopics the finished page will cover
 *   meanwhile — [{ label, to }] links to related live pages / resources
 *   eta       — optional short status string (e.g. "Next in the roadmap")
 */
export default function ComingSoon({ covers = [], meanwhile = [], eta }) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.badge}>◐ In progress</span>
        {eta && <span className={styles.eta}>{eta}</span>}
      </div>

      <p className={styles.lead}>
        The full notes for this topic are still being written. Here&rsquo;s what&rsquo;s planned —
        and where to learn it in the meantime.
      </p>

      {covers.length > 0 && (
        <div className={styles.block}>
          <div className={styles.blockTitle}>What this page will cover</div>
          <ul className={styles.covers}>
            {covers.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {meanwhile.length > 0 && (
        <div className={styles.block}>
          <div className={styles.blockTitle}>In the meantime</div>
          <div className={styles.links}>
            {meanwhile.map((m) =>
              m.to.startsWith('http') ? (
                <a key={m.to} href={m.to} target="_blank" rel="noreferrer" className={styles.link}>
                  {m.label} ↗
                </a>
              ) : (
                <Link key={m.to} to={m.to} className={styles.link}>
                  {m.label} →
                </Link>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
