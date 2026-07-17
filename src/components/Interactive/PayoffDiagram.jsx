import React, { useId, useMemo, useRef, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, scaleLinear, linePath, niceTicks, fmtMoney, fmt } from './mathkit';

// Each strategy builds a list of legs from strike K, premium p and width w.
// Leg: { type: 'call'|'put'|'stock', dir: +1 (long) | -1 (short), k, prem }
const STRATEGIES = {
  'long-call': {
    label: 'Long Call',
    legs: (K, p) => [{ type: 'call', dir: 1, k: K, prem: p }],
    blurb: 'Pay a premium now for the right to buy at K. Loss capped at the premium, unlimited upside.',
  },
  'short-call': {
    label: 'Short Call',
    legs: (K, p) => [{ type: 'call', dir: -1, k: K, prem: p }],
    blurb: 'Collect the premium, but losses grow without limit if the price rallies past K.',
  },
  'long-put': {
    label: 'Long Put',
    legs: (K, p) => [{ type: 'put', dir: 1, k: K, prem: p }],
    blurb: 'Pay a premium for the right to sell at K — profits when the market falls.',
  },
  'short-put': {
    label: 'Short Put',
    legs: (K, p) => [{ type: 'put', dir: -1, k: K, prem: p }],
    blurb: 'Collect the premium; large losses if the market crashes below K.',
  },
  straddle: {
    label: 'Long Straddle',
    legs: (K, p) => [
      { type: 'call', dir: 1, k: K, prem: p },
      { type: 'put', dir: 1, k: K, prem: p },
    ],
    blurb: 'Buy a call and a put at the same strike — a bet on a big move in either direction.',
  },
  strangle: {
    label: 'Long Strangle',
    legs: (K, p, w) => [
      { type: 'call', dir: 1, k: K + w / 2, prem: p * 0.7 },
      { type: 'put', dir: 1, k: K - w / 2, prem: p * 0.7 },
    ],
    blurb: 'Like a straddle but with out-of-the-money strikes — cheaper, needs a bigger move.',
  },
  'bull-call-spread': {
    label: 'Bull Call Spread',
    legs: (K, p, w) => [
      { type: 'call', dir: 1, k: K, prem: p },
      { type: 'call', dir: -1, k: K + w, prem: p * 0.45 },
    ],
    blurb: 'Buy a call at K, sell one at K+width. Cheaper than a call alone, but upside is capped.',
  },
  'protective-put': {
    label: 'Protective Put',
    legs: (K, p) => [
      { type: 'stock', dir: 1, k: K, prem: 0 },
      { type: 'put', dir: 1, k: K, prem: p },
    ],
    blurb: 'Own the stock and buy a put as insurance — the classic hedge.',
  },
};

function legPayoff(leg, S) {
  let intrinsic = 0;
  if (leg.type === 'call') intrinsic = Math.max(S - leg.k, 0);
  else if (leg.type === 'put') intrinsic = Math.max(leg.k - S, 0);
  else intrinsic = S - leg.k; // stock bought at k
  return leg.dir * (intrinsic - leg.prem);
}

const W = 640;
const H = 340;
const M = { t: 16, r: 16, b: 38, l: 56 };

