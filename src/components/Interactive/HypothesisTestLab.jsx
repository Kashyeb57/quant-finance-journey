import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import {
  linspace,
  scaleLinear,
  linePath,
  normPDF,
  normCDF,
  normInv,
  tPDF,
  tCDF,
  tInv,
  fmt,
} from './mathkit';

const W = 640;
const H = 300;
const M = { t: 20, r: 16, b: 40, l: 20 };

// A rejection-region + p-value visualizer for a one- or two-tailed test.
// Works for the standard normal (z) or the Student-t (with a df slider that
// morphs the curve back toward the normal). One widget covers the z-test,
// the t-test, the p-value, and z-vs-t.
export default function HypothesisTestLab({
  dist = 'z',
  defaultTails = 'two',
  defaultAlpha = 0.05,
  defaultStat = 2.31,
  defaultDf = 8,
  overlayNormal = false,
  title = 'Hypothesis test — rejection regions & p-value',
  badge = 'Lab',
}) {
  const [useT, setUseT] = useState(dist === 't');
  const [tails, setTails] = useState(defaultTails);
  const [alpha, setAlpha] = useState(defaultAlpha);
  const [stat, setStat] = useState(defaultStat);
  const [df, setDf] = useState(defaultDf);

  const cdf = (x) => (useT ? tCDF(x, df) : normCDF(x));
  const pdf = (x) => (useT ? tPDF(x, df) : normPDF(x));
  const inv = (p) => (useT ? tInv(p, df) : normInv(p));

  // critical value(s) and p-value for the chosen tail(s)
  const { critLo, critHi, pValue } = useMemo(() => {
    let critLo = null;
    let critHi = null;
    let pValue;
    if (tails === 'two') {
      critHi = inv(1 - alpha / 2);
      critLo = -critHi;
      pValue = 2 * (1 - cdf(Math.abs(stat)));
    } else if (tails === 'right') {
      critHi = inv(1 - alpha);
      pValue = 1 - cdf(stat);
    } else {
      critLo = inv(alpha);
      pValue = cdf(stat);
    }
    return { critLo, critHi, pValue };
  }, [tails, alpha, stat, useT, df]);

  const reject = pValue < alpha;

  const geom = useMemo(() => {
    const xDom = [-4.4, 4.4];
    const xVals = linspace(xDom[0], xDom[1], 281);
    const yMax = pdf(0) * 1.14;
    const xs = scaleLinear(xDom, [M.l, W - M.r]);
    const ys = scaleLinear([0, yMax], [H - M.b, M.t]);
    const curve = xVals.map((x) => [xs(x), ys(pdf(x))]);
    const normCurve = xVals.map((x) => [xs(x), ys(normPDF(x))]);

    const areaTo = (from, to) => {
      const lo = Math.max(Math.min(from, to), xDom[0]);
      const hi = Math.min(Math.max(from, to), xDom[1]);
      if (hi <= lo) return '';
      const pts = linspace(lo, hi, 80).map((x) => [xs(x), ys(pdf(x))]);
      return linePath(pts) + `L${xs(hi)},${ys(0)}L${xs(lo)},${ys(0)}Z`;
    };

    return { xDom, xs, ys, curve, normCurve, areaTo, y0: ys(0) };
  }, [useT, df]);

  const { xDom, xs, ys, curve, normCurve, areaTo, y0 } = geom;

  // rejection-region shapes
  const rejShapes = [];
  if (critHi != null) rejShapes.push(areaTo(critHi, xDom[1]));
  if (critLo != null) rejShapes.push(areaTo(xDom[0], critLo));

  // p-value shaded area (beyond the observed statistic)
  const pShapes = [];
  if (tails === 'two') {
    pShapes.push(areaTo(Math.abs(stat), xDom[1]));
    pShapes.push(areaTo(xDom[0], -Math.abs(stat)));
  } else if (tails === 'right') {
    pShapes.push(areaTo(stat, xDom[1]));
  } else {
    pShapes.push(areaTo(xDom[0], stat));
  }

  const xTicks = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

  const seg = (label, value, cur, set) => (
    <button
      type="button"
      className={cur === value ? styles.segActive : undefined}
      onClick={() => set(value)}
    >
      {label}
    </button>
  );

  return (
    <LabCard badge={badge} title={title}>
      <div className={styles.controls}>
        <div className={styles.control}>
          <label>Test statistic {useT ? `t` : `z`} <b>{fmt(stat, 2)}</b></label>
          <input type="range" aria-label="Test statistic" min={-4} max={4} step={0.01} value={stat} onChange={(e) => setStat(+e.target.value)} />
        </div>
        <div className={styles.control}>
          <label>Significance α <b>{fmt(alpha, 3)}</b></label>
          <input type="range" aria-label="Significance alpha" min={0.01} max={0.2} step={0.005} value={alpha} onChange={(e) => setAlpha(+e.target.value)} />
        </div>
        {useT && (
          <div className={styles.control}>
            <label>Degrees of freedom <b>{df}</b></label>
            <input type="range" aria-label="Degrees of freedom" min={1} max={40} step={1} value={df} onChange={(e) => setDf(+e.target.value)} />
          </div>
        )}
        <div className={styles.control}>
          <label>Tails</label>
          <div className={styles.segmented}>
            {seg('Two', 'two', tails, setTails)}
            {seg('Left', 'left', tails, setTails)}
            {seg('Right', 'right', tails, setTails)}
          </div>
        </div>
        <div className={styles.control}>
          <label>Distribution</label>
          <div className={styles.segmented}>
            {seg('z (normal)', false, useT, setUseT)}
            {seg('t', true, useT, setUseT)}
          </div>
        </div>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Critical value{tails === 'two' ? '(s)' : ''}</div>
          <div className={styles.statValue}>
            {tails === 'two'
              ? `±${fmt(critHi, 2)}`
              : tails === 'right'
              ? `+${fmt(critHi, 2)}`
              : fmt(critLo, 2)}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>p-value</div>
          <div className={styles.statValue} style={{ color: reject ? 'var(--viz-crit)' : 'var(--viz-good)' }}>
            {pValue < 0.0001 ? '<0.0001' : fmt(pValue, 4)}
          </div>
        </div>
        <div className={`${styles.stat} ${reject ? styles.statBad : styles.statGood}`}>
          <div className={styles.statLabel}>Decision (p vs α)</div>
          <div className={styles.statValue} style={{ fontSize: '0.95rem' }}>
            {reject ? 'Reject H₀' : 'Fail to reject H₀'}
          </div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sampling distribution under the null hypothesis with rejection regions and the observed test statistic">
          {/* rejection regions */}
          {rejShapes.map((d, i) => (
            <path key={'r' + i} d={d} fill="var(--viz-s4)" opacity={0.26} />
          ))}
          {/* p-value area beyond the observed statistic */}
          {pShapes.map((d, i) => (
            <path key={'p' + i} d={d} fill="var(--viz-s3)" opacity={0.4} />
          ))}

          {/* axis */}
          {xTicks.map((t) => (
            <g key={'x' + t}>
              <line x1={xs(t)} x2={xs(t)} y1={y0} y2={y0 + 5} stroke="var(--viz-axis)" strokeWidth={1} />
              <text x={xs(t)} y={y0 + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">{t}</text>
            </g>
          ))}
          <line x1={M.l} x2={W - M.r} y1={y0} y2={y0} stroke="var(--viz-axis)" strokeWidth={1.5} />

          {/* faint normal overlay when showing the t-distribution */}
          {useT && overlayNormal && (
            <path d={linePath(normCurve)} fill="none" stroke="var(--viz-muted)" strokeWidth={1.5} strokeDasharray="5 4" />
          )}

          {/* the sampling distribution under H0 */}
          <path d={linePath(curve)} fill="none" stroke="var(--viz-s1)" strokeWidth={2.5} />

          {/* critical value markers */}
          {[critLo, critHi].map((c, i) =>
            c != null && c >= xDom[0] && c <= xDom[1] ? (
              <g key={'c' + i}>
                <line x1={xs(c)} x2={xs(c)} y1={M.t} y2={y0} stroke="var(--viz-s4)" strokeWidth={1.4} strokeDasharray="4 3" />
                <text x={xs(c)} y={M.t - 6} textAnchor="middle" fontSize={10} fill="var(--viz-s4)" fontWeight={700}>
                  {fmt(c, 2)}
                </text>
              </g>
            ) : null
          )}

          {/* observed statistic */}
          {stat >= xDom[0] && stat <= xDom[1] && (
            <g>
              <line x1={xs(stat)} x2={xs(stat)} y1={ys(pdf(stat))} y2={y0} stroke="var(--viz-ink)" strokeWidth={2} />
              <circle cx={xs(stat)} cy={ys(pdf(stat))} r={4} fill="var(--viz-ink)" />
              <text x={xs(stat)} y={ys(pdf(stat)) - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--viz-ink)">
                {useT ? 't' : 'z'} = {fmt(stat, 2)}
              </text>
            </g>
          )}
        </svg>
      </div>

      <div className={styles.legend}>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-s4)' }} />rejection region (area α)</span>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-s3)' }} />p-value (area beyond the statistic)</span>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-s1)' }} />distribution of the statistic under H₀</span>
      </div>

      <p className={styles.hint}>
        The <b>rejection region</b> is fixed by α before you see data. If the observed statistic lands in it —
        equivalently, once its <b>p-value</b> (yellow) is smaller than α (red) — you reject H₀. Switch to <b>t</b> and
        drag <b>df</b> down: the tails fatten, the critical value moves outward, and small samples get harder to call.
      </p>
    </LabCard>
  );
}
