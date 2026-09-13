import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import {
  linspace,
  scaleLinear,
  linePath,
  niceTicks,
  normPDF,
  normInv,
  tPDF,
  tInv,
  fmt,
} from './mathkit';

const W = 640;
const H = 320;
const M = { t: 20, r: 18, b: 74, l: 20 };

// Confidence interval = point estimate ± margin of error.
// Draws the sampling distribution centered on x̄ with spread SE = σ/√n,
// shades the central (1−α) region, and reads off the lower/upper bounds.
// Defaults reproduce the CAT-exam example: x̄=520, σ=100, n=25, 95% → [480.8, 559.2].
export default function ConfidenceIntervalLab({
  defaultXbar = 520,
  defaultSigma = 100,
  defaultN = 25,
  defaultConf = 0.95,
  dist = 'z',
  title = 'Confidence interval = point estimate ± margin of error',
  badge = 'Lab',
}) {
  const [xbar, setXbar] = useState(defaultXbar);
  const [sigma, setSigma] = useState(defaultSigma);
  const [n, setN] = useState(defaultN);
  const [conf, setConf] = useState(defaultConf);
  const [useT, setUseT] = useState(dist === 't');

  const alpha = 1 - conf;
  const df = Math.max(1, n - 1);
  const se = sigma / Math.sqrt(n);
  const crit = useT ? tInv(1 - alpha / 2, df) : normInv(1 - alpha / 2);
  const moe = crit * se;
  const lower = xbar - moe;
  const upper = xbar + moe;

  const geom = useMemo(() => {
    const half = 4 * se;
    const xDom = [xbar - half, xbar + half];
    const shape = (x) => {
      const z = (x - xbar) / se;
      return (useT ? tPDF(z, df) : normPDF(z)) / se;
    };
    const xs = scaleLinear(xDom, [M.l, W - M.r]);
    const yMax = shape(xbar) * 1.14;
    const ys = scaleLinear([0, yMax], [H - M.b, M.t]);
    const xVals = linspace(xDom[0], xDom[1], 241);
    const curve = xVals.map((x) => [xs(x), ys(shape(x))]);

    const inVals = linspace(lower, upper, 140);
    const area =
      linePath(inVals.map((x) => [xs(x), ys(shape(x))])) +
      `L${xs(upper)},${ys(0)}L${xs(lower)},${ys(0)}Z`;

    return { xDom, xs, ys, curve, area, y0: ys(0) };
  }, [xbar, sigma, n, conf, useT]);

  const { xDom, xs, ys, curve, area, y0 } = geom;
  const xTicks = niceTicks(xDom[0], xDom[1], 6);

  const slider = (label, value, set, min, max, step, show) => (
    <div className={styles.control}>
      <label>
        {label} <b>{show}</b>
      </label>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  const seg = (label, value, cur, set) => (
    <button type="button" className={cur === value ? styles.segActive : undefined} onClick={() => set(value)}>
      {label}
    </button>
  );

  return (
    <LabCard badge={badge} title={title}>
      <div className={styles.controls}>
        {slider('Point estimate x̄', xbar, setXbar, 400, 640, 1, fmt(xbar, 0))}
        {slider(useT ? 'Sample std s' : 'Population σ', sigma, setSigma, 10, 200, 1, fmt(sigma, 0))}
        {slider('Sample size n', n, setN, 2, 200, 1, `${n}`)}
        <div className={styles.control}>
          <label>Confidence level</label>
          <div className={styles.segmented}>
            {seg('90%', 0.9, conf, setConf)}
            {seg('95%', 0.95, conf, setConf)}
            {seg('99%', 0.99, conf, setConf)}
          </div>
        </div>
        <div className={styles.control}>
          <label>Which test</label>
          <div className={styles.segmented}>
            {seg('z (σ known)', false, useT, setUseT)}
            {seg('t (σ unknown)', true, useT, setUseT)}
          </div>
        </div>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>{useT ? `t(α/2), df ${df}` : 'z(α/2)'}</div>
          <div className={styles.statValue}>{fmt(crit, 3)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Std error σ/√n</div>
          <div className={styles.statValue}>{fmt(se, 2)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Margin of error</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s3)' }}>±{fmt(moe, 1)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>{(conf * 100).toFixed(0)}% interval</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)', fontSize: '1.05rem' }}>
            [{fmt(lower, 1)}, {fmt(upper, 1)}]
          </div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sampling distribution centered on the point estimate, with the central confidence region shaded and the lower and upper interval bounds marked">
          {/* central confidence region */}
          <path d={area} fill="var(--viz-s1)" opacity={0.22} />

          {/* axis + ticks */}
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={xs(t)} x2={xs(t)} y1={y0} y2={y0 + 5} stroke="var(--viz-axis)" strokeWidth={1} />
              <text x={xs(t)} y={y0 + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">{fmt(t, 0)}</text>
            </g>
          ))}
          <line x1={M.l} x2={W - M.r} y1={y0} y2={y0} stroke="var(--viz-axis)" strokeWidth={1.5} />

          {/* sampling distribution */}
          <path d={linePath(curve)} fill="none" stroke="var(--viz-s1)" strokeWidth={2.5} />

          {/* center: point estimate */}
          <line x1={xs(xbar)} x2={xs(xbar)} y1={ys(0)} y2={M.t + 4} stroke="var(--viz-muted)" strokeWidth={1} strokeDasharray="2 3" />
          <text x={xs(xbar)} y={M.t} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--viz-ink)">x̄ = {fmt(xbar, 0)}</text>

          {/* tail labels */}
          <text x={xs(lower) - 22} y={ys(0) - 6} textAnchor="middle" fontSize={10} fill="var(--viz-s4)">{fmt((alpha / 2) * 100, 1)}%</text>
          <text x={xs(upper) + 22} y={ys(0) - 6} textAnchor="middle" fontSize={10} fill="var(--viz-s4)">{fmt((alpha / 2) * 100, 1)}%</text>

          {/* bounds */}
          {[lower, upper].map((v, i) => (
            <g key={i}>
              <line x1={xs(v)} x2={xs(v)} y1={M.t + 8} y2={y0} stroke="var(--viz-s1)" strokeWidth={1.5} strokeDasharray="4 3" />
            </g>
          ))}

          {/* CI bracket below the axis */}
          <g>
            <line x1={xs(lower)} x2={xs(upper)} y1={y0 + 34} y2={y0 + 34} stroke="var(--viz-s1)" strokeWidth={3} />
            <line x1={xs(lower)} x2={xs(lower)} y1={y0 + 29} y2={y0 + 39} stroke="var(--viz-s1)" strokeWidth={2} />
            <line x1={xs(upper)} x2={xs(upper)} y1={y0 + 29} y2={y0 + 39} stroke="var(--viz-s1)" strokeWidth={2} />
            <circle cx={xs(xbar)} cy={y0 + 34} r={4} fill="var(--viz-s1)" />
            <text x={xs(lower)} y={y0 + 54} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--viz-ink)">{fmt(lower, 1)}</text>
            <text x={xs(upper)} y={y0 + 54} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--viz-ink)">{fmt(upper, 1)}</text>
            <text x={xs(xbar)} y={y0 + 54} textAnchor="middle" fontSize={10} fill="var(--viz-muted)">± {fmt(moe, 1)}</text>
          </g>
        </svg>
      </div>

      <p className={styles.hint}>
        The interval is the <b>point estimate x̄</b> reached out by the <b>margin of error</b> on each side. Shrink it by
        collecting more data (bigger <b>n</b> ⇒ smaller σ/√n) or accepting less confidence (90% is narrower than 99%).
        The defaults are the CAT example: 520 ± 1.96·(100/√25) = <b>[480.8, 559.2]</b>.
      </p>
    </LabCard>
  );
}
