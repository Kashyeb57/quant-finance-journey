import React, { useEffect, useRef, useState } from 'react';
import styles from './styles.module.css';

/*
 * Implied-volatility surface as a rotating 3-D wireframe, drawn on a canvas.
 *   x = moneyness K/S, y = days to expiry, z = implied vol (OTM side).
 * Drag to rotate (yaw) and tilt (pitch). Lines are coloured by height, teal
 * (low IV) to green (high IV), like the reference layout.
 */

const LOW = [56, 189, 248];   // sky-400
const HIGH = [74, 222, 128];  // green-400
const mix = (t) => LOW.map((c, i) => Math.round(c + (HIGH[i] - c) * t));

// Linearly interpolate between expiries so the mesh reads as a surface rather
// than a handful of smiles. Keeps the first and last expiry exactly.
function densify(rows, n) {
  if (rows.length >= n) return rows;
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * (rows.length - 1);
    const a = rows[Math.floor(f)], b = rows[Math.min(rows.length - 1, Math.floor(f) + 1)];
    const t = f - Math.floor(f);
    out.push({ days: a.days + (b.days - a.days) * t, z: a.z.map((v, j) => v + (b.z[j] - v) * t) });
  }
  return out;
}

export default function IvSurface({ surface, dark }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [view, setView] = useState({ yaw: -0.6, pitch: 0.42 });
  const dragRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const draw = () => {
      const W = wrap.clientWidth, H = wrap.clientHeight;
      if (!W || !H) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!surface) return;

      const { m, zMin, zMax } = surface;
      const rows = densify(surface.rows, 16);
      const zSpan = zMax - zMin || 1;
      const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw);
      const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
      // unit cube: x,y in [-1,1], z in [0,1] -> unscaled screen coords
      const raw = (x, y, z) => {
        const rx = x * cy - y * sy;
        const ry = x * sy + y * cy;
        return [rx, ry * sp - z * cp * 1.8];
      };
      // fit the box's 8 corners into the canvas (with room for labels)
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [0, 1]) {
        const [a, b] = raw(x, y, z);
        x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
      }
      const pad = 26;
      const scale = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (y1 - y0));
      const ox = W / 2 - ((x0 + x1) / 2) * scale, oy = H / 2 - ((y0 + y1) / 2) * scale;
      const proj = (x, y, z) => {
        const [a, b] = raw(x, y, z);
        return [ox + a * scale, oy + b * scale];
      };
      const X = (j) => (j / (m.length - 1)) * 2 - 1;
      const Y = (i) => (i / (rows.length - 1)) * 2 - 1;
      const Z = (v) => (v - zMin) / zSpan;

      // floor + back walls
      const grid = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeStyle = grid;
      for (let t = -1; t <= 1.001; t += 0.5) {
        let a = proj(t, -1, 0), b = proj(t, 1, 0);
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
        a = proj(-1, t, 0); b = proj(1, t, 0);
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      }
      for (let z = 0; z <= 1.001; z += 0.25) {
        const a = proj(-1, 1, z), b = proj(1, 1, z), c = proj(-1, -1, z);
        ctx.beginPath(); ctx.moveTo(...c); ctx.lineTo(...a); ctx.lineTo(...b); ctx.stroke();
      }

      // the mesh: one polyline per expiry, one per moneyness column
      const seg = (p, q, zAvg) => {
        const [r, g, b] = mix(zAvg);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
        ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
      };
      ctx.lineWidth = 0.9;
      for (let i = 0; i < rows.length; i++) {
        for (let j = 1; j < m.length; j++) {
          const z0 = Z(rows[i].z[j - 1]), z1 = Z(rows[i].z[j]);
          seg(proj(X(j - 1), Y(i), z0), proj(X(j), Y(i), z1), (z0 + z1) / 2);
        }
      }
      for (let j = 0; j < m.length; j++) {
        for (let i = 1; i < rows.length; i++) {
          const z0 = Z(rows[i - 1].z[j]), z1 = Z(rows[i].z[j]);
          seg(proj(X(j), Y(i - 1), z0), proj(X(j), Y(i), z1), (z0 + z1) / 2);
        }
      }

      // axis labels
      ctx.fillStyle = dark ? 'rgba(203,213,225,0.75)' : 'rgba(51,65,85,0.8)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      const lbl = (txt, p, dy = 12) => ctx.fillText(txt, p[0], p[1] + dy);
      lbl(`K/S ${m[0].toFixed(2)}`, proj(-1, -1, 0), 14);
      lbl(`${m[m.length - 1].toFixed(2)}`, proj(1, -1, 0), 14);
      lbl(`${Math.max(1, Math.round(rows[rows.length - 1].days))}d`, proj(1, 1, 0), 14);
      lbl(`IV ${(zMax * 100).toFixed(0)}%`, proj(-1, 1, 1), -6);
      lbl(`${(zMin * 100).toFixed(0)}%`, proj(-1, 1, 0), -6);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [surface, view, dark]);

  const onDown = (e) => {
    const p = e.touches ? e.touches[0] : e;
    dragRef.current = { x: p.clientX, y: p.clientY, ...view };
  };
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const p = e.touches ? e.touches[0] : e;
      setView({
        yaw: d.yaw + (p.clientX - d.x) * 0.01,
        pitch: Math.max(0.15, Math.min(1.3, d.pitch + (p.clientY - d.y) * 0.008)),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={styles.surface}
      onMouseDown={onDown}
      onTouchStart={onDown}
      role="img"
      aria-label="Implied volatility surface by moneyness and expiry. Drag to rotate."
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
