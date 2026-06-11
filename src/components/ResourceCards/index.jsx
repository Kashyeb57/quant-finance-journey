import React from 'react';
import styles from './styles.module.css';

/*
 * Presentational card grid.
 * sections: [{ title, groups: [{ group?, items: [{ label, url? }] }] }]
 * If an item has a url it renders as a link, otherwise plain text.
 */
export default function ResourceCards({ intro, sections }) {
  return (
    <div className={styles.wrap}>
      {intro && <p className={styles.intro}>{intro}</p>}
      <div className={styles.grid}>
        {sections.map((section) => (
          <div key={section.title} className={styles.card}>
            <div className={styles.cardTitle}>{section.title}</div>
            {section.groups.map((g, gi) => (
              <div key={gi} className={styles.group}>
                {g.group && <div className={styles.groupName}>{g.group}</div>}
                <ul className={styles.list}>
                  {g.items.map((item, ii) => (
                    <li key={ii} className={styles.item}>
                      <span className={styles.bullet}>▸</span>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer">{item.label}</a>
                      ) : (
                        <span>{item.label}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
