import React, { useEffect, useRef, useState } from 'react';
import styles from './styles.module.css';

/*
 * GEX-by-strike histogram sidebar. Vertical axis = strike (high at top),
 * horizontal bars = net dealer gamma at that strike (green +, red −), strike
 * price printed at each bar's tip in the bar's colour.
 *   • SCROLL over the panel = pan up/down through the strikes.
 *   • DOUBLE-CLICK = zoom in (around the click) / zoom back out.
 *   • Hover a bar = read its exact net GEX.
 *   • KEYBOARD (focus the panel): ↑/↓ read strike by strike, PgUp/PgDn pan,
 *     Enter zooms in/out around the selected strike, Esc clears.
 * Starts as a window around the current price, so there are strikes above and
 * below to scroll to.
 */
const PADT = 6, PADB = 6, PADL = 6, PADR = 6;

// Shift the visible strike window up (dir 1) or down (dir -1). Returns false when
// everything is already in view, so the caller can let the page scroll instead.
function panBy(s, dir) {
  if (!s.ready) return false;
  const span = s.maxK - s.minK;
  if (span >= (s.dataMax - s.dataMin) - 1e-6) return false;
  const step = span * 0.14 * dir;
  let nlo = s.minK + step, nhi = s.maxK + step;
  if (nhi > s.dataMax) { const d = nhi - s.dataMax; nlo -= d; nhi -= d; }
  if (nlo < s.dataMin) { const d = s.dataMin - nlo; nlo += d; nhi += d; }
  s.setView([nlo, nhi]);
  return true;
}

const fmtGex = (v) => {
  const a = Math.abs(v), s = v < 0 ? '−' : '+';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return s + (a / 1e3).toFixed(0) + 'K';
  return s + a.toFixed(0);
};

