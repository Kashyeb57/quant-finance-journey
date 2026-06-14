import React from 'react';
import styles from './styles.module.css';

/*
 * Tools — software and tools I use on the quant journey.
 * To add a tool, copy an object in the TOOLS array and edit:
 *   name        — tool name
 *   category    — optional short label (e.g. 'Publishing', 'IDE', 'Data')
 *   description — what it is and how you use it
 *   url         — link to the tool
 */

const TOOLS = [
  {
    name: 'Jupyter Book',
    category: 'Publishing',
    description:
      'Builds beautiful, publication-quality books and documents from computational material — Jupyter notebooks and Markdown combined into a structured, shareable site or PDF.',
    url: 'https://jupyterbook.org/',
  },
];

export default function Tools() {
  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        The tools and software I use across my quant work — for analysis, writing,
        publishing, and building. Updated as I pick up new ones.
      </p>
      <div className={styles.grid}>
        {TOOLS.map((t) => (
          <div key={t.name} className={styles.card}>
            <h2 className={styles.name}>{t.name}</h2>
            {t.category && <div className={styles.category}>{t.category}</div>}
            <p className={styles.desc}>{t.description}</p>
            {t.url && (
              <a className={styles.link} href={t.url} target="_blank" rel="noreferrer">
                Visit ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
