import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, scaleLinear, linePath, fmt } from './mathkit';

/*
 * PDFExplorer — one interactive SVG chart for the continuous distributions.
 *
 * kind = 'uniform' | 'lognormal' | 'pareto'
 * Draws the density curve, a shaded P(c ≤ X ≤ d) region (numeric integral),
 * an optional cumulative (CDF) overlay, and a mean / median readout.
 * Dependency-free pure SVG, on-brand --viz-* styling.
 */

const W = 640;
const H = 300;
const M = { t: 16, r: 18, b: 40, l: 20 };

export default function PDFExplorer({ kind = 'uniform', title, badge = 'Lab', showCDF: showCDF0 = false }) {
  // distribution parameters (per kind)
  const [lo, setLo] = useState(10); // uniform a
  const [hi, setHi] = useState(40); // uniform b
  const [mu, setMu] = useState(0); // lognormal μ (of ln X)
  const [sig, setSig] = useState(0.5); // lognormal σ / spread
  const [xm, setXm] = useState(1); // pareto scale (minimum)
  const [alpha, setAlpha] = useState(2); // pareto shape
  // shaded region bounds
  const [c, setC] = useState(kind === 'uniform' ? 15 : kind === 'pareto' ? 1 : 0);
  const [d, setD] = useState(kind === 'uniform' ? 30 : kind === 'pareto' ? 2 : 1);
  const [showCDF, setShowCDF] = useState(showCDF0);

  const model = useMemo(() => {
    let pdf;
    let xDom;
    let mean;
    let median;
    let extra = '';

    if (kind === 'uniform') {
      const A = Math.min(lo, hi);
      const B = Math.max(lo, hi);
      const w = B - A || 1;
      pdf = (x) => (x >= A && x <= B ? 1 / w : 0);
      xDom = [A - 0.18 * w, B + 0.18 * w];
      mean = (A + B) / 2;
      median = mean;
      extra = `height 1/(b−a) = 1/${fmt(w, 0)} = ${fmt(1 / w, 3)}`;
    } else if (kind === 'lognormal') {
      pdf = (x) => (x <= 0 ? 0 : Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sig * sig)) / (x * sig * Math.sqrt(2 * Math.PI)));
      xDom = [0, Math.exp(mu + 3.4 * sig)];
      mean = Math.exp(mu + (sig * sig) / 2);
      median = Math.exp(mu);
      extra = `median e^μ = ${fmt(median, 2)}  <  mean = ${fmt(mean, 2)}  (right-skew)`;
    } else {
      // pareto
      const X = Math.max(0.2, xm);
      pdf = (x) => (x < X ? 0 : (alpha * Math.pow(X, alpha)) / Math.pow(x, alpha + 1));
      xDom = [0, X * 7];
      mean = alpha > 1 ? (alpha * X) / (alpha - 1) : Infinity;
      median = X * Math.pow(2, 1 / alpha);
      extra = alpha > 1 ? `mean = αxₘ/(α−1) = ${fmt(mean, 2)}` : 'mean is infinite for α ≤ 1';
    }

    // fine grid for drawing + numeric integration
    const N = 481;
    const xs = linspace(xDom[0], xDom[1], N);
    const ys = xs.map(pdf);
    const dx = (xDom[1] - xDom[0]) / (N - 1);

    // cumulative integral (trapezoid) → CDF
    const cum = [0];
    for (let i = 1; i < N; i++) cum.push(cum[i - 1] + ((ys[i] + ys[i - 1]) / 2) * dx);

    // P(c ≤ X ≤ d) by trapezoid over [c, d]
    const clo = Math.min(c, d);
    const chi = Math.max(c, d);
    let area = 0;
    for (let i = 1; i < N; i++) {
      const xa = xs[i - 1];
      const xb = xs[i];
      if (xb <= clo || xa >= chi) continue;
      const l = Math.max(xa, clo);
      const r = Math.min(xb, chi);
      area += ((pdf(l) + pdf(r)) / 2) * (r - l);
    }

    let yMax = 0;
    for (const v of ys) if (Number.isFinite(v) && v > yMax) yMax = v;
    yMax = yMax * 1.14 || 1;

    return { xs, ys, cum, xDom, mean, median, area, yMax, extra };
  }, [kind, lo, hi, mu, sig, xm, alpha, c, d]);

  const { xs, ys, cum, xDom, mean, median, area, yMax, extra } = model;
  const xsc = scaleLinear(xDom, [M.l, W - M.r]);
  const ysc = scaleLinear([0, yMax], [H - M.b, M.t]);
  const y0 = ysc(0);

  const curve = xs.map((x, i) => [xsc(x), ysc(Math.min(ys[i], yMax))]);
  const cdfMax = cum[cum.length - 1] || 1;
  const cdfCurve = xs.map((x, i) => [xsc(x), ysc((cum[i] / cdfMax) * yMax)]);

  // shaded region path (built from grid indices between c and d)
  const clo = Math.min(c, d);
  const chi = Math.max(c, d);
  let shadePath = '';
  const idxs = [];
  for (let i = 0; i < xs.length; i++) if (xs[i] >= clo && xs[i] <= chi) idxs.push(i);
  if (idxs.length > 1) {
    const pts = idxs.map((i) => [xsc(xs[i]), ysc(Math.min(ys[i], yMax))]);
    shadePath = linePath(pts) + `L${xsc(xs[idxs[idxs.length - 1]]).toFixed(2)},${y0.toFixed(2)}L${xsc(xs[idxs[0]]).toFixed(2)},${y0.toFixed(2)}Z`;
  }

  const xTicks = linspace(xDom[0], xDom[1], 7);

  const control = (label, value, set, min, max, step, show) => (
    <div className={styles.control}>
      <label>
        {label} <b>{show}</b>
      </label>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  const heading =
    title || (kind === 'uniform' ? 'Continuous uniform PDF' : kind === 'lognormal' ? 'Log-normal PDF' : 'Pareto PDF');

  return (
    <LabCard badge={badge} title={heading}>
      <div className={styles.controls}>
        {kind === 'uniform' && control('Min a', lo, setLo, 0, 30, 1, Math.min(lo, hi))}
        {kind === 'uniform' && control('Max b', hi, setHi, 10, 60, 1, Math.max(lo, hi))}
        {kind === 'lognormal' && control('μ (of ln X)', mu, setMu, -1, 1.5, 0.05, fmt(mu, 2))}
        {kind === 'lognormal' && control('σ (spread)', sig, setSig, 0.15, 1.2, 0.05, fmt(sig, 2))}
        {kind === 'pareto' && control('Scale xₘ', xm, setXm, 0.5, 3, 0.1, fmt(xm, 1))}
        {kind === 'pareto' && control('Shape α', alpha, setAlpha, 0.6, 5, 0.1, fmt(alpha, 1))}
        {control('Region c', c, setC, xDom[0], xDom[1], (xDom[1] - xDom[0]) / 100, fmt(Math.min(c, d), 1))}
        {control('Region d', d, setD, xDom[0], xDom[1], (xDom[1] - xDom[0]) / 100, fmt(Math.max(c, d), 1))}
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>P(c ≤ X ≤ d)</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)', fontSize: '1.3rem' }}>{(area * 100).toFixed(2)}%</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Mean</div>
          <div className={styles.statValue}>{Number.isFinite(mean) ? fmt(mean, 2) : '∞'}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Median</div>
          <div className={styles.statValue}>{fmt(median, 2)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Cumulative</div>
          <div className={styles.statValue}>
            <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={showCDF} onChange={(e) => setShowCDF(e.target.checked)} /> CDF
            </label>
          </div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${heading}: density with shaded probability between c and d`}>
          {/* x axis */}
          <line x1={M.l} x2={W - M.r} y1={y0} y2={y0} stroke="var(--viz-axis)" strokeWidth={1.5} />
          {xTicks.map((t) => (
            <g key={'x' + t}>
              <line x1={xsc(t)} x2={xsc(t)} y1={y0} y2={y0 + 5} stroke="var(--viz-axis)" strokeWidth={1} />
              <text x={xsc(t)} y={y0 + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
                {fmt(t, t > 100 ? 0 : 1)}
              </text>
            </g>
          ))}

          {/* shaded probability */}
          {shadePath && <path d={shadePath} fill="var(--viz-s1)" opacity={0.26} />}

          {/* density curve */}
          <path d={linePath(curve)} fill="none" stroke="var(--viz-s1)" strokeWidth={2.5} />

          {/* CDF overlay (rescaled to plot height; right axis is 0..1) */}
          {showCDF && (
            <>
              <path d={linePath(cdfCurve)} fill="none" stroke="var(--viz-s4)" strokeWidth={2} strokeDasharray="5 3" opacity={0.9} />
              <text x={W - M.r - 4} y={ysc(yMax) + 12} textAnchor="end" fontSize={10} fill="var(--viz-s4)">
                CDF → 1
              </text>
            </>
          )}

          {/* mean marker */}
          {Number.isFinite(mean) && mean >= xDom[0] && mean <= xDom[1] && (
            <>
              <line x1={xsc(mean)} x2={xsc(mean)} y1={M.t} y2={y0} stroke="var(--viz-muted)" strokeWidth={1} strokeDasharray="2 3" />
              <text x={xsc(mean)} y={M.t + 2} textAnchor="middle" fontSize={10} fill="var(--viz-muted)">mean</text>
            </>
          )}
        </svg>
      </div>

      <p className={styles.hint}>
        The shaded area <b>is</b> the probability. {extra}
      </p>
    </LabCard>
  );
}
