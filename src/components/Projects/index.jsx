import React from 'react';
import styles from './styles.module.css';

/*
 * Projects — describe your quant / software projects here.
 * Each project supports:
 *   title       — project name
 *   status      — 'Completed' | 'In Progress' | 'Planned'
 *   overview    — one or more intro paragraphs (string or string[])
 *   sections    — [{ heading, items: [] }] grouped feature/detail lists
 *   tags        — technologies / topics
 *   links       — [{ label, url }] (repo, demo, write-up)
 */

const PROJECTS = [
  {
    title: 'Time and Attendance System (TAS) — CS 310 Team Project',
    status: 'Completed',
    overview: [
      'Built for the CS 310 Software Engineering course, TAS is a Java application that models a real manufacturing plant’s time-and-attendance workflow end to end — from raw badge punches all the way to finished payroll figures and management reports. It connects to a MySQL database through a clean DAO layer, runs every punch through a configurable rules engine, and exposes its results as structured JSON.',
      'The system was developed across two graded milestones (Version 1 and Version 2) over ~90 commits, and ships with a 75-case JUnit 4 test suite and full generated Javadoc.',
    ],
    sections: [
      {
        heading: 'Domain Model',
        items: [
          'Badge — the employee identifier scanned at the clock',
          'Punch — a single clock-in / clock-out event with timestamp and type',
          'Shift — work schedule defining start/stop times, lunch, and rounding rules',
          'Department & Employee — organizational structure and staff records',
        ],
      },
      {
        heading: 'Punch-Adjustment Rules Engine',
        items: [
          'Shift start/stop snapping to scheduled times',
          'Grace-period and dock-penalty handling for early/late punches',
          'Automatic lunch deduction and interval rounding',
          'Each adjusted punch is tagged with the rule that changed it',
        ],
      },
      {
        heading: 'Data Access (DAO Layer)',
        items: [
          'Punch DAO — find, create, and list punches by date or date range',
          'Badge DAO — full create / update / delete (CRUD)',
          'Shift DAO — modular schedules with recurring & temporary per-day overrides (global and per-employee)',
          'Absenteeism calculated and persisted back to the database',
        ],
      },
      {
        heading: 'Reporting (Version 2)',
        items: [
          'Badge Summary — every employee with badge, department, and type',
          'Employee Summary — detailed listing grouped by department',
          'Hours Summary — regular and overtime hours per employee per pay period',
          'Who’s In / Who’s Out — real-time attendance snapshot',
        ],
      },
      {
        heading: 'Engineering Practices',
        items: [
          'Layered architecture: model → DAO → business logic → JSON output',
          'json-simple serialization for punches, schedules, and report payloads',
          '75 JUnit 4 tests, all passing',
          'Generated Javadoc API documentation in the docs/ folder',
          'Team project managed with Git over ~90 commits',
        ],
      },
    ],
    tags: ['Java 8+', 'MySQL', 'JDBC / DAO pattern', 'json-simple', 'JUnit 4', 'Javadoc', 'Git'],
    links: [
      { label: 'GitHub Repository', url: 'https://github.com/Kashyeb57/Time-and-Attendance-System-CS-310' },
    ],
  },
];

function toParagraphs(overview) {
  if (Array.isArray(overview)) return overview;
  return [overview];
}

export default function Projects() {
  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        A collection of my quantitative-finance and software projects — models, systems,
        tools, and experiments. Each entry breaks down the problem, the approach, and the outcome.
      </p>
      <div className={styles.list}>
        {PROJECTS.map((p, i) => (
          <div key={i} className={styles.card}>
            <div className={styles.head}>
              <h2 className={styles.title}>{p.title}</h2>
              {p.status && <span className={styles.status}>{p.status}</span>}
            </div>

            {p.overview &&
              toParagraphs(p.overview).map((para, pi) => (
                <p key={pi} className={styles.desc}>{para}</p>
              ))}

            {p.sections &&
              p.sections.map((sec) => (
                <div key={sec.heading} className={styles.section}>
                  <h3 className={styles.sectionHeading}>{sec.heading}</h3>
                  <ul className={styles.featureList}>
                    {sec.items.map((it, ii) => (
                      <li key={ii}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}

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
