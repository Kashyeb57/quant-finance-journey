import React, { useEffect, useState } from 'react';
import OriginalFooter from '@theme-original/DocItem/Footer';
import { useLocation } from '@docusaurus/router';
import styles from './styles.module.css';

const KEY = 'qf-progress';

function readProgress() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

// Adds a localStorage-backed "mark as complete" tracker to every doc page.
export default function Footer(props) {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const map = readProgress();
    setDone(!!map[pathname]);
    setCount(Object.values(map).filter(Boolean).length);
    setReady(true);
  }, [pathname]);

  const toggle = () => {
    const map = readProgress();
    if (map[pathname]) delete map[pathname];
    else map[pathname] = true;
    window.localStorage.setItem(KEY, JSON.stringify(map));
    setDone(!!map[pathname]);
    setCount(Object.values(map).filter(Boolean).length);
  };

  return (
    <>
      <div className={styles.tracker}>
        <button
          className={`${styles.btn} ${done ? styles.btnDone : ''}`}
          onClick={toggle}
          disabled={!ready}
        >
          {done ? '✓ Completed' : 'Mark as complete'}
        </button>
        <span className={styles.count}>
          {ready && count > 0 && (
            <>
              📚 {count} page{count === 1 ? '' : 's'} completed so far — keep going!
            </>
          )}
        </span>
      </div>
      <OriginalFooter {...props} />
    </>
  );
}
