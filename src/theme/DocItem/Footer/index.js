import React, { useEffect, useState } from 'react';
import OriginalFooter from '@theme-original/DocItem/Footer';
import { useLocation } from '@docusaurus/router';
import useGlobalData from '@docusaurus/useGlobalData';
import { QUIZ_KEY, QUIZ_EVENT } from '@site/src/components/Interactive/Quiz';
import styles from './styles.module.css';

const KEY = 'qf-progress';

function readJson(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

// Per-page study tracker under every doc: "read" is self-marked, the quiz score
// is recorded by the quiz itself, so the two are never confused. Outline pages
// (still a <ComingSoon> placeholder) get no tracker: there is nothing to finish.
export default function Footer(props) {
  const { pathname } = useLocation();
  const path = pathname.replace(/\/$/, '');
  const stats = useGlobalData()['content-stats'];
  const drafts = (stats && stats.default && stats.default.drafts) || [];
  const isOutline = drafts.includes(path);

  const [ready, setReady] = useState(false);
  const [read, setRead] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [quiz, setQuiz] = useState(null); // best { correct, total } for this page

  useEffect(() => {
    const load = () => {
      const map = readJson(KEY);
      setRead(!!map[pathname]);
      setReadCount(Object.values(map).filter(Boolean).length);
      const scores = readJson(QUIZ_KEY);
      const mine = Object.entries(scores).filter(([id]) => id.startsWith(`${path}|`)).map(([, v]) => v);
      setQuiz(mine.length ? mine.reduce((a, b) => ({ correct: a.correct + b.correct, total: a.total + b.total })) : null);
      setReady(true);
    };
    load();
    window.addEventListener(QUIZ_EVENT, load);
    return () => window.removeEventListener(QUIZ_EVENT, load);
  }, [pathname, path]);

  const toggle = () => {
    const map = readJson(KEY);
    if (map[pathname]) delete map[pathname];
    else map[pathname] = true;
    try { window.localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* storage blocked */ }
    setRead(!!map[pathname]);
    setReadCount(Object.values(map).filter(Boolean).length);
  };

  if (isOutline) {
    return (
      <>
        <div className={styles.tracker}>
          <span className={styles.count}>
            This topic is still an outline, so there&rsquo;s nothing to mark as read yet.
          </span>
        </div>
        <OriginalFooter {...props} />
      </>
    );
  }

  return (
    <>
      <div className={styles.tracker}>
        <button
          className={`${styles.btn} ${read ? styles.btnDone : ''}`}
          onClick={toggle}
          disabled={!ready}
          aria-pressed={read}
        >
          {read ? '✓ Read' : 'Mark as read'}
        </button>
        {ready && quiz && (
          <span className={styles.quizScore}>
            Quiz best: <b>{quiz.correct}/{quiz.total}</b>
          </span>
        )}
        <span className={styles.count}>
          {ready && readCount > 0 && `${readCount} page${readCount === 1 ? '' : 's'} read · `}
          Saved in this browser only.
        </span>
      </div>
      <OriginalFooter {...props} />
    </>
  );
}
