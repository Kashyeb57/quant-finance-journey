import React from 'react';
import styles from './lab.module.css';

// Chrome shared by every interactive widget: bordered card, badge, title.
export default function LabCard({ badge = 'Interactive', title, children }) {
  return (
    <div className={styles.lab}>
      <div className={styles.labHeader}>
        <span className={styles.labBadge}>{badge}</span>
        <span>{title}</span>
      </div>
      <div className={styles.labBody}>{children}</div>
    </div>
  );
}