export default function PayoffDiagram({ defaultStrategy = 'long-call' }) {
  const [strategy, setStrategy] = useState(
    STRATEGIES[defaultStrategy] ? defaultStrategy : 'long-call'
  );
  const [K, setK] = useState(100);
  const [prem, setPrem] = useState(8);
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  const width = 20; // strike gap used by spreads / strangles
  const def = STRATEGIES[strategy];
  const legs = def.legs(K, prem, width);

  const { pts, xs, ys, breakevens, maxProfit, maxLoss, unlimitedUp, unlimitedDown, sDom } = useMemo(() => {
    const sDom = [Math.max(0, K - 70), K + 70];
    const sVals = linspace(sDom[0], sDom[1], 281);
    const pl = sVals.map((S) => legs.reduce((a, l) => a + legPayoff(l, S), 0));

    let lo = Math.min(...pl, 0);
    let hi = Math.max(...pl, 0);
    const pad = (hi - lo) * 0.12 || 10;
    lo -= pad;
    hi += pad;

    const xs = scaleLinear(sDom, [M.l, W - M.r]);
    const ys = scaleLinear([lo, hi], [H - M.b, M.t]);
    const pts = sVals.map((S, i) => [xs(S), ys(pl[i])]);

    const breakevens = [];
    for (let i = 1; i < sVals.length; i++) {
      const a = pl[i - 1];
      const b = pl[i];
      if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) {
        const t = Math.abs(a) / (Math.abs(a) + Math.abs(b) || 1);
        breakevens.push(sVals[i - 1] + t * (sVals[i] - sVals[i - 1]));
      }
    }

    const n = pl.length;
    const slopeR = pl[n - 1] - pl[n - 2]; // payoff still moving at the right edge?
    return {
      pts,
      xs,
      ys,
      breakevens,
      maxProfit: Math.max(...pl),
      maxLoss: Math.min(...pl),
      unlimitedUp: slopeR > 1e-9 && pl[n - 1] > 0,
      unlimitedDown: slopeR < -1e-9 && pl[n - 1] < 0,
      sDom,
    };
  }, [strategy, K, prem]);

  const y0 = ys(0);
  const areaPath =
    linePath(pts) + `L${pts[pts.length - 1][0]},${y0}L${pts[0][0]},${y0}Z`;

  const onMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const S = Math.min(Math.max(xs.invert(px), sDom[0]), sDom[1]);
    const pl = legs.reduce((a, l) => a + legPayoff(l, S), 0);
    setHover({ S, pl, px: xs(S), py: ys(pl) });
  };

  const xTicks = niceTicks(sDom[0], sDom[1], 6);
  const yTicks = niceTicks(ys.invert(H - M.b), ys.invert(M.t), 5);
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, '');

  return (
    <LabCard badge="Lab" title="Option payoff explorer">
      <div className={styles.controls}>
        <div className={styles.control}>
          <label>Strategy</label>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {Object.entries(STRATEGIES).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.control}>
          <label>
            Strike K <b>${K}</b>
          </label>
          <input
            type="range"
            min={60}
            max={140}
            step={1}
            value={K}
            onChange={(e) => setK(+e.target.value)}
          />
        </div>
        <div className={styles.control}>
          <label>
            Premium <b>${prem}</b>
          </label>
          <input
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={prem}
            onChange={(e) => setPrem(+e.target.value)}
          />
        </div>
      </div>

      <div className={styles.chartWrap} ref={wrapRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Profit and loss at expiry versus underlying price"
        >
          <defs>
            <clipPath id={clipId + 'up'}>
              <rect x={0} y={0} width={W} height={y0} />
            </clipPath>
            <clipPath id={clipId + 'dn'}>
              <rect x={0} y={y0} width={W} height={H - y0} />
            </clipPath>
          </defs>

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

          {/* profit / loss shading, split at the zero line */}
          <path d={areaPath} fill="var(--viz-good)" opacity={0.14} clipPath={`url(#${clipId}up)`} />
          <path d={areaPath} fill="var(--viz-crit)" opacity={0.14} clipPath={`url(#${clipId}dn)`} />

          {/* zero line */}
          <line x1={M.l} x2={W - M.r} y1={y0} y2={y0} stroke="var(--viz-axis)" strokeWidth={1.5} />

          {/* payoff curve */}
          <path d={linePath(pts)} fill="none" stroke="var(--viz-s1)" strokeWidth={2.5} strokeLinejoin="round" />

          {/* strike markers */}
          {legs
            .filter((l) => l.type !== 'stock')
            .map((l, i) => (
              <g key={i}>
                <line x1={xs(l.k)} x2={xs(l.k)} y1={M.t} y2={H - M.b} stroke="var(--viz-muted)" strokeWidth={1} strokeDasharray="4 4" />
                <text x={xs(l.k)} y={M.t + 10} textAnchor="middle" fontSize={10} fill="var(--viz-muted)">
                  K={fmt(l.k, 0)}
                </text>
              </g>
            ))}

          {/* breakeven dots */}
          {breakevens.map((b, i) => (
            <g key={i}>
              <circle cx={xs(b)} cy={y0} r={5} fill="var(--viz-card-bg)" stroke="var(--viz-s3)" strokeWidth={2.5} />
              <text x={xs(b)} y={y0 - 10} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--viz-ink)">
                BE {fmt(b, 1)}
              </text>
            </g>
          ))}

          {/* hover crosshair */}
          {hover && (
            <g pointerEvents="none">
              <line x1={hover.px} x2={hover.px} y1={M.t} y2={H - M.b} stroke="var(--viz-muted)" strokeWidth={1} strokeDasharray="2 3" />
              <circle cx={hover.px} cy={hover.py} r={4.5} fill="var(--viz-s1)" stroke="var(--viz-card-bg)" strokeWidth={2} />
            </g>
          )}

          <text x={W - M.r} y={H - 6} textAnchor="end" fontSize={11} fill="var(--viz-muted)">
            Underlying price at expiry (Sₜ)
          </text>
          <text x={14} y={M.t + 2} fontSize={11} fill="var(--viz-muted)" transform={`rotate(-90 14 ${M.t + 2})`} textAnchor="end">
            Profit / Loss ($)
          </text>
        </svg>

        {hover && (
          <div
            className={styles.tooltip}
            style={{
              left: `${(hover.px / W) * 100}%`,
              top: `${(hover.py / H) * 100}%`,
            }}
          >
            Sₜ = {fmt(hover.S, 1)}
            <br />
            P/L = <b style={{ color: hover.pl >= 0 ? 'var(--viz-good)' : 'var(--viz-crit)' }}>{fmtMoney(hover.pl)}</b>
          </div>
        )}
      </div>

      <div className={styles.statRow}>
        <div className={`${styles.stat} ${styles.statGood}`}>
          <div className={styles.statLabel}>Max profit</div>
          <div className={styles.statValue}>
            {unlimitedUp ? 'Unlimited ↑' : fmtMoney(maxProfit)}
          </div>
        </div>
        <div className={`${styles.stat} ${styles.statBad}`}>
          <div className={styles.statLabel}>Max loss</div>
          <div className={styles.statValue}>
            {unlimitedDown ? 'Unlimited ↓' : fmtMoney(maxLoss)}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Breakeven</div>
          <div className={styles.statValue}>
            {breakevens.length ? breakevens.map((b) => fmt(b, 1)).join(' · ') : '—'}
          </div>
        </div>
      </div>

      <p className={styles.hint}>{def.blurb} Drag the sliders and hover the chart to explore.</p>
    </LabCard>
  );
}
