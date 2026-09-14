import React, { useMemo, useState } from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

/*
 * BookShelf — a grid of clickable book "covers".
 * Each book: { title, author, category, url }
 * Clicking a cover opens the PDF (GitHub's inline reader) in a new tab.
 */

const CATEGORY_ORDER = [
  'Core Textbooks',
  'Quant Interview Prep',
  'Probability, Puzzles & Math',
  'Markets & Trading Notes',
  'Programming & Computer Science',
];

export default function BookShelf({ books }) {
  const [active, setActive] = useState('All');

  const categories = useMemo(() => {
    const present = CATEGORY_ORDER.filter((c) => books.some((b) => b.category === c));
    // A category missing from CATEGORY_ORDER still gets a filter, after the
    // ordered ones, so a book can never be reachable only under "All".
    const unlisted = [...new Set(books.map((b) => b.category))].filter(
      (c) => c && !CATEGORY_ORDER.includes(c),
    );
    return ['All', ...present, ...unlisted];
  }, [books]);

  const shown = active === 'All' ? books : books.filter((b) => b.category === active);

  return (
    <div className={styles.shelf}>
      <div className={styles.filters}>
        {categories.map((c) => (
          <button
            key={c}
            className={`${styles.filter} ${active === c ? styles.filterActive : ''}`}
            onClick={() => setActive(c)}
          >
            {c}
            {c !== 'All' && (
              <span className={styles.count}>{books.filter((b) => b.category === c).length}</span>
            )}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        {shown.map((b) => (
          <Link
            key={b.url}
            className={styles.book}
            to={`/read?file=${encodeURIComponent(b.url)}&title=${encodeURIComponent(b.title)}`}
            data-cat={b.category}
            title={`Read “${b.title}” here on the site`}
          >
            <div className={styles.cover}>
              <span className={styles.spine} />
              <span className={styles.coverCat}>{b.shortCat || b.category}</span>
              <span className={styles.coverTitle}>{b.title}</span>
              <span className={styles.coverAuthor}>{b.author}</span>
              <span className={styles.read}>Read →</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
