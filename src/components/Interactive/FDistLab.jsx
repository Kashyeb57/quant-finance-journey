import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, scaleLinear, linePath, fPDF, fCDF, fInv, fmt } from './mathkit';

const W = 640;
const H = 300;
const M = { t: 20, r: 16, b: 40, l: 20 };

// The F-distribution and its ONE-tailed decision boundary. Like chi-square it's
// right-skewed and non-negative, so the whole rejection region (area α) sits in
// the right tail. Drag the two degrees of freedom (between = d1, within = d2)
// and α to move the critical value off the F table; an observed F, if supplied,
// gets a reject/fail verdict — and if it lands past the axis (as the worked
// example's F = 86.56 does) it's flagged at the right edge.
export default function FDistLab({
  defaultD1 = 2,
  defaultD2 = 18,
  defaultAlpha = 0.05,
  observed = null,
  title = 'F-distribution — the right-tailed decision boundary',
  badge = 'Lab',
}) {
  const [d1, setD1] = useState(defaultD1);
  const [d2, setD2] = useState(defaultD2);
  const [alpha, setAlpha] = useState(defaultAlpha);

  const crit = fInv(1 - alpha, d1, d2);
  const pValue = observed != null ? 1 - fCDF(observed, d1, d2) : null;
  const reject = observed != null && observed > crit;

  const geom = useMemo(() => {
    const hi = Math.max(crit * 1.9, 5);
    const xDom = [0, hi];
    const x0 = hi / 800; // step over the x→0 spike when d1 ≤ 2
    const xVals = linspace(x0, hi, 260);
    const yMax =
      Math.max(...xVals.map((x) => fPDF(x, d1, d2)).filter((v) => isFinite(v))) * 1.15 || 1;
    const xs = scaleLinear(xDom, [M.l, W - M.r]);
    const ys = scaleLinear([0, yMax], [H - M.b, M.t]);
    const curve = xVals.map((x) => [xs(x), ys(fPDF(x, d1, d2))]);

    const rejVals = linspace(crit, hi, 90);
    const rej =
      linePath(rejVals.map((x) => [xs(x), ys(fPDF(x, d1, d2))])) +
      `L${xs(hi)},${ys(0)}L${xs(crit)},${ys(0)}Z`;

    return { xDom, xs, ys, curve, rej, y0: ys(0), hi };
  }, [d1, d2, alpha, crit]);

  const { xs, ys, curve, rej, y0, hi } = geom;
  const xTicks = useMemo(() => {
    const step = hi <= 6 ? 1 : hi <= 12 ? 2 : hi <= 30 ? 5 : 10;
    const t = [];
    for (let v = 0; v <= hi + 1e-9; v += step) t.push(+v.toFixed(2));
    return t;
  }, [hi]);

  const offChart = observed != null && observed > hi;

  const slider = (label, value, set, min, max, stp, show) => (
    <div className={styles.control}>
      <label>{label} <b>{show}</b></label>
      <input type="range" aria-label={label} min={min} max={max} step={stp} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  return (
    <LabCard badge={badge} title={title}>
      <div className={styles.controls}>
        {slider('df between (d₁ = a − 1)', d1, setD1, 1, 12, 1, `${d1}`)}
        {slider('df within (d₂ = N − a)', d2, setD2, 2, 40, 1, `${d2}`)}
        {slider('Significance α', alpha, setAlpha, 0.01, 0.2, 0.005, fmt(alpha, 3))}
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Critical value F<sub>{d1},{d2}</sub></div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s4)' }}>{fmt(crit, 4)}</div>
        </div>
        {observed != null && (
          <>
            <div className={styles.stat}>
              <div className={styles.statLabel}>Observed F</div>
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
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A right-skewed F density with the rejection region shaded in the right tail and the critical value marked">
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
          <text x={xs(crit)} y={M.t - 6} textAnchor="middle" fontSize={10} fill="var(--viz-s4)" fontWeight={700}>CV {fmt(crit, 3)}</text>
          <text x={Math.min(xs(crit) + 60, W - M.r - 40)} y={M.t + 30} textAnchor="middle" fontSize={10} fill="var(--viz-s4)">rejection (α)</text>
          <text x={xs(crit) - 66} y={M.t + 70} textAnchor="middle" fontSize={10} fill="var(--viz-muted)">acceptance (1 − α)</text>

          {/* observed statistic */}
          {observed != null && !offChart && (
            <g>
              <line x1={xs(observed)} x2={xs(observed)} y1={ys(fPDF(observed, d1, d2))} y2={y0} stroke="var(--viz-ink)" strokeWidth={2} />
              <circle cx={xs(observed)} cy={y0} r={4} fill="var(--viz-ink)" />
              <text x={xs(observed)} y={y0 - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--viz-ink)">F = {fmt(observed, 2)}</text>
            </g>
          )}
          {/* observed off the right edge — draw an arrow past the axis */}
          {offChart && (
            <g>
              <line x1={W - M.r - 70} x2={W - M.r - 2} y1={y0 - 22} y2={y0 - 22} stroke="var(--viz-crit)" strokeWidth={2.4} />
              <path d={`M${W - M.r - 2},${y0 - 22} l-9,-5 l0,10 Z`} fill="var(--viz-crit)" />
              <text x={W - M.r - 70} y={y0 - 30} textAnchor="start" fontSize={11} fontWeight={700} fill="var(--viz-crit)">F = {fmt(observed, 2)} ⟶ off-chart</text>
              <text x={W - M.r - 70} y={y0 - 8} textAnchor="start" fontSize={9.5} fill="var(--viz-muted)">deep in the rejection tail</text>
            </g>
          )}
        </svg>
      </div>

      <p className={styles.hint}>
        The F-distribution is <b>right-skewed and non-negative</b>, so an ANOVA is always <b>one-tailed</b>: the
        whole rejection region (area α) is the right tail. Read the <b>critical value</b> off the F table using
        <b> two</b> degrees of freedom — <b>d₁ = a − 1</b> (between) and <b>d₂ = N − a</b> (within) — at your α, then
        reject H₀ if the computed F lands past it. For the worked example (d₁ = 2, d₂ = 18, α = 0.05 → <b>3.5546</b>),
        F = 86.56 sails clear off the chart.
      </p>
    </LabCard>
  );
}
