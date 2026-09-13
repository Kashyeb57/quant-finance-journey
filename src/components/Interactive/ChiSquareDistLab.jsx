import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, scaleLinear, linePath, chiSquarePDF, chiSquareCDF, chiSquareInv, fmt } from './mathkit';

const W = 640;
const H = 300;
const M = { t: 20, r: 16, b: 40, l: 20 };

// The chi-square distribution and its ONE-tailed decision boundary.
// Unlike the z/t bell, χ² is right-skewed: the whole rejection region (area α)
// sits in the right tail. Drag df and α to move the critical value; if an
// observed statistic is supplied, it's marked with a reject/fail verdict.
export default function ChiSquareDistLab({
  defaultDf = 2,
  defaultAlpha = 0.05,
  observed = null,
  title = 'Chi-square distribution — the right-tailed decision boundary',
  badge = 'Lab',
}) {
  const [df, setDf] = useState(defaultDf);
  const [alpha, setAlpha] = useState(defaultAlpha);

  const crit = chiSquareInv(1 - alpha, df);
  const pValue = observed != null ? 1 - chiSquareCDF(observed, df) : null;
  const reject = observed != null && observed > crit;

  const geom = useMemo(() => {
    const hi = Math.max(crit * 1.9, (observed || 0) * 1.05, df + 4 * Math.sqrt(2 * df), 12);
    const xDom = [0, hi];
    const x0 = hi / 600; // avoid the df<2 spike at 0
    const xVals = linspace(x0, hi, 240);
    const yMax = Math.max(...xVals.slice(0, 40).map((x) => chiSquarePDF(x, df)), chiSquarePDF(Math.max(df - 2, x0), df)) * 1.15 || 1;
    const xs = scaleLinear(xDom, [M.l, W - M.r]);
    const ys = scaleLinear([0, yMax], [H - M.b, M.t]);
    const curve = xVals.map((x) => [xs(x), ys(chiSquarePDF(x, df))]);

    const rejVals = linspace(crit, hi, 90);
    const rej =
      linePath(rejVals.map((x) => [xs(x), ys(chiSquarePDF(x, df))])) +
      `L${xs(hi)},${ys(0)}L${xs(crit)},${ys(0)}Z`;

    return { xDom, xs, ys, curve, rej, y0: ys(0), hi };
  }, [df, alpha, observed, crit]);

  const { xDom, xs, ys, curve, rej, y0, hi } = geom;
  const xTicks = useMemo(() => {
    const step = hi <= 15 ? 3 : hi <= 30 ? 5 : 10;
    const t = [];
    for (let v = 0; v <= hi; v += step) t.push(v);
    return t;
  }, [hi]);

  const slider = (label, value, set, min, max, stp, show) => (
    <div className={styles.control}>
      <label>{label} <b>{show}</b></label>
      <input type="range" aria-label={label} min={min} max={max} step={stp} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  return (
    <LabCard badge={badge} title={title}>
      <div className={styles.controls}>
        {slider('Degrees of freedom (k−1)', df, setDf, 1, 20, 1, `${df}`)}
        {slider('Significance α', alpha, setAlpha, 0.01, 0.2, 0.005, fmt(alpha, 3))}
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Critical value</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s4)' }}>{fmt(crit, 3)}</div>
        </div>
        {observed != null && (
          <>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Observed χ²</div>
              <div className={styles.statValue}>{fmt(observed, 2)}</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statLabel}>p-value</div>
              <div className={styles.statValue} style={{ color: reject ? 'var(--viz-crit)' : 'var(--viz-good)' }}>
                {pValue < 0.0001 ? '<0.0001' : fmt(pValue, 4)}
              </div>
            </div>
            <div className={`${styles.stat} ${reject ? styles.statBad : styles.statGood}`}>
              <div className={styles.statLabel}>Decision</div>
              <div className={styles.statValue} style={{ fontSize: '0.9rem' }}>{reject ? 'Reject H₀' : 'Fail to reject H₀'}</div>
            </div>
          </>
        )}
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A right-skewed chi-square density with the rejection region shaded in the right tail and the critical value marked">
          <path d={rej} fill="var(--viz-s4)" opacity={0.26} />
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={xs(t)} x2={xs(t)} y1={y0} y2={y0 + 5} stroke="var(--viz-axis)" strokeWidth={1} />
              <text x={xs(t)} y={y0 + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">{t}</text>
            </g>
          ))}
          <line x1={M.l} x2={W - M.r} y1={y0} y2={y0} stroke="var(--viz-axis)" strokeWidth={1.5} />
          <path d={linePath(curve)} fill="none" stroke="var(--viz-s1)" strokeWidth={2.5} />

          {/* critical value */}
          <line x1={xs(crit)} x2={xs(crit)} y1={M.t} y2={y0} stroke="var(--viz-s4)" strokeWidth={1.4} strokeDasharray="4 3" />
          <text x={xs(crit)} y={M.t - 6} textAnchor="middle" fontSize={10} fill="var(--viz-s4)" fontWeight={700}>CV {fmt(crit, 2)}</text>
          <text x={(xs(crit) + xs(hi)) / 2} y={M.t + 30} textAnchor="middle" fontSize={10} fill="var(--viz-s4)">rejection area (α)</text>
          <text x={xs(crit) - 60} y={M.t + 60} textAnchor="middle" fontSize={10} fill="var(--viz-muted)">acceptance area</text>

          {/* observed statistic */}
          {observed != null && observed <= hi && (
            <g>
              <line x1={xs(observed)} x2={xs(observed)} y1={ys(chiSquarePDF(observed, df))} y2={y0} stroke="var(--viz-ink)" strokeWidth={2} />
              <circle cx={xs(observed)} cy={y0} r={4} fill="var(--viz-ink)" />
              <text x={xs(observed)} y={y0 - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--viz-ink)">χ² = {fmt(observed, 2)}</text>
            </g>
          )}
        </svg>
      </div>

      <p className={styles.hint}>
        Chi-square is <b>not symmetric</b> — it's right-skewed and non-negative, so the test is <b>one-tailed</b>: the
        whole rejection region (area α) is the right tail. Look the <b>critical value</b> up in the χ² table by
        <b> df</b> and <b>α</b> (df = 2, α = 0.05 → <b>5.991</b>), then reject H₀ if the observed χ² lands past it.
      </p>
    </LabCard>
  );
}
