import React, { useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, scaleLinear, linePath, niceTicks, normPDF, normCDF, fmt } from './mathkit';

const W = 640;
const H = 300;
const M = { t: 18, r: 16, b: 38, l: 20 };

export default function NormalExplorer() {
  const [mu, setMu] = useState(0);
  const [sigma, setSigma] = useState(1);
  const [a, setA] = useState(-1);
  const [b, setB] = useState(1);
  const [showRule, setShowRule] = useState(true);

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const prob = normCDF((hi - mu) / sigma) - normCDF((lo - mu) / sigma);

  const { curve, area, xs, ys, xDom } = useMemo(() => {
    const xDom = [mu - 4.2 * sigma, mu + 4.2 * sigma];
    const xVals = linspace(xDom[0], xDom[1], 281);
    const yMax = normPDF(mu, mu, sigma) * 1.12;
    const xs = scaleLinear(xDom, [M.l, W - M.r]);
    const ys = scaleLinear([0, yMax], [H - M.b, M.t]);

    const curve = xVals.map((x) => [xs(x), ys(normPDF(x, mu, sigma))]);

    const aClamp = Math.max(lo, xDom[0]);
    const bClamp = Math.min(hi, xDom[1]);
    const inVals = linspace(aClamp, bClamp, 120);
    const areaPts = inVals.map((x) => [xs(x), ys(normPDF(x, mu, sigma))]);
    const area =
      linePath(areaPts) +
      `L${xs(bClamp)},${ys(0)}L${xs(aClamp)},${ys(0)}Z`;

    return { curve, area, xs, ys, xDom };
  }, [mu, sigma, lo, hi]);

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
    <LabCard badge="Lab" title="Normal distribution explorer">
      <div className={styles.controls}>
        {slider('Mean μ', mu, setMu, -5, 5, 0.1, fmt(mu, 1))}
        {slider('Std dev σ', sigma, setSigma, 0.3, 3, 0.05, fmt(sigma, 2))}
        {slider('Lower bound a', a, setA, -8, 8, 0.1, fmt(a, 1))}
        {slider('Upper bound b', b, setB, -8, 8, 0.1, fmt(b, 1))}
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>P(a ≤ X ≤ b)</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)', fontSize: '1.35rem' }}>
            {(prob * 100).toFixed(2)}%
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>z of a</div>
          <div className={styles.statValue}>{fmt((lo - mu) / sigma, 2)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>z of b</div>
          <div className={styles.statValue}>{fmt((hi - mu) / sigma, 2)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>68–95–99.7 bands</div>
          <div className={styles.statValue}>
            <label style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input type="checkbox" checked={showRule} onChange={(e) => setShowRule(e.target.checked)} />
              show
            </label>
          </div>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Normal probability density with shaded probability between a and b">
          {/* empirical-rule bands */}
          {showRule &&
            [3, 2, 1].map((k) => (
              <rect
                key={k}
                x={xs(Math.max(mu - k * sigma, xDom[0]))}
                y={M.t}
                width={Math.max(0, xs(Math.min(mu + k * sigma, xDom[1])) - xs(Math.max(mu - k * sigma, xDom[0])))}
                height={H - M.b - M.t}
                fill="var(--viz-s2)"
                opacity={0.06}
              />
            ))}
          {showRule &&
            [1, 2, 3].map((k) => (
              <g key={'lbl' + k}>
                <text x={xs(mu + k * sigma)} y={M.t + 10} textAnchor="middle" fontSize={9.5} fill="var(--viz-muted)">
                  +{k}σ
                </text>
                <text x={xs(mu - k * sigma)} y={M.t + 10} textAnchor="middle" fontSize={9.5} fill="var(--viz-muted)">
                  −{k}σ
                </text>
              </g>
            ))}

          {xTicks.map((t) => (
            <g key={'x' + t}>
              <line x1={xs(t)} x2={xs(t)} y1={y0} y2={y0 + 5} stroke="var(--viz-axis)" strokeWidth={1} />
              <text x={xs(t)} y={y0 + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
                {fmt(t, 1)}
              </text>
            </g>
          ))}
          <line x1={M.l} x2={W - M.r} y1={y0} y2={y0} stroke="var(--viz-axis)" strokeWidth={1.5} />

          {/* shaded probability */}
          <path d={area} fill="var(--viz-s1)" opacity={0.28} />

          {/* density curve */}
          <path d={linePath(curve)} fill="none" stroke="var(--viz-s1)" strokeWidth={2.5} />

          {/* bounds */}
          {[lo, hi].map((v, i) =>
            v >= xDom[0] && v <= xDom[1] ? (
              <g key={i}>
                <line x1={xs(v)} x2={xs(v)} y1={M.t + 14} y2={y0} stroke="var(--viz-s4)" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={xs(v)} y={M.t + (i === 0 ? 26 : 38)} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--viz-ink)">
                  {i === 0 ? 'a' : 'b'}={fmt(v, 1)}
                </text>
              </g>
            ) : null
          )}

          {/* mean marker */}
          <line x1={xs(mu)} x2={xs(mu)} y1={ys(normPDF(mu, mu, sigma))} y2={y0} stroke="var(--viz-muted)" strokeWidth={1} strokeDasharray="2 3" />
          <text x={xs(mu)} y={y0 + 32} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--viz-ink)">
            μ
          </text>
        </svg>
      </div>

      <p className={styles.hint}>
        The shaded area <b>is</b> the probability. Try a=−1, b=1 with μ=0, σ=1 — you should see ≈68.3%,
        the first band of the 68–95–99.7 rule.
      </p>
    </LabCard>
  );
}
