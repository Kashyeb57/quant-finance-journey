import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, scaleLinear, linePath, normPDF, randn, fmt } from './mathkit';

/*
 * CLTLab — the Central Limit Theorem, seen.
 *
 * Pick a decidedly non-normal population (uniform, exponential, bimodal),
 * a sample size n, and draw many samples. The histogram of the SAMPLE MEANS
 * is drawn next to the theoretical normal N(μ, σ/√n). As you push n up, the
 * histogram snaps onto the bell — no matter how un-bell-shaped the population.
 */

const W = 640;
const Hp = 150; // population panel height
const Hs = 210; // sampling panel height
const M = { t: 14, r: 16, b: 30, l: 20 };
const NSAMPLES = 1600;

// population samplers (each returns one draw)
const POPS = {
  uniform: { label: 'Uniform', draw: () => Math.random() },
  exponential: { label: 'Exponential (skewed)', draw: () => -Math.log(1 - Math.random()) },
  bimodal: {
    label: 'Bimodal (two peaks)',
    draw: () => (Math.random() < 0.5 ? 0.25 : 0.75) + 0.06 * randn(),
  },
};

function histogram(data, dom, bins) {
  const [a, b] = dom;
  const w = (b - a) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of data) {
    let k = Math.floor((v - a) / w);
    if (k < 0) k = 0;
    if (k >= bins) k = bins - 1;
    counts[k]++;
  }
  const area = data.length * w || 1;
  return counts.map((c, i) => ({ x0: a + i * w, x1: a + (i + 1) * w, density: c / area, count: c }));
}

function quantile(sorted, q) {
  const i = Math.max(0, Math.min(sorted.length - 1, Math.floor(q * sorted.length)));
  return sorted[i];
}

