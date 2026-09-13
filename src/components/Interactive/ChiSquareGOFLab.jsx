import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { scaleLinear, chiSquareCDF, chiSquareInv, fmt } from './mathkit';

const W = 600;
const H = 300;
const M = { t: 18, r: 16, b: 46, l: 40 };

// Goodness-of-fit visualizer. Grouped bars compare the OBSERVED counts against
// the EXPECTED counts implied by a theory's category proportions. Observed
// counts are editable; expected counts rescale to the observed total (Eᵢ = N·pᵢ).
// When showTest is on it adds the χ² = Σ(O−E)²/E statistic, df, critical value,
// p-value and verdict. Off, it stays a pure theory-vs-observed comparison.
export default function ChiSquareGOFLab({
  categories = [
    { label: 'Yellow', observed: 22, expectedProp: 1 / 3, color: '#eab308' },
    { label: 'Red', observed: 17, expectedProp: 1 / 3, color: '#e34948' },
    { label: 'Orange', observed: 59, expectedProp: 1 / 3, color: '#f59e0b' },
  ],
  showTest = true,
  alpha = 0.05,
  title = 'Goodness of fit — observed vs expected',
  badge = 'Lab',
}) {
  const [obs, setObs] = useState(categories.map((c) => c.observed));

  const { rows, N, chi2, df, crit, pValue } = useMemo(() => {
    const N = obs.reduce((a, b) => a + b, 0);
    const totalProp = categories.reduce((a, c) => a + c.expectedProp, 0) || 1;
    const rows = categories.map((c, i) => {
      const expected = (N * c.expectedProp) / totalProp;
      const o = obs[i];
      const contrib = expected > 0 ? ((o - expected) ** 2) / expected : 0;
      return { ...c, observed: o, expected, contrib };
    });
    const chi2 = rows.reduce((a, r) => a + r.contrib, 0);
    const df = categories.length - 1;
    const crit = chiSquareInv(1 - alpha, df);
    const pValue = 1 - chiSquareCDF(chi2, df);
    return { rows, N, chi2, df, crit, pValue };
  }, [obs, categories, alpha]);

  const yMax = Math.max(...rows.map((r) => Math.max(r.observed, r.expected))) * 1.15 || 1;
  const xs = scaleLinear([0, categories.length], [M.l, W - M.r]);
  const ys = scaleLinear([0, yMax], [H - M.b, M.t]);
  const y0 = ys(0);
  const groupW = (W - M.r - M.l) / categories.length;
  const barW = Math.min(46, groupW * 0.32);

  const reject = pValue < alpha;
  const sliderMax = Math.max(100, ...categories.map((c) => c.observed * 2));

  return (
    <LabCard badge={badge} title={title}>
      <div className={styles.controls}>
        {categories.map((c, i) => (
          <div className={styles.control} key={c.label}>
            <label>
              Observed · {c.label} <b>{obs[i]}</b>
            </label>
            <input
              type="range"
              aria-label={`Observed count for ${c.label}`}
              min={0}
              max={sliderMax}
              step={1}
              value={obs[i]}
              onChange={(e) => setObs((prev) => prev.map((v, j) => (j === i ? +e.target.value : v)))}
            />
          </div>
        ))}
      </div>

      {showTest && (
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>χ² statistic</div>
            <div className={styles.statValue}>{fmt(chi2, 2)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>df = k − 1</div>
            <div className={styles.statValue}>{df}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>critical (α={alpha})</div>
            <div className={styles.statValue}>{fmt(crit, 2)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>p-value</div>
            <div className={styles.statValue} style={{ color: reject ? 'var(--viz-crit)' : 'var(--viz-good)' }}>
              {pValue < 0.0001 ? '<0.0001' : fmt(pValue, 4)}
            </div>
          </div>
          <div className={`${styles.stat} ${reject ? styles.statBad : styles.statGood}`}>
            <div className={styles.statLabel}>Fit to theory?</div>
            <div className={styles.statValue} style={{ fontSize: '0.9rem' }}>
              {reject ? "Reject — doesn't fit" : 'Fails to reject — fits'}
            </div>
          </div>
        </div>
      )}

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grouped bar chart comparing observed counts with the expected counts under the theory, for each category">
          {/* y grid */}
          {ys.invert &&
            [0, 0.25, 0.5, 0.75, 1].map((f) => {
              const v = f * yMax;
              return (
                <g key={f}>
                  <line x1={M.l} x2={W - M.r} y1={ys(v)} y2={ys(v)} stroke="var(--viz-grid)" strokeWidth={1} opacity={0.5} />
                  <text x={M.l - 6} y={ys(v) + 3} textAnchor="end" fontSize={10} fill="var(--viz-muted)">{fmt(v, 0)}</text>
                </g>
              );
            })}
          <line x1={M.l} x2={W - M.r} y1={y0} y2={y0} stroke="var(--viz-axis)" strokeWidth={1.5} />

          {rows.map((r, i) => {
            const cx = xs(i) + groupW / 2;
            const oColor = r.color || 'var(--viz-s1)';
            return (
              <g key={r.label}>
                {/* observed bar */}
                <rect x={cx - barW - 3} y={ys(r.observed)} width={barW} height={y0 - ys(r.observed)} fill={oColor} opacity={0.9} rx={2} />
                <text x={cx - barW / 2 - 3} y={ys(r.observed) - 4} textAnchor="middle" fontSize={10} fill="var(--viz-ink)" fontWeight={700}>{r.observed}</text>
                {/* expected bar */}
                <rect x={cx + 3} y={ys(r.expected)} width={barW} height={y0 - ys(r.expected)} fill="none" stroke="var(--viz-muted)" strokeWidth={1.6} strokeDasharray="4 3" rx={2} />
                <text x={cx + barW / 2 + 3} y={ys(r.expected) - 4} textAnchor="middle" fontSize={10} fill="var(--viz-muted)" fontWeight={700}>{fmt(r.expected, 1)}</text>
                {/* label */}
                <text x={cx} y={y0 + 16} textAnchor="middle" fontSize={11} fill="var(--viz-ink)">{r.label}</text>
                {showTest && (
                  <text x={cx} y={y0 + 30} textAnchor="middle" fontSize={9.5} fill="var(--viz-muted)">
                    (O−E)²/E = {fmt(r.contrib, 2)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className={styles.legend}>
        <span><span className={styles.swatch} style={{ background: 'var(--viz-s1)' }} />observed (sample) · N = {N}</span>
        <span><span className={styles.swatch} style={{ background: 'transparent', border: '1.6px dashed var(--viz-muted)' }} />expected (theory)</span>
      </div>

      <p className={styles.hint}>
        {showTest
          ? 'χ² adds up the squared gaps (O−E)²/E across categories. A big χ² (small p) means the observed counts stray too far from the theory to be luck — reject the fit.'
          : 'Goodness of fit asks one thing: how well do the observed (solid) bars match the expected (dashed) bars the theory predicts? Drag an observed count away from its expected and the gap is what the χ² test will measure next.'}
      </p>
    </LabCard>
  );
}
