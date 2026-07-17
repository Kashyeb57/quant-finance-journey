import React, { useMemo, useRef, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, scaleLinear, linePath, niceTicks, normCDF, normPDF, fmt, fmtMoney } from './mathkit';

function blackScholes(S, K, T, sigma, r, isCall) {
  const t = Math.max(T, 1e-6);
  const sq = sigma * Math.sqrt(t);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * t) / sq;
  const d2 = d1 - sq;
  const df = Math.exp(-r * t);
  const price = isCall
    ? S * normCDF(d1) - K * df * normCDF(d2)
    : K * df * normCDF(-d2) - S * normCDF(-d1);
  const delta = isCall ? normCDF(d1) : normCDF(d1) - 1;
  const gamma = normPDF(d1) / (S * sq);
  const vega = (S * normPDF(d1) * Math.sqrt(t)) / 100; // per 1% vol move
  const theta =
    ((-S * normPDF(d1) * sigma) / (2 * Math.sqrt(t)) -
      (isCall ? 1 : -1) * r * K * df * normCDF(isCall ? d2 : -d2)) /
    365; // per calendar day
  return { price, delta, gamma, vega, theta };
}

const W = 640;
const H = 320;
const M = { t: 16, r: 16, b: 38, l: 56 };

export default function BlackScholesLab() {
  const [isCall, setIsCall] = useState(true);
  const [S, setS] = useState(100);
  const [K, setK] = useState(100);
  const [T, setT] = useState(1);
  const [vol, setVol] = useState(0.2);
  const [r, setR] = useState(0.05);
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  const greeks = blackScholes(S, K, T, vol, r, isCall);

  const { pts, intrPts, xs, ys, sDom } = useMemo(() => {
    const sDom = [Math.max(1, K * 0.4), K * 1.6];
    const sVals = linspace(sDom[0], sDom[1], 241);
    const prices = sVals.map((s) => blackScholes(s, K, T, vol, r, isCall).price);
    const intrinsic = sVals.map((s) => (isCall ? Math.max(s - K, 0) : Math.max(K - s, 0)));
    const hi = Math.max(...prices, ...intrinsic) * 1.08 || 1;

    const xs = scaleLinear(sDom, [M.l, W - M.r]);
    const ys = scaleLinear([0, hi], [H - M.b, M.t]);
    return {
      pts: sVals.map((s, i) => [xs(s), ys(prices[i])]),
      intrPts: sVals.map((s, i) => [xs(s), ys(intrinsic[i])]),
      xs,
      ys,
      sDom,
    };
  }, [isCall, K, T, vol, r]);

  const onMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const s = Math.min(Math.max(xs.invert(px), sDom[0]), sDom[1]);
    const p = blackScholes(s, K, T, vol, r, isCall).price;
    setHover({ s, p, px: xs(s), py: ys(p) });
  };

  const xTicks = niceTicks(sDom[0], sDom[1], 6);
  const yTicks = niceTicks(0, ys.invert(M.t), 5);

  const slider = (label, value, set, min, max, step, show) => (
    <div className={styles.control}>
      <label>
        {label} <b>{show}</b>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  return (
    <LabCard badge="Lab" title="Black–Scholes option pricer">
      <div className={styles.controls}>
        <div className={styles.control}>
          <label>Option type</label>
          <div className={styles.segmented}>
            <button className={isCall ? styles.segActive : ''} onClick={() => setIsCall(true)}>
              Call
            </button>
            <button className={!isCall ? styles.segActive : ''} onClick={() => setIsCall(false)}>
              Put
            </button>
          </div>
        </div>
        {slider('Spot S', S, setS, 40, 180, 1, `$${S}`)}
        {slider('Strike K', K, setK, 40, 180, 1, `$${K}`)}
        {slider('Maturity T', T, setT, 0.05, 3, 0.05, `${T.toFixed(2)} yr`)}
        {slider('Volatility σ', vol, setVol, 0.05, 0.8, 0.01, `${Math.round(vol * 100)}%`)}
        {slider('Rate r', r, setR, 0, 0.12, 0.005, `${(r * 100).toFixed(1)}%`)}
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>{isCall ? 'Call' : 'Put'} price</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)' }}>
            {fmtMoney(greeks.price)}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Delta Δ</div>
          <div className={styles.statValue}>{fmt(greeks.delta, 3)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Gamma Γ</div>
          <div className={styles.statValue}>{fmt(greeks.gamma, 4)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Vega (1% vol)</div>
          <div className={styles.statValue}>{fmt(greeks.vega, 3)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Theta (per day)</div>
          <div className={styles.statValue}>{fmt(greeks.theta, 3)}</div>
        </div>
      </div>

      <div className={styles.chartWrap} ref={wrapRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Option value versus spot price, with intrinsic value for comparison"
        >
          {yTicks.map((t) => (
            <g key={'y' + t}>
              <line x1={M.l} x2={W - M.r} y1={ys(t)} y2={ys(t)} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={M.l - 8} y={ys(t) + 4} textAnchor="end" fontSize={11} fill="var(--viz-muted)">
                {fmt(t, 0)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={'x' + t} x={xs(t)} y={H - M.b + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
              {fmt(t, 0)}
            </text>
          ))}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--viz-axis)" strokeWidth={1.5} />

          {/* intrinsic value (hockey stick) */}
          <path d={linePath(intrPts)} fill="none" stroke="var(--viz-muted)" strokeWidth={1.5} strokeDasharray="5 4" />

          {/* model value */}
          <path d={linePath(pts)} fill="none" stroke="var(--viz-s1)" strokeWidth={2.5} />

          {/* current spot marker */}
          <line x1={xs(S)} x2={xs(S)} y1={M.t} y2={H - M.b} stroke="var(--viz-s3)" strokeWidth={1.5} strokeDasharray="4 4" />
          <circle cx={xs(S)} cy={ys(greeks.price)} r={5} fill="var(--viz-s3)" stroke="var(--viz-card-bg)" strokeWidth={2} />
          <text x={xs(S) + 8} y={ys(greeks.price) - 8} fontSize={11} fontWeight={700} fill="var(--viz-ink)">
            you are here
          </text>

          {hover && (
            <g pointerEvents="none">
              <line x1={hover.px} x2={hover.px} y1={M.t} y2={H - M.b} stroke="var(--viz-muted)" strokeWidth={1} strokeDasharray="2 3" />
              <circle cx={hover.px} cy={hover.py} r={4.5} fill="var(--viz-s1)" stroke="var(--viz-card-bg)" strokeWidth={2} />
            </g>
          )}

          <text x={W - M.r} y={H - 6} textAnchor="end" fontSize={11} fill="var(--viz-muted)">
            Spot price S
          </text>
        </svg>

        {hover && (
          <div className={styles.tooltip} style={{ left: `${(hover.px / W) * 100}%`, top: `${(hover.py / H) * 100}%` }}>
            S = {fmt(hover.s, 1)}
            <br />
            {isCall ? 'Call' : 'Put'} = <b>{fmtMoney(hover.p)}</b>
          </div>
        )}
      </div>

      <div className={styles.legend}>
        <span>
          <span className={styles.swatch} style={{ background: 'var(--viz-s1)' }} />
          Black–Scholes value
        </span>
        <span>
          <span className={styles.swatch} style={{ background: 'var(--viz-muted)' }} />
          Intrinsic value at expiry
        </span>
        <span>
          <span className={styles.swatch} style={{ background: 'var(--viz-s3)' }} />
          Current spot
        </span>
      </div>

      <p className={styles.hint}>
        The gap between the solid and dashed lines is <b>time value</b> — watch it melt as you slide
        maturity T toward zero, and swell as you raise volatility σ.
      </p>
    </LabCard>
  );
}
