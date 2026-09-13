import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { fmt } from './mathkit';

// Natural-frequency visualizer for Bayes' theorem. A 10x10 grid of 100 people
// makes the base-rate trap concrete: even a very accurate test gives a low
// P(has it | tested positive) when the condition is rare.
//   P(A|B) = P(A)·P(B|A) / [ P(A)·P(B|A) + P(¬A)·P(B|¬A) ]
export default function BayesTheoremLab({
  title = "Bayes' theorem — the base-rate trap",
  badge = 'Lab',
}) {
  const [prior, setPrior] = useState(0.05); // P(A): base rate
  const [sens, setSens] = useState(0.9); // P(B|A): true-positive rate (sensitivity)
  const [fpr, setFpr] = useState(0.1); // P(B|¬A): false-positive rate

  const { posterior, pB, cells, counts } = useMemo(() => {
    const N = 100;
    // exact expected counts, then round to whole people for the grid
    const have = Math.round(prior * N);
    const notHave = N - have;
    const truePos = Math.round(have * sens);
    const falseNeg = have - truePos;
    const falsePos = Math.round(notHave * fpr);
    const trueNeg = notHave - falsePos;

    const pB = prior * sens + (1 - prior) * fpr;
    const posterior = pB > 0 ? (prior * sens) / pB : 0;

    // build 100 cells in reading order: TP, FN, FP, TN
    const cells = [];
    for (let i = 0; i < truePos; i++) cells.push('tp');
    for (let i = 0; i < falseNeg; i++) cells.push('fn');
    for (let i = 0; i < falsePos; i++) cells.push('fp');
    for (let i = 0; i < trueNeg; i++) cells.push('tn');
    while (cells.length < N) cells.push('tn');

    return {
      posterior,
      pB,
      cells: cells.slice(0, N),
      counts: { truePos, falseNeg, falsePos, trueNeg },
    };
  }, [prior, sens, fpr]);

  const color = {
    tp: 'var(--viz-s4)', // has it & positive  (red, filled)
    fn: 'var(--viz-muted)', // has it & missed
    fp: 'var(--viz-s3)', // healthy & false alarm (amber)
    tn: 'var(--viz-grid)', // healthy & negative
  };

  const gap = 26;
  const r = 9;
  const pad = 8;

  const slider = (label, value, set, min, max, step, show) => (
    <div className={styles.control}>
      <label>
        {label} <b>{show}</b>
      </label>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  const positives = counts.truePos + counts.falsePos;

  return (
    <LabCard badge={badge} title={title}>
      <div className={styles.controls}>
        {slider('Base rate  P(A)', prior, setPrior, 0.01, 0.5, 0.01, (prior * 100).toFixed(0) + '%')}
        {slider('Sensitivity  P(B|A)', sens, setSens, 0.5, 1, 0.01, (sens * 100).toFixed(0) + '%')}
        {slider('False-positive  P(B|¬A)', fpr, setFpr, 0.0, 0.3, 0.01, (fpr * 100).toFixed(0) + '%')}
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Test positive (of 100)</div>
          <div className={styles.statValue}>{positives}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>…who truly have it</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s4)' }}>{counts.truePos}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Posterior P(A | tested +)</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)', fontSize: '1.35rem' }}>
            {(posterior * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${pad * 2 + gap * 10} ${pad * 2 + gap * 10}`} role="img" aria-label="A grid of 100 people colored by whether they have the condition and how the test classified them">
          {cells.map((k, i) => {
            const col = i % 10;
            const row = Math.floor(i / 10);
            return (
              <circle
                key={i}
                cx={pad + col * gap + gap / 2}
                cy={pad + row * gap + gap / 2}
                r={r}
                fill={color[k]}
                opacity={k === 'tn' ? 0.5 : 0.9}
                stroke={k === 'fn' ? 'var(--viz-s4)' : 'none'}
                strokeWidth={k === 'fn' ? 1.5 : 0}
              />
            );
          })}
        </svg>
      </div>

      <div className={styles.legend}>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-s4)' }} />has it &amp; tests + (true positive)</span>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-s3)' }} />healthy &amp; tests + (false alarm)</span>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-muted)' }} />has it &amp; missed</span>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-grid)' }} />healthy &amp; tests −</span>
      </div>

      <p className={styles.hint}>
        Set the base rate to <b>5%</b>, sensitivity <b>90%</b>, false-positive <b>10%</b>: a positive result still means
        only about a <b>32%</b> chance of actually having it — the red dots are swamped by the amber false alarms.
        That gap between "the test is 90% accurate" and "I'm 90% likely to have it" <b>is</b> Bayes' theorem, and it's why
        the prior P(A) can't be ignored.
      </p>
    </LabCard>
  );
}