export default function GexProfile({ profile, spot, callWall, putWall, gammaFlip, resetKey }) {
  const boxRef = useRef(null);
  const stRef = useRef({});
  const [dim, setDim] = useState({ w: 210, h: 440 });
  const [hoverK, setHoverK] = useState(null); // strike being read (mouse or keyboard)
  const [view, setView] = useState(null); // [min, max] user pan/zoom, or null = default window

  useEffect(() => { setView(null); }, [resetKey]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w && h) setDim((d) => (d.w === w && d.h === h ? d : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // non-passive wheel = PAN through the strikes (up = higher strikes)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (panBy(stRef.current, e.deltaY < 0 ? 1 : -1)) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const ready = profile && profile.length >= 2;
  const { w: W, h: H } = dim;

  // full data range
  let dataMin = 0, dataMax = 0;
  if (ready) {
    const ks = profile.map((p) => p.strike);
    dataMin = Math.min(...ks); dataMax = Math.max(...ks);
    for (const m of [spot, callWall, putWall, gammaFlip]) if (m != null) { dataMin = Math.min(dataMin, m); dataMax = Math.max(dataMax, m); }
    const sp = (dataMax - dataMin) || 1; dataMin -= sp * 0.03; dataMax += sp * 0.03;
  }
  // default window: ~±6% of price (so there's room to scroll)
  let defLo = dataMin, defHi = dataMax;
  if (ready && spot) {
    const dh = Math.min(spot * 0.06, (dataMax - dataMin) / 2);
    defLo = spot - dh; defHi = spot + dh;
    if (defLo < dataMin) { defHi = Math.min(dataMax, defHi + (dataMin - defLo)); defLo = dataMin; }
    if (defHi > dataMax) { defLo = Math.max(dataMin, defLo - (defHi - dataMax)); defHi = dataMax; }
  }
  const minK = view ? view[0] : defLo;
  const maxK = view ? view[1] : defHi;

  const plotW = W - PADL - PADR;
  const zeroX = PADL + plotW * 0.4;
  const sy = (k) => PADT + ((maxK - k) / (maxK - minK)) * (H - PADT - PADB);

  stRef.current = { ready, H, minK, maxK, dataMin, dataMax, spot, setView };

  let bars = [], rowH = 8;
  if (ready && W > 30 && H > 30 && maxK > minK) {
    const maxAbs = Math.max(...profile.map((p) => Math.abs(p.net)), 1);
    const vis = profile.filter((p) => p.strike >= minK && p.strike <= maxK);
    bars = vis.map((p) => ({ strike: p.strike, net: p.net, y: sy(p.strike), bw: (p.net / maxAbs) * (plotW * 0.46) }));
    if (bars.length > 1) {
      const ys = bars.map((b) => b.y).sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < ys.length; i++) gaps.push(ys[i] - ys[i - 1]);
      gaps.sort((a, b) => a - b);
      rowH = Math.max(2, Math.min(gaps[Math.floor(gaps.length / 2)] * 0.72, 22));
    }
  }

  const onMove = (e) => {
    if (!bars.length || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const my = e.clientY - rect.top;
    let best = null, bd = Infinity;
    for (const b of bars) { const d = Math.abs(b.y - my); if (d < bd) { bd = d; best = b; } }
    setHoverK(best && bd < 16 ? best.strike : null);
  };

  const hover = hoverK == null ? null : bars.find((b) => b.strike === hoverK) || null;

  const zoomAt = (cursorK) => {
    const defSpan = (defHi - defLo) || 1;
    if ((maxK - minK) > defSpan * 0.6) {
      // zoom IN around the click
      const half = defSpan * 0.22;
      let nlo = cursorK - half, nhi = cursorK + half;
      if (nhi > dataMax) { const d = nhi - dataMax; nlo -= d; nhi -= d; }
      if (nlo < dataMin) { const d = dataMin - nlo; nlo += d; nhi += d; }
      setView([nlo, nhi]);
    } else {
      setView(null); // zoom back OUT to the default window
    }
  };

  const onDbl = (e) => {
    if (!ready || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const frac = (e.clientY - rect.top - PADT) / (H - PADT - PADB);
    zoomAt(maxK - frac * (maxK - minK));
  };

  // Keyboard equivalent of hover / scroll / double-click.
  const onKey = (e) => {
    if (!ready) return;
    const sorted = bars.map((b) => b.strike).sort((a, b) => a - b);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!sorted.length) return;
      const up = e.key === 'ArrowUp';
      if (hoverK == null || !sorted.includes(hoverK)) {
        const anchor = spot != null ? spot : sorted[Math.floor(sorted.length / 2)];
        setHoverK(sorted.reduce((m, k) => (Math.abs(k - anchor) < Math.abs(m - anchor) ? k : m)));
        return;
      }
      const i = sorted.indexOf(hoverK) + (up ? 1 : -1);
      if (i >= 0 && i < sorted.length) setHoverK(sorted[i]);
      else panBy(stRef.current, up ? 1 : -1); // at the edge: bring more strikes into view
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      panBy(stRef.current, e.key === 'PageUp' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      zoomAt(hoverK != null ? hoverK : spot != null ? spot : (minK + maxK) / 2);
    } else if (e.key === 'Escape') {
      setHoverK(null);
    }
  };

  // The profile in words: where the biggest positive and negative gamma sit.
  let topPos = null, topNeg = null;
  if (ready) {
    for (const p of profile) {
      if (p.net > 0 && (!topPos || p.net > topPos.net)) topPos = p;
      if (p.net < 0 && (!topNeg || p.net < topNeg.net)) topNeg = p;
    }
  }

  const marker = (price, color, label) => (price == null || !(maxK > minK) || price < minK || price > maxK) ? null : (
    <g key={label}>
      <line x1={0} y1={sy(price)} x2={W} y2={sy(price)} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
      <text x={W - 2} y={sy(price) - 2} fill={color} fontSize="9" textAnchor="end">{label} {Math.round(price)}</text>
    </g>
  );

  const labelFont = Math.max(6.5, Math.min(rowH * 0.9, 10));

  return (
    <div className={styles.gexProfile}>
      <div className={styles.gexProfileTitle}>
        GEX by strike
        <span className={styles.gexHint} title="Keyboard: focus the panel, then ↑/↓ read each strike, Page Up/Down pan, Enter zooms"> · scroll to pan · dbl-click zoom</span>
      </div>
      {(topPos || topNeg) && (
        <div className={styles.gexSummary}>
          {topPos && <span>most + <b>{Math.round(topPos.strike)}</b> {fmtGex(topPos.net)}</span>}
          {topNeg && <span>most − <b>{Math.round(topNeg.strike)}</b> {fmtGex(topNeg.net)}</span>}
        </div>
      )}
      <div
        className={styles.gexProfilePlot}
        ref={boxRef}
        tabIndex={ready ? 0 : -1}
        role="group"
        aria-label="GEX by strike. Up and down arrows read each strike, Page Up and Page Down pan, Enter zooms."
        onKeyDown={onKey}
        onBlur={() => setHoverK(null)}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverK(null)}
        onDoubleClick={onDbl}>
        {bars.length > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} aria-hidden="true" focusable="false">
            <line x1={zeroX} y1={4} x2={zeroX} y2={H - 4} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            {bars.map((b, i) => {
              const x = b.bw >= 0 ? zeroX : zeroX + b.bw;
              const hl = hover && hover.strike === b.strike;
              const col = b.net >= 0 ? '#22c55e' : '#ef4444';
              const tx = b.bw >= 0 ? zeroX + b.bw + 3 : zeroX + b.bw - 3;
              return (
                <g key={i}>
                  <rect x={x} y={b.y - rowH / 2} width={Math.abs(b.bw)} height={rowH} rx="1" fill={col} opacity={hl ? 1 : 0.82} />
                  {rowH >= 6 && (
                    <text x={tx} y={b.y + labelFont * 0.34} fill={col} fontSize={labelFont}
                      fontWeight={hl ? 700 : 400} textAnchor={b.bw >= 0 ? 'start' : 'end'}>
                      {Math.round(b.strike)}
                    </text>
                  )}
                </g>
              );
            })}
            {marker(gammaFlip, '#a855f7', 'Flip')}
            {marker(putWall, '#14b8a6', 'PW')}
            {marker(callWall, '#f97316', 'CW')}
            {marker(spot, '#eab308', 'Spot')}
          </svg>
        )}
        {hover && (
          <div className={styles.gexTip} style={{ top: hover.y, left: zeroX + 8 }} aria-hidden="true">
            <b>{Math.round(hover.strike)}</b> · {fmtGex(hover.net)}
          </div>
        )}
        <span className={styles.gexLive} aria-live="polite">
          {hover ? `Strike ${Math.round(hover.strike)}: net gamma ${fmtGex(hover.net)}` : ''}
        </span>
      </div>
    </div>
  );
}