export default function CLTLab() {
  const [pop, setPop] = useState('exponential');
  const [n, setN] = useState(30);
  const [nonce, setNonce] = useState(0);

  const model = useMemo(() => {
    const draw = POPS[pop].draw;

    // population reference pool → μ, σ, and a shape to plot
    const pool = Array.from({ length: 20000 }, draw);
    const mu = pool.reduce((s, v) => s + v, 0) / pool.length;
    const varp = pool.reduce((s, v) => s + (v - mu) ** 2, 0) / pool.length;
    const sigma = Math.sqrt(varp);
    const sortedPool = [...pool].sort((a, b) => a - b);
    const popDom = [quantile(sortedPool, 0.005), quantile(sortedPool, 0.995)];
    const popHist = histogram(pool, popDom, 34);

    // sampling distribution of the mean
    const means = new Array(NSAMPLES);
    for (let s = 0; s < NSAMPLES; s++) {
      let acc = 0;
      for (let i = 0; i < n; i++) acc += draw();
      means[s] = acc / n;
    }
    const mBar = means.reduce((s, v) => s + v, 0) / means.length;
    const mVar = means.reduce((s, v) => s + (v - mBar) ** 2, 0) / means.length;
    const mStd = Math.sqrt(mVar);
    const seTheory = sigma / Math.sqrt(n); // CLT: σ/√n

    const half = Math.max(4 * seTheory, 1e-6);
    const meanDom = [mu - half, mu + half];
    const meanHist = histogram(means, meanDom, 30);

    return { mu, sigma, popHist, popDom, means, mBar, mStd, seTheory, meanDom, meanHist };
  }, [pop, n, nonce]);

  const { mu, sigma, popHist, popDom, mBar, mStd, seTheory, meanDom, meanHist } = model;

  // population panel scales
  const pxs = scaleLinear(popDom, [M.l, W - M.r]);
  const pMaxD = Math.max(...popHist.map((b) => b.density)) * 1.1 || 1;
  const pys = scaleLinear([0, pMaxD], [Hp - M.b, M.t]);

  // sampling panel scales
  const sxs = scaleLinear(meanDom, [M.l, W - M.r]);
  const normPeak = normPDF(mu, mu, seTheory);
  const sMaxD = Math.max(normPeak, ...meanHist.map((b) => b.density)) * 1.12 || 1;
  const sys = scaleLinear([0, sMaxD], [Hs - M.b, M.t]);
  const normCurve = linspace(meanDom[0], meanDom[1], 160).map((x) => [sxs(x), sys(normPDF(x, mu, seTheory))]);

  return (
    <LabCard badge="Lab" title="Central Limit Theorem — watch the mean go normal">
      <div className={styles.controls}>
        <div className={styles.control}>
          <label>Population shape</label>
          <select aria-label="Population shape" value={pop} onChange={(e) => setPop(e.target.value)}>
            {Object.entries(POPS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.control}>
          <label>Sample size n <b>{n}</b></label>
          <input type="range" aria-label="Sample size n" min={1} max={50} step={1} value={n} onChange={(e) => setN(+e.target.value)} />
        </div>
        <div className={styles.control}>
          <label>Fresh draw</label>
          <button
            type="button"
            onClick={() => setNonce((x) => x + 1)}
            style={{
              cursor: 'pointer',
              padding: '0.35rem 0.7rem',
              borderRadius: 6,
              border: '1px solid var(--viz-axis)',
              background: 'var(--viz-s1)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            ↻ Resample
          </button>
        </div>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Population μ</div>
          <div className={styles.statValue}>{fmt(mu, 3)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Population σ</div>
          <div className={styles.statValue}>{fmt(sigma, 3)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>σ/√n (theory)</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s4)' }}>{fmt(seTheory, 3)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>std of the means</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)' }}>{fmt(mStd, 3)}</div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${Hp}`} role="img" aria-label="Population distribution (not necessarily normal)">
          <text x={M.l} y={11} fontSize={11} fontWeight={700} fill="var(--viz-muted)">
            1 · The population (each raw draw) — {POPS[pop].label}
          </text>
          {popHist.map((b, i) => (
            <rect
              key={i}
              x={pxs(b.x0) + 0.5}
              y={pys(b.density)}
              width={Math.max(0.5, pxs(b.x1) - pxs(b.x0) - 1)}
              height={Hp - M.b - pys(b.density)}
              fill="var(--viz-s2)"
              opacity={0.75}
            />
          ))}
          <line x1={M.l} x2={W - M.r} y1={Hp - M.b} y2={Hp - M.b} stroke="var(--viz-axis)" strokeWidth={1.2} />
        </svg>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${Hs}`} role="img" aria-label="Sampling distribution of the mean with the theoretical normal overlaid">
          <text x={M.l} y={11} fontSize={11} fontWeight={700} fill="var(--viz-muted)">
            2 · Distribution of the sample mean x̄ (n = {n}) — dashed = N(μ, σ/√n)
          </text>
          {meanHist.map((b, i) => (
            <rect
              key={i}
              x={sxs(b.x0) + 0.5}
              y={sys(b.density)}
              width={Math.max(0.5, sxs(b.x1) - sxs(b.x0) - 1)}
              height={Hs - M.b - sys(b.density)}
              fill="var(--viz-s1)"
              opacity={0.72}
            />
          ))}
          <path d={linePath(normCurve)} fill="none" stroke="var(--viz-s4)" strokeWidth={2.5} strokeDasharray="6 3" />
          <line x1={sxs(mu)} x2={sxs(mu)} y1={M.t} y2={Hs - M.b} stroke="var(--viz-muted)" strokeWidth={1} strokeDasharray="2 3" />
          <text x={sxs(mu)} y={Hs - M.b + 16} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">μ = {fmt(mu, 2)}</text>
          <line x1={M.l} x2={W - M.r} y1={Hs - M.b} y2={Hs - M.b} stroke="var(--viz-axis)" strokeWidth={1.2} />
        </svg>
      </div>

      <p className={styles.hint}>
        Drag <b>n</b> from 1 upward. At n=1 the bottom chart just mirrors the (often lopsided) population; by <b>n ≥ 30</b> it
        locks onto the dashed bell — <b>whatever</b> the population looked like. Notice the two spreads agree: the histogram's
        std ≈ σ/√n. Hit <b>Resample</b> to confirm it isn't a fluke of one random draw.
      </p>
    </LabCard>
  );
}
