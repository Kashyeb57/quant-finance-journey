import React, { useMemo, useState, useRef } from 'react';
import LabCard from './LabCard';
import styles from './lab.module.css';
import { linspace, fmt } from './mathkit';

/*
 * Surface3D — a dependency-free, interactive 3D surface plot in pure SVG.
 *
 * Renders z = f(x, y) as a rotatable mesh (orthographic projection, painter's
 * algorithm for hidden-surface ordering). Drag the chart or use the sliders to
 * rotate. Matches the site's SVG-lab style (LabCard + --viz-* colors), so it
 * works in any .mdx page with no extra libraries.
 *
 * Usage in MDX:
 *   <Surface3D f={(x, y) => Math.exp(-(x*x + y*y)/2)} title="Bivariate normal" />
 */

const W = 660;
const H = 400;
const SCALE = 150;

// on-brand height ramp: deep teal (low) -> brand green (high)
function ramp(t) {
  const lo = [13, 92, 112];
  const hi = [37, 194, 160];
  const c = lo.map((v, i) => Math.round(v + (hi[i] - v) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export default function Surface3D({
  f,
  xMin = -3,
  xMax = 3,
  yMin = -3,
  yMax = 3,
  n = 26,
  xLabel = 'x',
  yLabel = 'y',
  zLabel = 'z',
  title = '3D surface',
  badge = '3D',
  caption,
  yaw: yaw0 = 38,
  pitch: pitch0 = 26,
  height: zHeight = 1.4,
}) {
  const fn = f || ((x, y) => Math.exp(-(x * x + y * y) / 2)); // default: a 2-D Gaussian bell
  const [yaw, setYaw] = useState(yaw0);
  const [pitch, setPitch] = useState(pitch0);
  const drag = useRef(null);

  const { polys, baseLines, axes } = useMemo(() => {
    const xs = linspace(xMin, xMax, n);
    const ys = linspace(yMin, yMax, n);
    const Z = ys.map((y) => xs.map((x) => fn(x, y)));

    let zmin = Infinity;
    let zmax = -Infinity;
    for (const row of Z) for (const v of row) {
      if (Number.isFinite(v)) {
        if (v < zmin) zmin = v;
        if (v > zmax) zmax = v;
      }
    }
    const zr = zmax - zmin || 1;

    const a = (yaw * Math.PI) / 180;
    const e = (pitch * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ce = Math.cos(e);
    const se = Math.sin(e);

    const nx = (x) => (((x - xMin) / (xMax - xMin)) * 2 - 1);
    const ny = (y) => (((y - yMin) / (yMax - yMin)) * 2 - 1);
    const nz = (z) => (((z - zmin) / zr) * zHeight - zHeight / 2);

    const cx = W / 2;
    const cy = H / 2 + 40;

    const project = (x, y, z) => {
      const X = nx(x);
      const Y = ny(y);
      const Zn = nz(z);
      // yaw about the vertical (z-up) axis
      const x1 = X * ca - Y * sa;
      const y1 = X * sa + Y * ca;
      // pitch (tilt) about the screen-horizontal axis
      const y2 = y1 * ce - Zn * se;
      const z2 = y1 * se + Zn * ce;
      return { sx: cx + x1 * SCALE, sy: cy - z2 * SCALE, depth: y2 };
    };

    // surface quads
    const polys = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const p00 = project(xs[i], ys[j], Z[j][i]);
        const p10 = project(xs[i + 1], ys[j], Z[j][i + 1]);
        const p11 = project(xs[i + 1], ys[j + 1], Z[j + 1][i + 1]);
        const p01 = project(xs[i], ys[j + 1], Z[j + 1][i]);
        const zavg = (Z[j][i] + Z[j][i + 1] + Z[j + 1][i + 1] + Z[j + 1][i]) / 4;
        polys.push({
          pts: `${p00.sx.toFixed(1)},${p00.sy.toFixed(1)} ${p10.sx.toFixed(1)},${p10.sy.toFixed(1)} ${p11.sx.toFixed(1)},${p11.sy.toFixed(1)} ${p01.sx.toFixed(1)},${p01.sy.toFixed(1)}`,
          t: (zavg - zmin) / zr,
          depth: (p00.depth + p10.depth + p11.depth + p01.depth) / 4,
        });
      }
    }
    polys.sort((A, B) => B.depth - A.depth); // draw far quads first

    // faint base grid on the floor (z = zmin) for depth perception
    const baseLines = [];
    const step = Math.max(1, Math.round((n - 1) / 8));
    for (let i = 0; i < n; i += step) {
      const col = ys.map((y) => project(xs[i], y, zmin));
      const row = xs.map((x) => project(x, ys[i], zmin));
      baseLines.push(col.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' '));
      baseLines.push(row.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' '));
    }

    // axis end labels, placed at three corners of the floor
    const axes = [
      { ...project(xMax, yMin, zmin), label: xLabel },
      { ...project(xMin, yMax, zmin), label: yLabel },
      { ...project(xMin, yMin, zmax), label: zLabel },
    ];

    return { polys, baseLines, axes };
  }, [fn, xMin, xMax, yMin, yMax, n, yaw, pitch, zHeight, xLabel, yLabel, zLabel]);

  const onDown = (ev) => {
    drag.current = { x: ev.clientX, y: ev.clientY, yaw, pitch };
    if (ev.currentTarget.setPointerCapture) ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onMove = (ev) => {
    if (!drag.current) return;
    const dx = ev.clientX - drag.current.x;
    const dy = ev.clientY - drag.current.y;
    setYaw(drag.current.yaw + dx * 0.5);
    setPitch(Math.max(4, Math.min(82, drag.current.pitch + dy * 0.4)));
  };
  const onUp = () => {
    drag.current = null;
  };

  const yawDisp = Math.round((((yaw % 360) + 360) % 360));

  return (
    <LabCard badge={badge} title={title}>
      <div className={styles.controls}>
        <div className={styles.control}>
          <label>
            Rotate <b>{yawDisp}°</b>
          </label>
          <input type="range" aria-label="Rotate" min={0} max={360} step={1} value={yawDisp} onChange={(e) => setYaw(+e.target.value)} />
        </div>
        <div className={styles.control}>
          <label>
            Tilt <b>{Math.round(pitch)}°</b>
          </label>
          <input type="range" aria-label="Tilt" min={4} max={82} step={1} value={pitch} onChange={(e) => setPitch(+e.target.value)} />
        </div>
      </div>

      <div className={styles.chartWrap}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}: interactive 3D surface of ${zLabel} against ${xLabel} and ${yLabel}`}
          style={{ touchAction: 'none', cursor: 'grab', width: '100%' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          {baseLines.map((pts, i) => (
            <polyline key={'b' + i} points={pts} fill="none" stroke="var(--viz-axis)" strokeWidth={0.6} opacity={0.35} />
          ))}
          {polys.map((p, i) => (
            <polygon key={i} points={p.pts} fill={ramp(p.t)} stroke="var(--viz-axis)" strokeWidth={0.35} opacity={0.97} />
          ))}
          {axes.map((ax, i) => (
            <text key={'ax' + i} x={ax.sx} y={ax.sy} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--viz-muted)">
              {ax.label}
            </text>
          ))}
        </svg>
      </div>

      <p className={styles.hint}>
        {caption || 'Drag the surface to rotate it (or use the sliders). Height and color both show the z-value.'}
      </p>
    </LabCard>
  );
}
