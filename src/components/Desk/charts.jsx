import React, { useEffect, useId, useRef, useState } from 'react';
import styles from './styles.module.css';

/*
 * Small hand-drawn SVG charts for the desk panels. Each measures its own box
 * (ResizeObserver) so text stays crisp instead of stretching with a viewBox.
 */

function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

const linePath = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');

/** Line + soft gradient fill for a plain number series. `baseline` draws a dashed reference value. */
export function Spark({ values, color = 'var(--desk-up)', baseline = null, fill = true, height = 56 }) {
  const [ref, { w }] = useSize();
  const id = useId().replace(/:/g, '');
  const vals = (values || []).filter((v) => v != null && !Number.isNaN(v));
  const h = height;
  if (vals.length < 2) return <div ref={ref} className={styles.sparkEmpty} style={{ height: h }}>no data yet</div>;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (baseline != null) { lo = Math.min(lo, baseline); hi = Math.max(hi, baseline); }
  const span = hi - lo || 1;
  const y = (v) => 3 + (1 - (v - lo) / span) * (h - 6);
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, y(v)]);
  return (
    <div ref={ref} style={{ height: h }}>
      {w > 0 && (
        <svg width={w} height={h} aria-hidden="true">
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {baseline != null && (
            <line x1="0" x2={w} y1={y(baseline)} y2={y(baseline)} stroke="var(--desk-grid-strong)" strokeDasharray="3 3" />
          )}
          {fill && <path d={`${linePath(pts)}L${w},${h}L0,${h}Z`} fill={`url(#g${id})`} />}
          <path d={linePath(pts)} fill="none" stroke={color} strokeWidth="1.5" />
        </svg>
      )}
    </div>
  );
}

const fmtK = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${Math.round(v)}`);

/**
 * Dual-wing area chart: cumulative put OI to the left of spot, cumulative call
 * OI to the right. x = strike, y = contracts.
 */
export function DepthWings({ depth }) {
  const [ref, { w, h }] = useSize();
  const id = useId().replace(/:/g, '');
  const pad = { l: 46, r: 12, t: 10, b: 24 };
  const ready = depth && w > 0 && h > 0;
  let body = null;
  if (ready) {
    const all = [...depth.puts, ...depth.calls];
    const kLo = Math.min(...all.map((p) => p.k), depth.spot);
    const kHi = Math.max(...all.map((p) => p.k), depth.spot);
    const yHi = Math.max(1, ...all.map((p) => p.cum));
    const X = (k) => pad.l + ((k - kLo) / (kHi - kLo || 1)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - v / yHi) * (h - pad.t - pad.b);
    const base = Y(0);
    const wing = (pts, edge) => {
      if (!pts.length) return null;
      const p = [...pts.map((d) => [X(d.k), Y(d.cum)])];
      // close the wing down to zero at spot so the two meet in a "V"
      if (edge === 'left') p.push([X(depth.spot), base]);
      else p.unshift([X(depth.spot), base]);
      return { line: linePath(p), area: `${linePath(p)}L${p[p.length - 1][0]},${base}L${p[0][0]},${base}Z` };
    };
    const L = wing(depth.puts, 'left');
    const R = wing(depth.calls, 'right');
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yHi);
    const xTicks = Array.from({ length: 7 }, (_, i) => kLo + ((kHi - kLo) * i) / 6);
    body = (
      <svg width={w} height={h}>
        <defs>
          <linearGradient id={`p${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--desk-put)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--desk-put)" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--desk-up)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--desk-up)" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--desk-grid)" />
            <text x={pad.l - 6} y={Y(v) + 3} textAnchor="end" className={styles.axis}>{fmtK(v)}</text>
          </g>
        ))}
        {xTicks.map((k) => (
          <text key={k} x={X(k)} y={h - 6} textAnchor="middle" className={styles.axis}>{k.toFixed(0)}</text>
        ))}
        {L && <path d={L.area} fill={`url(#p${id})`} />}
        {R && <path d={R.area} fill={`url(#c${id})`} />}
        {L && <path d={L.line} fill="none" stroke="var(--desk-put)" strokeWidth="1.6" />}
        {R && <path d={R.line} fill="none" stroke="var(--desk-up)" strokeWidth="1.6" />}
        <line x1={X(depth.spot)} x2={X(depth.spot)} y1={pad.t} y2={base} stroke="var(--desk-grid-strong)" strokeDasharray="3 3" />
        <text x={X(depth.spot)} y={pad.t + 10} textAnchor="middle" className={styles.axisStrong}>spot {depth.spot.toFixed(2)}</text>
      </svg>
    );
  }
  return <div ref={ref} className={styles.plot}>{body}</div>;
}

/** P&L across uniform spot shocks, with the 1-day 95% VaR drawn as a band. */
export function PnlProfile({ profile, varDollars }) {
  const [ref, { w, h }] = useSize();
  const id = useId().replace(/:/g, '');
  const pad = { l: 56, r: 12, t: 10, b: 24 };
  let body = null;
  if (profile && w > 0 && h > 0) {
    const pts = profile.points;
    const lim = Math.max(1, ...pts.map((p) => Math.abs(p.pnl)), varDollars || 0);
    const X = (s) => pad.l + ((s - pts[0].shock) / (pts[pts.length - 1].shock - pts[0].shock)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v + lim) / (2 * lim)) * (h - pad.t - pad.b);
    const line = linePath(pts.map((p) => [X(p.shock), Y(p.pnl)]));
    const zero = Y(0);
    const yTicks = [-lim, -lim / 2, 0, lim / 2, lim];
    body = (
      <svg width={w} height={h}>
        <defs>
          <clipPath id={`up${id}`}><rect x="0" y="0" width={w} height={zero} /></clipPath>
          <clipPath id={`dn${id}`}><rect x="0" y={zero} width={w} height={h - zero} /></clipPath>
        </defs>
        {varDollars != null && (
          <rect x={pad.l} width={w - pad.l - pad.r} y={zero} height={Math.max(0, Y(-varDollars) - zero)} fill="var(--desk-down)" opacity="0.12" />
        )}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--desk-grid-strong)' : 'var(--desk-grid)'} />
            <text x={pad.l - 6} y={Y(v) + 3} textAnchor="end" className={styles.axis}>{v < 0 ? '−' : ''}${fmtK(Math.abs(v))}</text>
          </g>
        ))}
        {[-10, -5, 0, 5, 10].map((s) => (
          <text key={s} x={X(s)} y={h - 6} textAnchor="middle" className={styles.axis}>{s > 0 ? '+' : ''}{s}%</text>
        ))}
        <path d={`${line}L${X(10)},${zero}L${X(-10)},${zero}Z`} fill="var(--desk-up)" opacity="0.25" clipPath={`url(#up${id})`} />
        <path d={`${line}L${X(10)},${zero}L${X(-10)},${zero}Z`} fill="var(--desk-down)" opacity="0.25" clipPath={`url(#dn${id})`} />
        <path d={line} fill="none" stroke="var(--desk-accent)" strokeWidth="1.6" />
        {varDollars != null && (
          <text x={w - pad.r - 4} y={Y(-varDollars) - 4} textAnchor="end" className={styles.axisStrong}>1-day 95% VaR −${fmtK(varDollars)}</text>
        )}
      </svg>
    );
  }
  return <div ref={ref} className={styles.plot}>{body}</div>;
}
