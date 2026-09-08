import React, { useEffect, useRef, useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';

// ─── Math helpers ─────────────────────────────────────────────────────────────
function linspace(start, end, n) {
  return Array.from({ length: n }, (_, i) => start + (end - start) * i / (n - 1));
}
function meshgrid(xArr, yArr) {
  return [
    yArr.map(() => [...xArr]),
    yArr.map(y => Array(xArr.length).fill(y)),
  ];
}
// Standard normal CDF (Abramowitz & Stegun approximation)
function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422820 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815300 + t * (-0.3565637820 + t * (1.7814779370 + t * (-1.8212559780 + t * 1.3302744290))));
  return x > 0 ? 1 - p : p;
}

// ─── Box mesh3d (for Riemann bars) ───────────────────────────────────────────
function boxMesh(x0, x1, y0, y1, z0, z1, color) {
  return {
    type: 'mesh3d',
    x: [x0, x1, x1, x0, x0, x1, x1, x0],
    y: [y0, y0, y1, y1, y0, y0, y1, y1],
    z: [z0, z0, z0, z0, z1, z1, z1, z1],
    i: [0, 0, 4, 4, 0, 0, 1, 1, 2, 2, 3, 3],
    j: [1, 2, 5, 6, 1, 5, 2, 6, 3, 7, 0, 4],
    k: [2, 3, 6, 7, 5, 4, 6, 5, 7, 6, 4, 7],
    color,
    opacity: 0.78,
    showscale: false,
    hoverinfo: 'none',
  };
}

// ─── Viridis palette (8 colours) ─────────────────────────────────────────────
const VIRIDIS8 = ['#440154','#3b528b','#21918c','#5ec962','#fde725','#31688e','#35b779','#90d743'];

