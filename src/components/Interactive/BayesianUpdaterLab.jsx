import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, scaleLinear, linePath, niceTicks, normPDF, fmt } from './mathkit';

const W = 640;
const H = 300;
const M = { t: 18, r: 16, b: 38, l: 20 };

/*
 * Normal–normal conjugate updating for the mean daily return μ (in % per day).
 * Prior N(mu0, tau²), likelihood of n days with sample mean xbar and known
 * daily vol sigma → posterior is normal with precision 1/tau² + n/sigma².
 */
export default function BayesianUpdaterLab() {
  const [mu0, setMu0] = useState(0.1);
  const [tau, setTau] = useState(0.2);
  const [xbar, setXbar] = useState(-0.15);
  const [n, setN] = useState(0);
  const [sigma, setSigma] = useState(1);

  const priorPrec = 1 / (tau * tau);
  const dataPrec = (n * 1) / (sigma * sigma);
  const postPrec = priorPrec + dataPrec;
  const postMu = (mu0 * priorPrec + xbar * dataPrec) / postPrec;
  const postSd = Math.sqrt(1 / postPrec);
  const dataWeight = dataPrec / postPrec;

  const { priorCurve, postCurve, xs, ys, xDom } = useMemo(() => {
    const lo = Math.min(mu0 - 4.2 * tau, postMu - 4.2 * postSd);
    const hi = Math.max(mu0 + 4.2 * tau, postMu + 4.2 * postSd);
    const xDom = [lo, hi];
    const xVals = linspace(lo, hi, 281);
    const yMax = Math.max(normPDF(mu0, mu0, tau), normPDF(postMu, postMu, postSd)) * 1.12;
    const xs = scaleLinear(xDom, [M.l, W - M.r]);
    const ys = scaleLinear([0, yMax], [H - M.b, M.t]);

    const priorCurve = xVals.map((x) => [xs(x), ys(normPDF(x, mu0, tau))]);
    const postCurve = xVals.map((x) => [xs(x), ys(normPDF(x, postMu, postSd))]);
    return { priorCurve, postCurve, xs, ys, xDom };
  }, [mu0, tau, postMu, postSd]);

  const xTicks = niceTicks(xDom[0], xDom[1], 7);
  const y0 = ys(0);

  const slider = (label, value, set, min, max, step, show) => (
    <div className={styles.control}>
      <label>
        {label} <b>{show}</b>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  return (
    <LabCard badge="Lab" title="Prior → posterior updater">
      <div className={styles.controls}>
        {slider('Prior mean μ₀ (%/day)', mu0, setMu0, -0.5, 0.5, 0.01, fmt(mu0, 2) + '%')}
        {slider('Prior uncertainty τ', tau, setTau, 0.03, 0.5, 0.01, fmt(tau, 2) + '%')}
        {slider('Observed mean x̄ (%/day)', xbar, setXbar, -0.5, 0.5, 0.01, fmt(xbar, 2) + '%')}
        {slider('Days observed n', n, setN, 0, 250, 1, fmt(n, 0))}
        {slider('Daily vol σ (%)', sigma, setSigma, 0.5, 3, 0.05, fmt(sigma, 2) + '%')}
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Posterior mean</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)', fontSize: '1.35rem' }}>
            {fmt(postMu, 3)}%
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Posterior std</div>
          <div className={styles.statValue}>{fmt(postSd, 3)}%</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Weight on data</div>
          <div className={styles.statValue}>{(dataWeight * 100).toFixed(1)}%</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Weight on prior</div>
          <div className={styles.statValue}>{((1 - dataWeight) * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Prior and posterior densities for the mean daily return">
          {xTicks.map((t) => (
            <g key={'x' + t}>
              <line x1={xs(t)} x2={xs(t)} y1={y0} y2={y0 + 5} stroke="var(--viz-axis)" strokeWidth={1} />
              <text x={xs(t)} y={y0 + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
                {fmt(t, 2)}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={W - M.r} y1={y0} y2={y0} stroke="var(--viz-axis)" strokeWidth={1.5} />

          {/* prior */}
          <path d={linePath(priorCurve)} fill="none" stroke="var(--viz-s2)" strokeWidth={2} strokeDasharray="6 4" />

          {/* posterior */}
          <path d={linePath(postCurve)} fill="none" stroke="var(--viz-s1)" strokeWidth={2.5} />

          {/* observed sample mean marker */}
          {xbar >= xDom[0] && xbar <= xDom[1] && (
            <g>
              <line x1={xs(xbar)} x2={xs(xbar)} y1={M.t + 14} y2={y0} stroke="var(--viz-s4)" strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={xs(xbar)} y={M.t + 26} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--viz-ink)">
                x̄
              </text>
            </g>
          )}

          {/* legend */}
          <g fontSize={11}>
            <line x1={M.l + 8} x2={M.l + 34} y1={M.t + 8} y2={M.t + 8} stroke="var(--viz-s2)" strokeWidth={2} strokeDasharray="6 4" />
            <text x={M.l + 40} y={M.t + 12} fill="var(--viz-muted)">
              prior
            </text>
            <line x1={M.l + 8} x2={M.l + 34} y1={M.t + 26} y2={M.t + 26} stroke="var(--viz-s1)" strokeWidth={2.5} />
            <text x={M.l + 40} y={M.t + 30} fill="var(--viz-muted)">
              posterior
            </text>
          </g>
        </svg>
      </div>

      <p className={styles.hint}>
        With n=0 the posterior <b>is</b> the prior. Drag n up and watch the posterior slide toward the
        observed mean x̄ and narrow — more evidence, less uncertainty. A tight prior (small τ) resists
        the data; a vague prior (big τ) surrenders to it almost immediately.
      </p>
    </LabCard>
  );
}
