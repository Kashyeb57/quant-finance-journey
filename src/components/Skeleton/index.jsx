import React from 'react';
import styles from './styles.module.css';

/*
 * Loading placeholders shaped like the content they stand in for, so a panel
 * answers at once and nothing jumps when the data lands. Bones are neutral
 * hairline-white bars on the graphite surface with a slow pulse (still for
 * reduced motion). Screen readers hear the one status label; the shapes are
 * hidden from them.
 */

export function Bone({ w = '100%', h = '0.75rem', round = false, className = '', style }) {
  return (
    <span
      className={`${styles.bone} ${round ? styles.round : ''} ${className}`}
      style={{ width: w, height: h, ...style }}
      aria-hidden="true"
    />
  );
}

export function Skeleton({ label, className = '', children }) {
  return (
    <div className={`${styles.skeleton} ${className}`} role="status" aria-busy="true">
      <span className={styles.srOnly}>{label}</span>
      {children}
    </div>
  );
}
