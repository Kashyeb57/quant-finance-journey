import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { scaleLinear, fInv, fmt } from './mathkit';

const W = 640;
const H = 320;
const M = { t: 24, r: 20, b: 40, l: 20 };
const COLORS = ['var(--viz-s1)', 'var(--viz-s2)', 'var(--viz-s3)'];

// Deterministic per-point offsets (each row sums to 0, so the group mean lands
// exactly on its centre regardless of the spread slider). 3 groups × 7 points.
const CENTERS = [-1, 0, 1];
const OFFSETS = [
  [-1.2, -0.6, 0.1, 0.0, 0.5, 0.9, 0.3],
  [0.8, -0.9, 0.4, -0.3, 1.0, -0.7, -0.3],
  [-0.5, 0.7, -1.0, 0.6, 0.2, -0.6, 0.6],
];
const JITTER = [-9, 6, -3, 9, -6, 3, 0]; // fixed vertical scatter within a row band

// The heart of ANOVA: F = variance BETWEEN groups ÷ variance WITHIN groups.
// Pull the group means apart (between ↑) or loosen the spread (within ↑) and
// watch the F-ratio cross the critical value. Same n = 7 per group as the
// worked medication example, so d₁ = 2, d₂ = 18 and CV = 3.5546.
export default function AnovaVarianceLab({
  title = 'Between-group vs within-group variance — what F really measures',
  badge = 'Lab',
}) {
  const [sep, setSep] = useState(2.2);
  const [spread, setSpread] = useState(1.0);

  const model = useMemo(() => {
    const n = OFFSETS[0].length;
    const groups = CENTERS.map((c, g) => OFFSETS[g].map((o) => c * sep + o * spread));
    const groupMeans = groups.map((pts) => pts.reduce((a, b) => a + b, 0) / n);
    const all = groups.flat();
    const grand = all.reduce((a, b) => a + b, 0) / all.length;

    let ssBetween = 0;
    groupMeans.forEach((m) => (ssBetween += n * (m - grand) ** 2));
    let ssWithin = 0;
    groups.forEach((pts, g) => pts.forEach((v) => (ssWithin += (v - groupMeans[g]) ** 2)));

    const dfB = CENTERS.length - 1; // 2
    const dfW = all.length - CENTERS.length; // 18
    const msB = ssBetween / dfB;
    const msW = ssWithin / dfW;
    const F = msW > 1e-9 ? msB / msW : Infinity;
    return { groups, groupMeans, grand, ssBetween, ssWithin, dfB, dfW, msB, msW, F, all };
  }, [sep, spread]);

  const { groups, groupMeans, grand, ssBetween, ssWithin, dfB, dfW, msB, msW, F, all } = model;
  const crit = fInv(0.95, dfB, dfW); // 3.5546
  const reject = F > crit;

  const geom = useMemo(() => {
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const pad = (hi - lo) * 0.12 + 0.5;
    const xs = scaleLinear([lo - pad, hi + pad], [M.l, W - M.r]);
    const rowY = [0, 1, 2].map((g) => M.t + 40 + g * 78);
    return { xs, rowY };
  }, [all]);

  const { xs, rowY } = geom;

  const slider = (label, value, set, min, max, stp, show) => (
    <div className={styles.control}>
      <label>{label} <b>{show}</b></label>
      <input type="range" aria-label={label} min={min} max={max} step={stp} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  return (
    <LabCard badge={badge} title={title}>
      <div className={styles.controls}>
        {slider('Separation between group means', sep, setSep, 0, 5, 0.1, fmt(sep, 1))}
        {slider('Spread within each group (σ)', spread, setSpread, 0.2, 3, 0.1, fmt(spread, 1))}
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>MS between</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)' }}>{fmt(msB, 2)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>MS within</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s3)' }}>{fmt(msW, 2)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>F = MS<sub>b</sub> / MS<sub>w</sub></div>
          <div className={styles.statValue} style={{ color: reject ? 'var(--viz-crit)' : 'var(--viz-good)' }}>{fmt(F, 2)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Critical F<sub>2,18</sub></div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s4)' }}>{fmt(crit, 3)}</div>
        </div>
        <div className={`${styles.stat} ${reject ? styles.statBad : styles.statGood}`}>
          <div className={styles.statLabel}>Decision</div>
          <div className={styles.statValue} style={{ fontSize: '0.9rem' }}>{reject ? 'Reject H₀' : 'Fail to reject H₀'}</div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Three groups of points along a value axis, each with its group mean; the grand mean is a vertical line. Separation of the group means is between-group variance; scatter of points around each group mean is within-group variance.">
          {/* grand mean line */}
          <line x1={xs(grand)} x2={xs(grand)} y1={M.t} y2={H - M.b} stroke="var(--viz-ink)" strokeWidth={1.6} strokeDasharray="5 4" />
          <text x={xs(grand)} y={M.t - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--viz-ink)">grand mean</text>

          {groups.map((pts, g) => (
            <g key={g}>
              {/* between-group arrow: group mean ↔ grand mean */}
              <line x1={xs(grand)} x2={xs(groupMeans[g])} y1={rowY[g]} y2={rowY[g]} stroke={COLORS[g]} strokeWidth={1.4} strokeDasharray="3 3" opacity={0.7} />
              {/* points (within-group scatter) */}
              {pts.map((v, i) => (
                <circle key={i} cx={xs(v)} cy={rowY[g] + JITTER[i]} r={4.5} fill={COLORS[g]} opacity={0.82} />
              ))}
              {/* group mean tick */}
              <line x1={xs(groupMeans[g])} x2={xs(groupMeans[g])} y1={rowY[g] - 22} y2={rowY[g] + 22} stroke={COLORS[g]} strokeWidth={2.6} />
              <text x={xs(groupMeans[g])} y={rowY[g] - 27} textAnchor="middle" fontSize={10} fontWeight={700} fill={COLORS[g]}>x̄{['₁', '₂', '₃'][g]}</text>
            </g>
          ))}

          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--viz-axis)" strokeWidth={1.5} />
          <text x={W - M.r} y={H - M.b + 22} textAnchor="end" fontSize={10} fill="var(--viz-muted)">response value →</text>
        </svg>
      </div>

      <div className={styles.legend}>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-s1)' }} /> group 1</span>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-s2)' }} /> group 2</span>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-s3)' }} /> group 3</span>
      </div>

      <p className={styles.hint}>
        <b>Between-group variance</b> is how far the coloured group means sit from the dashed grand mean;
        <b> within-group variance</b> is how loosely the dots scatter around their own group mean. F is their ratio.
        Push <b>separation</b> up (means fly apart) and F climbs; loosen the <b>spread</b> (dots blur together) and F
        collapses. Reject H₀ only when the signal <i>between</i> groups dwarfs the noise <i>within</i> them — F past
        {' '}{fmt(crit, 3)}.
      </p>
    </LabCard>
  );
}
