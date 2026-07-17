import React, { useState } from 'react';
import LabCard from './LabCard';
import styles from './quiz.module.css';

/**
 * Multiple-choice quiz with instant feedback.
 *
 * <Quiz title="Check your understanding" questions={[
 *   { q: 'Question text?', options: ['A', 'B', 'C'], answer: 1, explain: 'Because…' },
 * ]} />
 */
export default function Quiz({ title = 'Check your understanding', questions = [] }) {
  const [picked, setPicked] = useState({}); // qIndex -> optionIndex

  const answered = Object.keys(picked).length;
  const correct = questions.reduce(
    (acc, q, i) => acc + (picked[i] === q.answer ? 1 : 0),
    0
  );
  const done = answered === questions.length;

  const pick = (qi, oi) => {
    // Lock the first choice so the score means something.
    if (picked[qi] !== undefined) return;
    setPicked((p) => ({ ...p, [qi]: oi }));
  };

  return (
    <LabCard badge="Quiz" title={title}>
      <div className={styles.progress}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${(answered / Math.max(questions.length, 1)) * 100}%` }}
          />
        </div>
        <span className={styles.progressText}>
          {answered}/{questions.length} answered
          {answered > 0 && ` · ${correct} correct`}
        </span>
      </div>

      {questions.map((q, qi) => {
        const chosen = picked[qi];
        return (
          <div key={qi} className={styles.question}>
            <div className={styles.qText}>
              <span className={styles.qNum}>{qi + 1}</span> {q.q}
            </div>
            <div className={styles.options}>
              {q.options.map((opt, oi) => {
                let cls = styles.option;
                if (chosen !== undefined) {
                  if (oi === q.answer) cls += ' ' + styles.correct;
                  else if (oi === chosen) cls += ' ' + styles.wrong;
                  else cls += ' ' + styles.disabled;
                }
                return (
                  <button key={oi} className={cls} onClick={() => pick(qi, oi)}>
                    <span className={styles.optLetter}>
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                    {chosen !== undefined && oi === q.answer && (
                      <span className={styles.mark}>✓</span>
                    )}
                    {chosen === oi && oi !== q.answer && (
                      <span className={styles.mark}>✗</span>
                    )}
                  </button>
                );
              })}
            </div>
            {chosen !== undefined && q.explain && (
              <div
                className={
                  styles.explain +
                  ' ' +
                  (chosen === q.answer ? styles.explainGood : styles.explainBad)
                }
              >
                {chosen === q.answer ? 'Correct! ' : 'Not quite. '}
                {q.explain}
              </div>
            )}
          </div>
        );
      })}

      {done && (
        <div className={styles.result}>
          <span>
            Score: <b>{correct}/{questions.length}</b>
            {correct === questions.length
              ? ' — perfect! 🎉'
              : correct >= questions.length / 2
                ? ' — nice work, review the misses above.'
                : ' — worth a re-read of this page.'}
          </span>
          <button className={styles.resetBtn} onClick={() => setPicked({})}>
            ↻ Try again
          </button>
        </div>
      )}
    </LabCard>
  );
}
