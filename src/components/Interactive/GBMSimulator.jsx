import React, { useEffect, useMemo, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, scaleLinear, linePath, niceTicks, randn, fmt, fmtMoney } from './mathkit';

const W = 640;
const H = 340;
const M = { t: 16, r: 16, b: 38, l: 56 };
const STEPS = 160;

function simulate(nPaths, S0, mu, sigma, T) {
  const dt = T / STEPS;
  const drift = (mu - 0.5 * sigma * sigma) * dt;
  const shock = sigma * Math.sqrt(dt);
  return Array.from({ length: nPaths }, () => {
    const path = new Array(STEPS + 1);
    path[0] = S0;
    for (let i = 1; i <= STEPS; i++) {
      path[i] = path[i - 1] * Math.exp(drift + shock * randn());
    }
    return path;
  });
}

export default function GBMSimulator() {
  const [mu, setMu] = useState(0.08);
  const [sigma, setSigma] = useState(0.2);
  const [T, setT] = useState(2);
  const [nPaths, setNPaths] = useState(20);
  const [paths, setPaths] = useState(null); // simulated on the client only
  const S0 = 100;

  // Math.random must not run during SSR, so simulate after mount.
  useEffect(() => {
    setPaths(simulate(nPaths, S0, mu, sigma, T));
  }, [mu, sigma, T, nPaths]);

  const view = useMemo(() => {
    if (!paths) return null;
    const tVals = linspace(0, T, STEPS + 1);
    let hi = 0;
    let lo = Infinity;
    for (const p of paths) {
      for (const v of p) {
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      }
    }
    const xs = scaleLinear([0, T], [M.l, W - M.r]);
    const ys = scaleLinear([lo * 0.95, hi * 1.05], [H - M.b, M.t]);

    const finals = paths.map((p) => p[STEPS]);
    const mean = finals.reduce((a, b) => a + b, 0) / finals.length;
    const pUp = finals.filter((v) => v > S0).length / finals.length;

    return {
      xs,
      ys,
      tVals,
      polylines: paths.map((p) => linePath(p.map((v, i) => [xs(tVals[i]), ys(v)]))),
      expected: linePath(tVals.map((t) => [xs(t), ys(S0 * Math.exp(mu * t))])),
      mean,
      pUp,
      best: Math.max(...finals),
      worst: Math.min(...finals),
    };
  }, [paths, T, mu]);

  const slider = (label, value, set, min, max, step, show) => (
    <div className={styles.control}>
      <label>
        {label} <b>{show}</b>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  return (
    <LabCard badge="Monte Carlo" title="Geometric Brownian Motion simulator">
      <div className={styles.controls}>
        {slider('Drift μ', mu, setMu, -0.2, 0.3, 0.01, `${(mu * 100).toFixed(0)}%/yr`)}
        {slider('Volatility σ', sigma, setSigma, 0.05, 0.6, 0.01, `${(sigma * 100).toFixed(0)}%/yr`)}
        {slider('Horizon T', T, setT, 0.5, 5, 0.5, `${T} yr`)}
        {slider('Paths', nPaths, setNPaths, 5, 60, 5, `${nPaths}`)}
        <div className={styles.control} style={{ justifyContent: 'flex-end' }}>
          <button className={styles.actionBtn} onClick={() => setPaths(simulate(nPaths, S0, mu, sigma, T))}>
            🎲 Re-simulate
          </button>
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Simulated geometric Brownian motion price paths">
          {view &&
            niceTicks(view.ys.invert(H - M.b), view.ys.invert(M.t), 5).map((t) => (
              <g key={'y' + t}>
                <line x1={M.l} x2={W - M.r} y1={view.ys(t)} y2={view.ys(t)} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={M.l - 8} y={view.ys(t) + 4} textAnchor="end" fontSize={11} fill="var(--viz-muted)">
                  {fmt(t, 0)}
                </text>
              </g>
            ))}
          {view &&
            niceTicks(0, T, 5).map((t) => (
              <text key={'x' + t} x={view.xs(t)} y={H - M.b + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
                {fmt(t, 1)}y
              </text>
            ))}

          {view ? (
            <>
              {view.polylines.map((d, i) => (
                <path key={i} d={d} fill="none" stroke="var(--viz-s1)" strokeWidth={1.2} opacity={0.4} />
              ))}
              <path d={view.expected} fill="none" stroke="var(--viz-s4)" strokeWidth={2.5} strokeDasharray="6 4" />
              <text x={W - M.r - 4} y={view.ys(S0 * Math.exp(mu * T)) - 8} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--viz-s4)">
                E[Sₜ] = S₀e^μᵗ
              </text>
            </>
          ) : (
            <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={14} fill="var(--viz-muted)">
              Simulating…
            </text>
          )}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--viz-axis)" strokeWidth={1.5} />
        </svg>
      </div>

      {view && (
        <div className={styles.statRow}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Mean final price</div>
            <div className={styles.statValue}>{fmtMoney(view.mean)}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>P(finish above S₀)</div>
            <div className={styles.statValue}>{(view.pUp * 100).toFixed(0)}%</div>
          </div>
          <div className={`${styles.stat} ${styles.statGood}`}>
            <div className={styles.statLabel}>Best path</div>
            <div className={styles.statValue}>{fmtMoney(view.best)}</div>
          </div>
          <div className={`${styles.stat} ${styles.statBad}`}>
            <div className={styles.statLabel}>Worst path</div>
            <div className={styles.statValue}>{fmtMoney(view.worst)}</div>
          </div>
        </div>
      )}

      <p className={styles.hint}>
        Every blue line is one possible future: dSₜ = μSₜdt + σSₜdWₜ, starting at S₀ = $100. The dashed
        red curve is the <i>expected</i> path — note how little any single path resembles it. Crank σ up
        and watch the fan explode; hit Re-simulate for a fresh set of futures.
      </p>
    </LabCard>
  );
}
