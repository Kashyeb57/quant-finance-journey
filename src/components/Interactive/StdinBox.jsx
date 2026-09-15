import React, { useId } from 'react';
import styles from './stdinbox.module.css';

/**
 * The answers a program's input() calls will read, one per line. Shown by the
 * Run controls whenever the code uses input(): Python in the browser can't
 * pause mid-run for typing, so answers are given before pressing Run.
 */
export default function StdinBox({ value, onChange, variant = 'panel' }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const rows = Math.min(Math.max((value || '').split('\n').length, 2), 8);
  return (
    <div className={`${styles.box} ${variant === 'attached' ? styles.attached : styles.panel}`}>
      <label htmlFor={id} className={styles.label}>
        Input
      </label>
      <span id={hintId} className={styles.hint}>
        one answer per line, read by each input() in order
      </span>
      <textarea
        id={id}
        className={styles.field}
        value={value}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-describedby={hintId}
        placeholder="type the answers here before pressing Run"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