// ─── All chart data factories ─────────────────────────────────────────────────
const CHARTS = {

  // 1 ─ Riemann Sum ─────────────────────────────────────────────────────────
  'riemann-sum': () => {
    const n = 8;
    const xFine = linspace(0, Math.PI, 300);
    const yFine = xFine.map(xi => Math.sin(xi) + 1.5);
    const dx = Math.PI / n;

    const bars = Array.from({ length: n }, (_, i) => {
      const xi = (i + 0.5) * dx;
      const hi = Math.sin(xi) + 1.5;
      return boxMesh(i * dx, (i + 0.92) * dx, 0, 0.3, 0, hi, VIRIDIS8[i]);
    });

    return {
      data: [
        ...bars,
        {
          type: 'scatter3d', mode: 'lines',
          x: xFine, y: Array(300).fill(0), z: yFine,
          line: { color: 'red', width: 4 },
          name: 'f(x) = sin(x) + 1.5',
        },
      ],
      layout: {
        title: 'Riemann Sum (n=8 rectangles)<br>Area ≈ Σ f(xᵢ*)·Δx  →  ∫f(x)dx  as n→∞',
        scene: {
          xaxis: { title: 'X' },
          yaxis: { title: 'Depth', showticklabels: false },
          zaxis: { title: 'f(x)' },
        },
      },
    };
  },

  // 2 ─ Surface of Revolution ───────────────────────────────────────────────
  'surface-revolution': () => {
    const nX = 80, nT = 80;
    const xVals = linspace(0, Math.PI, nX);
    const rVals = xVals.map(xi => Math.sin(xi) + 1.5);
    const theta = linspace(0, 2 * Math.PI, nT);

    // Parametric surface: X=x, Y=r·cos θ, Z=r·sin θ  (shape: nT × nX)
    const Xs = theta.map(() => [...xVals]);
    const Ys = theta.map(t => rVals.map(r => r * Math.cos(t)));
    const Zs = theta.map(t => rVals.map(r => r * Math.sin(t)));

    return {
      data: [
        {
          type: 'surface', x: Xs, y: Ys, z: Zs,
          colorscale: 'YlOrBr', opacity: 0.85, showscale: false,
          name: 'Surface of Revolution',
        },
        {
          type: 'scatter3d', mode: 'lines',
          x: xVals, y: rVals, z: Array(nX).fill(0),
          line: { color: 'red', width: 4 },
          name: 'y = sin(x) + 1.5',
        },
      ],
      layout: {
        title: "Surface of Revolution<br>S = 2π ∫ f(x) √(1+[f'(x)]²) dx",
        scene: { xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' } },
      },
    };
  },

  // 3 ─ 3D Coordinate System ────────────────────────────────────────────────
  '3d-coordinates': () => {
    const P = [3, 4, 5];
    return {
      data: [
        {
          type: 'scatter3d', mode: 'markers+text',
          x: [P[0]], y: [P[1]], z: [P[2]],
          marker: { color: 'red', size: 8 },
          text: ['P(3, 4, 5)'], textposition: 'top center',
          name: 'P(3, 4, 5)',
        },
        { type: 'scatter3d', mode: 'lines', x: [P[0], P[0]], y: [P[1], P[1]], z: [0, P[2]], line: { color: 'black', width: 2, dash: 'dash' }, showlegend: false },
        { type: 'scatter3d', mode: 'lines', x: [P[0], P[0]], y: [0, P[1]], z: [0, 0], line: { color: 'black', width: 2, dash: 'dash' }, showlegend: false },
        { type: 'scatter3d', mode: 'lines', x: [0, P[0]], y: [P[1], P[1]], z: [0, 0], line: { color: 'black', width: 2, dash: 'dash' }, showlegend: false },
        { type: 'scatter3d', mode: 'markers', x: [P[0]], y: [P[1]], z: [0], marker: { color: 'gray', size: 5, symbol: 'cross' }, showlegend: false },
      ],
      layout: {
        title: '3D Coordinate System<br>d = √(Δx² + Δy² + Δz²)',
        scene: { xaxis: { title: 'X', range: [0, 5] }, yaxis: { title: 'Y', range: [0, 5] }, zaxis: { title: 'Z', range: [0, 6] } },
      },
    };
  },

  // 4 ─ Helix with Tangent Vector ───────────────────────────────────────────
  'helix-tangent': () => {
    const n = 500;
    const t = linspace(0, 4 * Math.PI, n);
    const x = t.map(ti => Math.cos(ti));
    const y = t.map(ti => Math.sin(ti));
    const z = [...t];

    const t0 = Math.PI / 4;
    const p0 = [Math.cos(t0), Math.sin(t0), t0];
    const dp = [-Math.sin(t0) * 0.7, Math.cos(t0) * 0.7, 0.7];

    return {
      data: [
        { type: 'scatter3d', mode: 'lines', x, y, z, line: { color: 'royalblue', width: 3 }, name: 'r(t) = ⟨cos t, sin t, t⟩' },
        {
          type: 'cone',
          x: [p0[0]], y: [p0[1]], z: [p0[2]],
          u: [dp[0]], v: [dp[1]], w: [dp[2]],
          colorscale: [[0, 'red'], [1, 'red']],
          showscale: false, sizemode: 'absolute', sizeref: 0.5,
          anchor: 'tail', name: "r'(t) tangent",
        },
        { type: 'scatter3d', mode: 'markers', x: [p0[0]], y: [p0[1]], z: [p0[2]], marker: { color: 'red', size: 5 }, showlegend: false },
        {
          type: 'scatter3d', mode: 'lines',
          x: t.map(ti => Math.cos(ti)), y: t.map(ti => Math.sin(ti)), z: Array(n).fill(0),
          line: { color: 'gray', width: 1, dash: 'dash' }, opacity: 0.4, name: 'projection',
        },
      ],
      layout: {
        title: "Helix r(t) = ⟨cos t, sin t, t⟩<br>with tangent vector r'(t) = ⟨−sin t, cos t, 1⟩",
        scene: { xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' } },
      },
    };
  },

  // 5 ─ Multivariable Surface + Level Curves ────────────────────────────────
  'multivariable-surface': () => {
    const n = 80;
    const xArr = linspace(-3, 3, n);
    const yArr = linspace(-3, 3, n);
    const Z = yArr.map((y, j) => xArr.map((x, i) =>
      Math.sin(Math.sqrt(x * x + y * y)) * Math.exp(-0.18 * (x * x + y * y))
    ));

    return {
      data: [{
        type: 'surface', x: xArr, y: yArr, z: Z,
        colorscale: 'Viridis', opacity: 0.92,
        contours: {
          z: { show: true, usecolormap: true, highlightcolor: '#42f462', project: { z: true } },
        },
        name: 'z = f(x,y)',
      }],
      layout: {
        title: 'Functions of Several Variables<br>z = sin(√(x²+y²)) · e^(−0.18(x²+y²))',
        scene: { xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' } },
      },
    };
  },

  // 6 ─ Partial Derivatives ─────────────────────────────────────────────────
  'partial-derivatives': () => {
    const n = 60;
    const xArr = linspace(-2, 2, n);
    const yArr = linspace(-2, 2, n);
    const Z = yArr.map(y => xArr.map(x => x * x + 0.5 * y * y));

    return {
      data: [
        { type: 'surface', x: xArr, y: yArr, z: Z, colorscale: 'Plasma', opacity: 0.50, showscale: false, name: 'f(x,y) = x² + 0.5y²' },
        { type: 'scatter3d', mode: 'lines', x: xArr, y: Array(n).fill(0), z: xArr.map(x => x * x), line: { color: 'red', width: 4 }, name: '∂f/∂x slice (y=0)' },
        { type: 'scatter3d', mode: 'lines', x: Array(n).fill(0), y: xArr, z: xArr.map(y => 0.5 * y * y), line: { color: 'blue', width: 4 }, name: '∂f/∂y slice (x=0)' },
      ],
      layout: {
        title: 'f(x,y) = x² + 0.5y²<br>Partial-Derivative Cross-Sections (red=∂f/∂x, blue=∂f/∂y)',
        scene: { xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' } },
      },
    };
  },

  // 7 ─ Tangent Plane ───────────────────────────────────────────────────────
  'tangent-plane': () => {
    const n = 50;
    const xArr = linspace(-2, 2, n);
    const yArr = linspace(-2, 2, n);
    const Z = yArr.map(y => xArr.map(x => x * x + y * y));
    const a = 1, b = 1, fab = 2;
    const ZPlane = yArr.map(y => xArr.map(x => fab + 2 * (x - a) + 2 * (y - b)));

    return {
      data: [
        { type: 'surface', x: xArr, y: yArr, z: Z, colorscale: 'Blues', opacity: 0.55, name: 'Surface z = x² + y²' },
        { type: 'surface', x: xArr, y: yArr, z: ZPlane, colorscale: [[0, 'orange'], [1, 'orange']], opacity: 0.40, showscale: false, name: 'Tangent Plane at (1,1,2)' },
        { type: 'scatter3d', mode: 'markers+text', x: [a], y: [b], z: [fab], marker: { color: 'red', size: 10 }, text: ['(a, b, f(a,b))'], textposition: 'top center', name: 'Point of tangency' },
      ],
      layout: {
        title: 'Tangent Plane to z = x² + y² at (1, 1, 2)<br>z − f(a,b) = fₓ(a,b)(x−a) + fᵧ(a,b)(y−b)',
        scene: { xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' } },
      },
    };
  },

  // 8 ─ Gradient Vectors ────────────────────────────────────────────────────
  'gradient-vectors': () => {
    const n = 120;
    const xArr = linspace(-3, 3, n);
    const yArr = linspace(-3, 3, n);
    const Z = yArr.map(y => xArr.map(x => x * x + 2 * y * y));

    // Gradient arrows as line segments (null-separated for speed)
    const gn = 10;
    const gx = linspace(-2.5, 2.5, gn);
    const gy = linspace(-2.5, 2.5, gn);
    const lineX = [], lineY = [], tipX = [], tipY = [], tipAngle = [];
    const scale = 0.28;

    for (let j = 0; j < gn; j++) {
      for (let i = 0; i < gn; i++) {
        const cx = gx[i], cy = gy[j];
        const dx = 2 * cx, dy = 4 * cy;
        const mag = Math.sqrt(dx * dx + dy * dy) + 1e-8;
        const nx = dx / mag * scale, ny = dy / mag * scale;
        lineX.push(cx, cx + nx, null);
        lineY.push(cy, cy + ny, null);
        tipX.push(cx + nx);
        tipY.push(cy + ny);
        tipAngle.push(-Math.atan2(ny, nx) * 180 / Math.PI + 90);
      }
    }

    return {
      data: [
        { type: 'contour', x: xArr, y: yArr, z: Z, colorscale: 'RdYlGn', ncontours: 18, showscale: true, colorbar: { title: 'f(x,y)' }, name: 'f(x,y) = x² + 2y²' },
        { type: 'scatter', mode: 'lines', x: lineX, y: lineY, line: { color: 'black', width: 1.5 }, showlegend: false, hoverinfo: 'none' },
        { type: 'scatter', mode: 'markers', x: tipX, y: tipY, marker: { symbol: 'triangle-up', size: 8, color: 'black', angle: tipAngle }, showlegend: false, hoverinfo: 'none' },
      ],
      layout: {
        title: '∇f = ⟨2x, 4y⟩ — arrows point toward STEEPEST ASCENT (⊥ to level curves)',
        xaxis: { title: 'X', scaleanchor: 'y' },
        yaxis: { title: 'Y' },
        height: 550,
      },
    };
  },

  // 9 ─ Critical Points (saddle / min / max) ────────────────────────────────
  'critical-points': () => {
    const n = 50;
    const xArr = linspace(-2, 2, n);
    const yArr = linspace(-2, 2, n);
    const saddle  = yArr.map(y => xArr.map(x =>  x * x - y * y));
    const localMin = yArr.map(y => xArr.map(x =>  x * x + y * y));
    const localMax = yArr.map(y => xArr.map(x => -(x * x + y * y)));

    const dot = (Z, scene, name) => ({ type: 'scatter3d', mode: 'markers', x: [0], y: [0], z: [0], marker: { color: 'red', size: 7 }, scene, name, showlegend: false });

    return {
      data: [
        { type: 'surface', x: xArr, y: yArr, z: saddle,   colorscale: 'RdBu',  opacity: 0.85, showscale: false, scene: 'scene',  name: 'Saddle  z = x²−y²' },
        dot(saddle, 'scene', 's'),
        { type: 'surface', x: xArr, y: yArr, z: localMin,  colorscale: 'Blues', opacity: 0.85, showscale: false, scene: 'scene2', name: 'Min  z = x²+y²' },
        dot(localMin, 'scene2', 'm'),
        { type: 'surface', x: xArr, y: yArr, z: localMax,  colorscale: 'Reds',  opacity: 0.85, showscale: false, scene: 'scene3', name: 'Max  z = −x²−y²' },
        dot(localMax, 'scene3', 'x'),
      ],
      layout: {
        title: 'Critical Points — Second Derivative Test  D = fₓₓ·fᵧᵧ − (fₓᵧ)²',
        scene:  { domain: { x: [0.00, 0.30], y: [0, 1] }, xaxis: { title: '' }, yaxis: { title: '' }, zaxis: { title: '' }, annotations: [{ x: 0, y: 0, z: 0, text: 'Saddle (D<0)', showarrow: false }] },
        scene2: { domain: { x: [0.35, 0.65], y: [0, 1] }, xaxis: { title: '' }, yaxis: { title: '' }, zaxis: { title: '' } },
        scene3: { domain: { x: [0.70, 1.00], y: [0, 1] }, xaxis: { title: '' }, yaxis: { title: '' }, zaxis: { title: '' } },
        height: 500,
        annotations: [
          { x: 0.15, y: 1.05, xref: 'paper', yref: 'paper', text: 'Saddle Point (D<0)', showarrow: false, font: { size: 12 } },
          { x: 0.50, y: 1.05, xref: 'paper', yref: 'paper', text: 'Local Minimum (D>0, fₓₓ>0)', showarrow: false, font: { size: 12 } },
          { x: 0.85, y: 1.05, xref: 'paper', yref: 'paper', text: 'Local Maximum (D>0, fₓₓ<0)', showarrow: false, font: { size: 12 } },
        ],
      },
    };
  },

  // 10 ─ Double Integral Volume ─────────────────────────────────────────────
  'double-integral': () => {
    const n = 50;
    const xArr = linspace(0, 2, n);
    const yArr = linspace(0, 2, n);
    const Z = yArr.map(y => xArr.map(x => Math.max(0, 4 - x * x - y * y)));

    return {
      data: [
        {
          type: 'surface', x: xArr, y: yArr, z: Z,
          colorscale: 'Viridis', opacity: 0.82,
          contours: { z: { show: true, usecolormap: true, project: { z: true } } },
          name: 'f(x,y) = 4 − x² − y²',
        },
        { type: 'surface', x: xArr, y: yArr, z: yArr.map(() => Array(n).fill(0)), colorscale: [[0, 'lightblue'], [1, 'lightblue']], opacity: 0.22, showscale: false, name: 'xy-plane base' },
      ],
      layout: {
        title: 'Double Integral ∬_R f(x,y) dA = Volume under surface<br>f(x,y) = 4 − x² − y²',
        scene: { xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'f(x,y)' } },
      },
    };
  },

  // 11 ─ Coordinate Systems (Cylindrical + Spherical) ───────────────────────
  'coordinate-systems': () => {
    const nT = 80;
    const theta = linspace(0, 2 * Math.PI, nT);
    const nZ = 30;
    const zArr = linspace(0, 3, nZ);
    const rCyl = 1.5;

    // Cylinder surface (nZ × nT)
    const cylX = zArr.map(() => theta.map(t => rCyl * Math.cos(t)));
    const cylY = zArr.map(() => theta.map(t => rCyl * Math.sin(t)));
    const cylZ = zArr.map(zi => Array(nT).fill(zi));

    const r0 = 1.5, th0 = Math.PI / 3, z0 = 2.0;
    const px1 = r0 * Math.cos(th0), py1 = r0 * Math.sin(th0);

    // Sphere surface (nT × nT)
    const phi = linspace(0, Math.PI, nT);
    const rho = 2.0;
    const sphX = theta.map(t => phi.map(p => rho * Math.sin(p) * Math.cos(t)));
    const sphY = theta.map(t => phi.map(p => rho * Math.sin(p) * Math.sin(t)));
    const sphZ = theta.map(() => phi.map(p => rho * Math.cos(p)));

    const rho0 = 2.0, phi0 = Math.PI / 4, the0 = Math.PI / 3;
    const px2 = rho0 * Math.sin(phi0) * Math.cos(the0);
    const py2 = rho0 * Math.sin(phi0) * Math.sin(the0);
    const pz2 = rho0 * Math.cos(phi0);

    return {
      data: [
        // Cylindrical
        { type: 'surface', x: cylX, y: cylY, z: cylZ, colorscale: [[0, 'cyan'], [1, 'cyan']], opacity: 0.18, showscale: false, scene: 'scene',  name: 'Cylinder' },
        { type: 'scatter3d', mode: 'markers', x: [px1], y: [py1], z: [z0], marker: { color: 'red', size: 8 }, scene: 'scene', name: `P(r=1.5, θ=π/3, z=2)` },
        { type: 'scatter3d', mode: 'lines', x: [0, px1], y: [0, py1], z: [z0, z0], line: { color: 'red', width: 2, dash: 'dash' }, scene: 'scene', name: 'r', showlegend: false },
        { type: 'scatter3d', mode: 'lines', x: [px1, px1], y: [py1, py1], z: [0, z0], line: { color: 'green', width: 2, dash: 'dash' }, scene: 'scene', name: 'z', showlegend: false },
        // Spherical
        { type: 'surface', x: sphX, y: sphY, z: sphZ, colorscale: [[0, 'lightgreen'], [1, 'lightgreen']], opacity: 0.18, showscale: false, scene: 'scene2', name: 'Sphere ρ=2' },
        { type: 'scatter3d', mode: 'markers', x: [px2], y: [py2], z: [pz2], marker: { color: 'red', size: 8 }, scene: 'scene2', name: `P(ρ=2, φ=π/4, θ=π/3)` },
        { type: 'scatter3d', mode: 'lines', x: [0, px2], y: [0, py2], z: [0, pz2], line: { color: 'red', width: 2 }, scene: 'scene2', name: 'ρ', showlegend: false },
      ],
      layout: {
        title: '3D Coordinate Systems',
        scene:  { domain: { x: [0.00, 0.48], y: [0, 1] }, xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' } },
        scene2: { domain: { x: [0.52, 1.00], y: [0, 1] }, xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' } },
        height: 520,
        annotations: [
          { x: 0.24, y: 1.04, xref: 'paper', yref: 'paper', text: 'Cylindrical (r, θ, z)  dV = r dz dr dθ', showarrow: false, font: { size: 13 } },
          { x: 0.76, y: 1.04, xref: 'paper', yref: 'paper', text: 'Spherical (ρ, φ, θ)  dV = ρ² sin φ dρ dφ dθ', showarrow: false, font: { size: 13 } },
        ],
      },
    };
  },

  // 12 ─ 3D Vector Field ─────────────────────────────────────────────────────
  'vector-field-3d': () => {
    const pts = [-2, -1, 0, 1, 2];
    const X = [], Y = [], Z = [], U = [], V = [], W = [];
    for (const z of pts) for (const y of pts) for (const x of pts) {
      X.push(x); Y.push(y); Z.push(z);
      U.push(-y * 0.35); V.push(x * 0.35); W.push(z * 0.12);
    }

    return {
      data: [{
        type: 'cone',
        x: X, y: Y, z: Z, u: U, v: V, w: W,
        colorscale: 'Blues',
        sizemode: 'absolute', sizeref: 0.45,
        showscale: true,
        colorbar: { title: '|F|' },
        anchor: 'tail',
        name: 'F = ⟨−y, x, z/3⟩',
      }],
      layout: {
        title: '3D Vector Field  F = ⟨−y, x, z/3⟩<br>curl F ≠ 0 (rotation about z-axis)',
        scene: { xaxis: { title: 'X' }, yaxis: { title: 'Y' }, zaxis: { title: 'Z' }, aspectmode: 'cube' },
      },
    };
  },

  // 13 ─ Black-Scholes (Call Price + Delta) ─────────────────────────────────
  'black-scholes': () => {
    const K = 100, r = 0.05, sigma = 0.20;
    const nS = 60, nT = 60;
    const S = linspace(60, 150, nS);
    const T = linspace(0.02, 2.0, nT);

    const bsCall = (s, t) => {
      const tt = Math.max(t, 1e-6);
      const d1 = (Math.log(s / K) + (r + 0.5 * sigma * sigma) * tt) / (sigma * Math.sqrt(tt));
      const d2 = d1 - sigma * Math.sqrt(tt);
      return s * normCDF(d1) - K * Math.exp(-r * tt) * normCDF(d2);
    };
    const delta = (s, t) => {
      const tt = Math.max(t, 1e-6);
      const d1 = (Math.log(s / K) + (r + 0.5 * sigma * sigma) * tt) / (sigma * Math.sqrt(tt));
      return normCDF(d1);
    };

    const V = T.map(ti => S.map(si => bsCall(si, ti)));
    const D = T.map(ti => S.map(si => delta(si, ti)));

    return {
      data: [
        { type: 'surface', x: S, y: T, z: V, colorscale: 'RdYlGn', opacity: 0.90, scene: 'scene',  name: 'Call Price V', colorbar: { title: 'V ($)', x: 0.45, len: 0.8 } },
        { type: 'surface', x: S, y: T, z: D, colorscale: 'RdBu',   opacity: 0.90, scene: 'scene2', name: 'Delta Δ',       colorbar: { title: 'Δ',    x: 1.00, len: 0.8 } },
      ],
      layout: {
        title: 'Quant Finance — Option Greeks as Partial Derivatives',
        scene:  { domain: { x: [0.00, 0.48], y: [0, 1] }, xaxis: { title: 'Stock Price S' }, yaxis: { title: 'Time T' }, zaxis: { title: 'V ($)' } },
        scene2: { domain: { x: [0.52, 1.00], y: [0, 1] }, xaxis: { title: 'Stock Price S' }, yaxis: { title: 'Time T' }, zaxis: { title: 'Δ = ∂V/∂S' } },
        height: 520,
        annotations: [
          { x: 0.24, y: 1.04, xref: 'paper', yref: 'paper', text: 'Call Price V(S,T)  —  slope ∂V/∂S = Delta', showarrow: false, font: { size: 12 } },
          { x: 0.76, y: 1.04, xref: 'paper', yref: 'paper', text: 'Delta Δ(S,T) = ∂V/∂S  —  curvature = Gamma', showarrow: false, font: { size: 12 } },
        ],
      },
    };
  },
};

// ─── Plotly CDN loader (shared promise to avoid double-loading) ───────────────
let _plotlyPromise = null;
function loadPlotly() {
  if (_plotlyPromise) return _plotlyPromise;
  if (typeof window !== 'undefined' && window.Plotly) return Promise.resolve(window.Plotly);
  _plotlyPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.plot.ly/plotly-2.26.0.min.js';
    s.charset = 'utf-8';
    s.onload = () => resolve(window.Plotly);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return _plotlyPromise;
}

// ─── Inner chart component (browser-only) ────────────────────────────────────
function PlotlyChart({ chartName }) {
  const divRef = useRef(null);
  const [ready, setReady] = useState(false);

  const def = CHARTS[chartName];

  // NOTE: every hook must run on every render. The "chart not found" early
  // return lives *below* this effect — putting it above skipped the hook on
  // that render path, and React then throws "rendered fewer hooks than
  // expected" as soon as an unknown chart name reaches this component.
  useEffect(() => {
    if (!def) return undefined;
    const { data, layout } = def();
    loadPlotly().then(Plotly => {
      if (!divRef.current) return;
      const fullLayout = {
        ...layout,
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit' },
        margin: { t: 80, r: 20, b: 50, l: 20 },
        height: layout.height || 500,
      };
      Plotly.newPlot(divRef.current, data, fullLayout, { responsive: true, displayModeBar: true });
      setReady(true);
    }).catch(err => console.error('Plotly load failed:', err));

    return () => {
      if (divRef.current && window.Plotly) window.Plotly.purge(divRef.current);
    };
  }, [chartName, def]);

  if (!def) return <div style={{ color: 'red', padding: '1rem' }}>Chart "{chartName}" not found.</div>;

  return (
    <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
      {!ready && (
        <div style={{
          height: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--ifm-color-emphasis-100, #f5f5f5)', borderRadius: 8,
          border: '1px solid var(--ifm-color-emphasis-300, #ddd)', color: '#666', fontSize: 15,
        }}>
          Loading 3D visualization…
        </div>
      )}
      <div ref={divRef} style={{ width: '100%', height: ready ? (CHARTS[chartName]?.()?.layout?.height || 500) : 0 }} />
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────
export default function CalcPlot({ name }) {
  return (
    <BrowserOnly
      fallback={
        <div style={{
          height: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--ifm-color-emphasis-100, #f5f5f5)', borderRadius: 8,
          border: '1px solid var(--ifm-color-emphasis-300, #ddd)', color: '#666', fontSize: 15,
        }}>
          Loading visualization…
        </div>
      }
    >
      {() => <PlotlyChart chartName={name} />}
    </BrowserOnly>
  );
}
