// Shared math + SVG helpers for the interactive labs.

export function linspace(a, b, n) {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

// Standard normal PDF / CDF (Abramowitz & Stegun 7.1.26 for the CDF)
export function normPDF(x, mu = 0, sigma = 1) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}
export function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

// Box–Muller standard normal sample
export function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Linear scale: data domain -> pixel range
export function scaleLinear([d0, d1], [r0, r1]) {
  const m = (r1 - r0) / (d1 - d0 || 1);
  const s = (x) => r0 + (x - d0) * m;
  s.invert = (px) => d0 + (px - r0) / m;
  return s;
}

// SVG path from [x, y] pixel points
export function linePath(pts) {
  if (!pts.length) return '';
  return pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join('');
}

// "Nice" tick values covering [min, max]
export function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step0 = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (count * step0) / span;
  let step = step0;
  if (err <= 0.15) step = step0 * 10;
  else if (err <= 0.35) step = step0 * 5;
  else if (err <= 0.75) step = step0 * 2;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    ticks.push(+v.toFixed(10));
  }
  return ticks;
}

export function fmt(x, digits = 2) {
  if (!isFinite(x)) return '—';
  const ax = Math.abs(x);
  if (ax >= 1e6) return (x / 1e6).toFixed(1) + 'M';
  if (ax >= 1e4) return Math.round(x).toLocaleString('en-US');
  return x.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function fmtMoney(x, digits = 2) {
  if (!isFinite(x)) return '—';
  const sign = x < 0 ? '−$' : '$';
  return sign + fmt(Math.abs(x), digits);
}
