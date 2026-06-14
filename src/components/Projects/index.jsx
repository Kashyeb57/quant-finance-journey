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
    title: 'Time and Attendance System (TAS) — CS 310 Team Project',
    status: 'Completed',
    description:
      'A Java-based Time and Attendance System that manages employee punch records, shift scheduling, and reporting for a manufacturing environment. Version 1 built the core model classes (Badge, Punch, Shift, Department, Employee), the punch-adjustment logic (shift start/stop snapping, grace periods, dock penalties, lunch and interval rounding), a Punch DAO for finding and creating punches by date or date range, absenteeism calculation, and JSON serialization of daily punch lists and pay-period totals. Version 2 added full Badge DAO CRUD, modular shift schedules with recurring and temporary per-day overrides (global and per-employee), granular JSON serialization, and a Report DAO with four reports: Badge Summary, Employee Summary, Hours Summary (regular and overtime per pay period), and a real-time Who’s In / Who’s Out attendance snapshot. The full suite of 75 JUnit tests passes, with generated Javadoc API documentation in the docs/ folder.',
    tags: ['Java 8+', 'MySQL', 'JDBC / DAO pattern', 'json-simple', 'JUnit 4'],
    links: [
      { label: 'GitHub Repository', url: 'https://github.com/Kashyeb57/Time-and-Attendance-System-CS-310' },
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
