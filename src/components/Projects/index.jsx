import React from 'react';
import styles from './styles.module.css';

/*
 * Projects — describe your quant projects here.
 * To add a project, copy one object in the PROJECTS array below and edit its fields:
 *   title       — project name
 *   status      — e.g. 'Completed', 'In Progress', 'Planned'
 *   description — a full paragraph (or several) describing what it does
 *   tags        — technologies / topics used
 *   links       — optional [{ label, url }] (GitHub repo, live demo, write-up)
 */

const PROJECTS = [
  {
    title: 'Example Project — Black-Scholes Option Pricer',
    status: 'In Progress',
    description:
      'Replace this with a full description of your project: the problem it solves, the approach and models used, the data, the results, and what you learned. You can write multiple sentences here — this card is your space to explain the project in depth.',
    tags: ['Python', 'NumPy', 'Black-Scholes', 'Monte Carlo'],
    links: [
      { label: 'GitHub', url: 'https://github.com/Kashyeb57' },
    ],
  },
];

export default function Projects() {
  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        A collection of my quantitative-finance projects — models, backtests, tools, and
        experiments. Each entry describes the problem, the approach, and the outcome.
      </p>
      <div className={styles.list}>
        {PROJECTS.map((p, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.head}>
              <h2 className={styles.title}>{p.title}</h2>
              {p.status && <span className={styles.status}>{p.status}</span>}
            </div>
            <p className={styles.desc}>{p.description}</p>
            {p.tags && p.tags.length > 0 && (
              <div className={styles.tags}>
                {p.tags.map((t) => (
                  <span key={t} className={styles.tag}>{t}</span>
                ))}
              </div>
            )}
            {p.links && p.links.length > 0 && (
              <div className={styles.links}>
                {p.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
