import React, { useMemo, useRef, useState } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { scaleLinear, linePath, niceTicks, fmt, fmtMoney } from './mathkit';

const W = 640;
const H = 320;
const M = { t: 16, r: 16, b: 38, l: 64 };

const FREQS = [
  { label: 'Annually', m: 1 },
  { label: 'Quarterly', m: 4 },
  { label: 'Monthly', m: 12 },
  { label: 'Daily', m: 365 },
];

export default function CompoundInterestLab() {
  const [principal, setPrincipal] = useState(1000);
  const [monthly, setMonthly] = useState(100);
  const [rate, setRate] = useState(0.08);
  const [years, setYears] = useState(20);
  const [m, setM] = useState(12);
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  const { balPts, contribPts, xs, ys, balances, contribs } = useMemo(() => {
    // Simulate month by month; a nominal rate compounded m times/year is an
    // effective per-month growth factor of (1 + r/m)^(m/12).
    const months = years * 12;
    const growth = Math.pow(1 + rate / m, m / 12);
    const balances = [principal];
    const contribs = [principal];
    let bal = principal;
    let put = principal;
    for (let mo = 1; mo <= months; mo++) {
      bal = (bal + monthly) * growth;
      put += monthly;
      balances.push(bal);
      contribs.push(put);
    }

    const xs = scaleLinear([0, years], [M.l, W - M.r]);
    const ys = scaleLinear([0, Math.max(bal, put) * 1.06], [H - M.b, M.t]);
    const balPts = balances.map((v, i) => [xs(i / 12), ys(v)]);
    const contribPts = contribs.map((v, i) => [xs(i / 12), ys(v)]);
    return { balPts, contribPts, xs, ys, balances, contribs };
  }, [principal, monthly, rate, years, m]);

  const finalBal = balances[balances.length - 1];
  const finalPut = contribs[contribs.length - 1];
  const interest = finalBal - finalPut;

  const y0 = ys(0);
  const areaBal = linePath(balPts) + `L${balPts[balPts.length - 1][0]},${y0}L${balPts[0][0]},${y0}Z`;
  const areaPut = linePath(contribPts) + `L${contribPts[contribPts.length - 1][0]},${y0}L${contribPts[0][0]},${y0}Z`;

  const onMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = Math.min(Math.max(xs.invert(px), 0), years);
    const idx = Math.round(t * 12);
    setHover({
      t: idx / 12,
      bal: balances[idx],
      put: contribs[idx],
      px: xs(idx / 12),
      py: ys(balances[idx]),
    });
  };

  const slider = (label, value, set, min, max, step, show) => (
    <div className={styles.control}>
      <label>
        {label} <b>{show}</b>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} />
    </div>
  );

  return (
    <LabCard badge="Lab" title="Compound interest — the eighth wonder">
      <div className={styles.controls}>
        {slider('Starting amount', principal, setPrincipal, 0, 20000, 500, fmtMoney(principal, 0))}
        {slider('Monthly deposit', monthly, setMonthly, 0, 1000, 25, fmtMoney(monthly, 0))}
        {slider('Annual rate', rate, setRate, 0.005, 0.15, 0.005, `${(rate * 100).toFixed(1)}%`)}
        {slider('Years', years, setYears, 1, 40, 1, `${years}`)}
        <div className={styles.control}>
          <label>Compounding</label>
          <select value={m} onChange={(e) => setM(+e.target.value)}>
            {FREQS.map((f) => (
              <option key={f.m} value={f.m}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Final balance</div>
          <div className={styles.statValue} style={{ color: 'var(--viz-s1)', fontSize: '1.3rem' }}>
            {fmtMoney(finalBal, 0)}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>You contributed</div>
          <div className={styles.statValue}>{fmtMoney(finalPut, 0)}</div>
        </div>
        <div className={`${styles.stat} ${styles.statGood}`}>
          <div className={styles.statLabel}>Interest earned</div>
          <div className={styles.statValue}>{fmtMoney(interest, 0)}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Growth multiple</div>
          <div className={styles.statValue}>{finalPut > 0 ? fmt(finalBal / finalPut, 2) + '×' : '—'}</div>
        </div>
      </div>

      <div className={styles.chartWrap} ref={wrapRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Balance versus contributions over time"
        >
          {niceTicks(0, ys.invert(M.t), 5).map((t) => (
            <g key={'y' + t}>
              <line x1={M.l} x2={W - M.r} y1={ys(t)} y2={ys(t)} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={M.l - 8} y={ys(t) + 4} textAnchor="end" fontSize={11} fill="var(--viz-muted)">
                {fmt(t, 0)}
              </text>
            </g>
          ))}
          {niceTicks(0, years, 6).map((t) => (
            <text key={'x' + t} x={xs(t)} y={H - M.b + 18} textAnchor="middle" fontSize={11} fill="var(--viz-muted)">
              {fmt(t, 0)}y
            </text>
          ))}
          <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--viz-axis)" strokeWidth={1.5} />

          <path d={areaBal} fill="var(--viz-s1)" opacity={0.15} />
          <path d={areaPut} fill="var(--viz-s2)" opacity={0.25} />

          <path d={linePath(balPts)} fill="none" stroke="var(--viz-s1)" strokeWidth={2.5} />
          <path d={linePath(contribPts)} fill="none" stroke="var(--viz-s2)" strokeWidth={2} />

          {/* direct labels (relief for light-mode aqua) */}
          <text x={balPts[balPts.length - 1][0] - 6} y={balPts[balPts.length - 1][1] - 8} textAnchor="end" fontSize={11.5} fontWeight={700} fill="var(--viz-ink)">
            balance
          </text>
          <text x={contribPts[contribPts.length - 1][0] - 6} y={contribPts[contribPts.length - 1][1] - 8} textAnchor="end" fontSize={11.5} fontWeight={700} fill="var(--viz-ink)">
            contributions
          </text>

          {hover && (
            <g pointerEvents="none">
              <line x1={hover.px} x2={hover.px} y1={M.t} y2={H - M.b} stroke="var(--viz-muted)" strokeWidth={1} strokeDasharray="2 3" />
              <circle cx={hover.px} cy={hover.py} r={4.5} fill="var(--viz-s1)" stroke="var(--viz-card-bg)" strokeWidth={2} />
              <circle cx={hover.px} cy={ys(hover.put)} r={4} fill="var(--viz-s2)" stroke="var(--viz-card-bg)" strokeWidth={2} />
            </g>
          )}

          <text x={W - M.r} y={H - 6} textAnchor="end" fontSize={11} fill="var(--viz-muted)">
            Years
          </text>
        </svg>

        {hover && (
          <div className={styles.tooltip} style={{ left: `${(hover.px / W) * 100}%`, top: `${(hover.py / H) * 100}%` }}>
            Year {fmt(hover.t, 1)}
            <br />
            Balance <b>{fmtMoney(hover.bal, 0)}</b>
            <br />
            Contributed {fmtMoney(hover.put, 0)}
          </div>
        )}
      </div>

      <p className={styles.hint}>
        The gap between the two curves is money your money made. Notice it barely exists for the first
        few years, then dominates — that is why quants say <b>time in the market beats timing the market</b>.
      </p>
    </LabCard>
  );
}
