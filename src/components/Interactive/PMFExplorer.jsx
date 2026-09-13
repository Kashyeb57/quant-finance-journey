import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { fmt } from './mathkit';

/*
 * PMFExplorer — one interactive SVG chart for the discrete distributions.
 *
 * kind = 'bernoulli' | 'binomial' | 'poisson' | 'discrete-uniform'
 * Draws the probability-mass bars, an optional cumulative (CDF) step, and a
 * mean / variance / std readout. Click a bar to read P(X = k) and P(X ≤ k).
 * Dependency-free (pure SVG), matches the site's --viz-* lab styling.
 */

const W = 640;
const H = 300;
const M = { t: 16, r: 16, b: 44, l: 44 };

// stable binomial coefficient via the multiplicative formula
function nCk(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
}
const binomPMF = (k, n, p) => nCk(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
function poissonPMF(k, lam) {
  // e^{-lam} lam^k / k!  in log space so it stays stable for larger k
  let logp = -lam + k * Math.log(lam);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

export default function PMFExplorer({
  kind = 'binomial',
  title,
  badge = 'Lab',
  showCDF: showCDF0 = false,
}) {
  const [p, setP] = useState(kind === 'bernoulli' ? 0.6 : 0.5);
  const [n, setN] = useState(10);
  const [lam, setLam] = useState(3);
  const [a, setA] = useState(1);
  const [b, setB] = useState(6);
  const [showCDF, setShowCDF] = useState(showCDF0);
  const [sel, setSel] = useState(null);

  const model = useMemo(() => {
    let ks = [];
    let pmf = [];
    let mean = 0;
    let variance = 0;
    let formula = '';

    if (kind === 'bernoulli') {
      ks = [0, 1];
      pmf = [1 - p, p];
      mean = p;
      variance = p * (1 - p);
      formula = 'P(k) = pᵏ (1−p)¹⁻ᵏ   →   P(0)=q,  P(1)=p';
    } else if (kind === 'binomial') {
      ks = Array.from({ length: n + 1 }, (_, k) => k);
      pmf = ks.map((k) => binomPMF(k, n, p));
      mean = n * p;
      variance = n * p * (1 - p);
      formula = 'P(k) = ⁿCₖ pᵏ (1−p)ⁿ⁻ᵏ';
    } else if (kind === 'poisson') {
      const kmax = Math.min(40, Math.max(9, Math.ceil(lam + 4 * Math.sqrt(lam))));
      ks = Array.from({ length: kmax + 1 }, (_, k) => k);
      pmf = ks.map((k) => poissonPMF(k, lam));
      mean = lam;
      variance = lam;
      formula = 'P(X=k) = e^(−λ) · λᵏ / k!';
    } else {
      // discrete-uniform on {a, …, b}
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const count = hi - lo + 1;
      ks = Array.from({ length: count }, (_, i) => lo + i);
      pmf = ks.map(() => 1 / count);
      mean = (lo + hi) / 2;
      variance = (count * count - 1) / 12;
      formula = `P(k) = 1/n = 1/${count}   (n = b−a+1)`;
    }

    const cdf = [];
    let run = 0;
    for (const v of pmf) {
      run += v;
      cdf.push(run);
    }
    return { ks, pmf, cdf, mean, variance, formula };
  }, [kind, p, n, lam, a, b]);

  const { ks, pmf, cdf, mean, variance, formula } = model;
  const plotL = M.l;
  const plotR = W - M.r;
  const plotT = M.t;
  const plotB = H - M.b;
  const count = ks.length;
  const band = (plotR - plotL) / count;
  const barW = Math.min(band * 0.72, 48);
  const xc = (i) => plotL + band * (i + 0.5);
  const yMax = Math.max(...pmf) * 1.16 || 1;
  const yBar = (v) => plotB - (v / yMax) * (plotB - plotT);
  const yCdf = (v) => plotB - v * (plotB - plotT);

  // sparse labels when there are many bars
  const labelEvery = count <= 16 ? 1 : count <= 26 ? 2 : Math.ceil(count / 14);

  // CDF step path
  let cdfPath = '';
  for (let i = 0; i < count; i++) {
    const x0 = xc(i) - band / 2;
    const x1 = xc(i) + band / 2;
    const y = yCdf(cdf[i]);
    cdfPath += `${i === 0 ? 'M' : 'L'}${x0.toFixed(1)},${y.toFixed(1)} L${x1.toFixed(1)},${y.toFixed(1)} `;
  }

  const selPmf = sel != null ? pmf[sel] : null;
  const selCdf = sel != null ? cdf[sel] : null;

  const control = (label, value, set, min, max, step, show) => (
    <div className={styles.control}>
      <label>
        {label} <b>{show}</b>
      </label>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  const heading =
    title ||
    (kind === 'bernoulli'
      ? 'Bernoulli PMF'
      : kind === 'binomial'
      ? 'Binomial PMF'
      : kind === 'poisson'
      ? 'Poisson PMF'
      : 'Discrete uniform PMF');

  return (
    <LabCard badge={badge} title={heading}>
      <div className={styles.controls}>
        {(kind === 'bernoulli' || kind === 'binomial') &&
          control('Success prob p', p, setP, 0.01, 0.99, 0.01, fmt(p, 2))}
        {kind === 'binomial' && control('Trials n', n, setN, 1, 40, 1, n)}
        {kind === 'poisson' && control('Rate λ', lam, setLam, 0.2, 18, 0.2, fmt(lam, 1))}
        {kind === 'discrete-uniform' && control('Min a', a, setA, 0, 10, 1, Math.min(a, b))}
        {kind === 'discrete-uniform' && control('Max b', b, setB, 1, 12, 1, Math.max(a, b))}
        <div className={styles.control}>
          <label>Cumulative (CDF)</label>
          <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={showCDF} onChange={(e) => setShowCDF(e.target.checked)} /> overlay P(X ≤ k)
          </label>
        </div>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Mean E[X]</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)' }}>{fmt(mean, 3)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Variance σ²</div>
          <div className={styles.statValue}>{fmt(variance, 3)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Std dev σ</div>
          <div className={styles.statValue}>{fmt(Math.sqrt(variance), 3)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>{sel != null ? `P(X = ${ks[sel]})` : 'Click a bar'}</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s4)' }}>
            {sel != null ? `${(selPmf * 100).toFixed(2)}%` : '—'}
          </div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${heading}: probability of each outcome k`}>
          {/* y grid (probability) */}
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <g key={'g' + g}>
              <line x1={plotL} x2={plotR} y1={yBar(g * yMax)} y2={yBar(g * yMax)} stroke="var(--viz-axis)" strokeWidth={0.6} opacity={0.4} />
              <text x={plotL - 6} y={yBar(g * yMax) + 4} textAnchor="end" fontSize={10} fill="var(--viz-muted)">
                {fmt(g * yMax, 2)}
              </text>
            </g>
          ))}

          {/* bars */}
          {pmf.map((v, i) => (
            <rect
              key={'bar' + i}
              x={xc(i) - barW / 2}
              y={yBar(v)}
              width={barW}
              height={plotB - yBar(v)}
              fill={sel === i ? 'var(--viz-s4)' : 'var(--viz-s1)'}
              opacity={sel === null || sel === i ? 0.9 : 0.5}
              style={{ cursor: 'pointer' }}
              onClick={() => setSel(sel === i ? null : i)}
            >
              <title>{`P(X=${ks[i]}) = ${(v * 100).toFixed(2)}%`}</title>
            </rect>
          ))}

          {/* x axis + labels */}
          <line x1={plotL} x2={plotR} y1={plotB} y2={plotB} stroke="var(--viz-axis)" strokeWidth={1.5} />
          {ks.map((k, i) =>
            i % labelEvery === 0 ? (
              <text key={'xl' + i} x={xc(i)} y={plotB + 16} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
                {k}
              </text>
            ) : null
          )}
          <text x={(plotL + plotR) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
            k  (number of successes / events)
          </text>

          {/* CDF overlay */}
          {showCDF && (
            <>
              <path d={cdfPath} fill="none" stroke="var(--viz-s4)" strokeWidth={2} strokeDasharray="5 3" opacity={0.9} />
              {ks.map((k, i) =>
                i % labelEvery === 0 ? (
                  <circle key={'cd' + i} cx={xc(i)} cy={yCdf(cdf[i])} r={2.4} fill="var(--viz-s4)" />
                ) : null
              )}
            </>
          )}

          {/* mean marker */}
          {mean >= ks[0] && mean <= ks[count - 1] && (
            <line
              x1={plotL + band * (mean - ks[0] + 0.5)}
              x2={plotL + band * (mean - ks[0] + 0.5)}
              y1={plotT}
              y2={plotB}
              stroke="var(--viz-muted)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}
        </svg>
      </div>

      <p className={styles.hint}>
        <b>{formula}</b>
        {sel != null && (
          <>
            {'  •  '}
            selected: P(X={ks[sel]}) = {(selPmf * 100).toFixed(2)}%, and P(X ≤ {ks[sel]}) = {(selCdf * 100).toFixed(2)}%
          </>
        )}
      </p>
    </LabCard>
  );
}
