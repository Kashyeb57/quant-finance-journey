import {useEffect, useState} from 'react';
import clsx from 'clsx';
import katex from 'katex';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import {getQuotes} from '@site/src/lib/market';
import usePolling from '@site/src/lib/usePolling';
import {fmtPrice, fmtClockCT} from '@site/src/lib/format';
import styles from './index.module.css';

// Render a LaTeX string to KaTeX HTML for the hero equation chips.
function tex(s) {
  return {__html: katex.renderToString(s, {throwOnError: false})};
}

// ── Monochrome inline-SVG icon set (stroke = currentColor, 1.5px, 24px) ──
const P = {fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round'};
function Icon({name}) {
  const svg = {
    finance: (
      <>
        <line x1="4" y1="20" x2="20" y2="20" {...P} />
        <rect x="6" y="9" width="3" height="7" {...P} /><line x1="7.5" y1="6" x2="7.5" y2="9" {...P} /><line x1="7.5" y1="16" x2="7.5" y2="18" {...P} />
        <rect x="12.5" y="12" width="3" height="5" {...P} /><line x1="14" y1="9" x2="14" y2="12" {...P} /><line x1="14" y1="17" x2="14" y2="19" {...P} />
        <path d="M18 5l0 6" {...P} /><rect x="16.5" y="7" width="3" height="4" {...P} />
      </>
    ),
    math: (
      <>
        <path d="M17 5H7l6 7-6 7h10" {...P} />
      </>
    ),
    stats: (
      <>
        <path d="M4 5v15h16" {...P} />
        <path d="M4 15c3 0 3-7 6-7s3 5 6 5 3-6 4-6" {...P} />
      </>
    ),
    probability: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" {...P} />
        <circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none" />
      </>
    ),
    code: (
      <>
        <path d="M8.5 8L4.5 12l4 4" {...P} />
        <path d="M15.5 8l4 4-4 4" {...P} />
        <line x1="13" y1="6" x2="11" y2="18" {...P} />
      </>
    ),
    econ: (
      <>
        <path d="M4 20L20 4" {...P} />
        <path d="M4 8c5 0 11 4 16 8" {...P} opacity="0.55" />
        <path d="M4 15c5-4 11-8 16-8" {...P} opacity="0.55" />
      </>
    ),
    ml: (
      <>
        <circle cx="5" cy="12" r="2" {...P} /><circle cx="14" cy="6" r="2" {...P} /><circle cx="14" cy="18" r="2" {...P} /><circle cx="20" cy="12" r="2" {...P} />
        <path d="M7 12l5-5M7 12l5 5M16 7l3 4M16 17l3-4" {...P} />
      </>
    ),
    notebook: (
      <>
        <rect x="5" y="4" width="14" height="16" rx="2" {...P} />
        <line x1="9" y1="4" x2="9" y2="20" {...P} />
        <line x1="12" y1="9" x2="16" y2="9" {...P} /><line x1="12" y1="13" x2="16" y2="13" {...P} />
      </>
    ),
    run: (
      <>
        <circle cx="12" cy="12" r="8.5" {...P} />
        <path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none" />
      </>
    ),
    labs: (
      <>
        <line x1="4" y1="8" x2="20" y2="8" {...P} /><circle cx="9" cy="8" r="2.2" {...P} fill="var(--surface)" />
        <line x1="4" y1="16" x2="20" y2="16" {...P} /><circle cx="15" cy="16" r="2.2" {...P} fill="var(--surface)" />
      </>
    ),
    quiz: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" {...P} />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" {...P} />
      </>
    ),
    terminal: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" {...P} />
        <path d="M7 10l2.5 2L7 14" {...P} /><line x1="12" y1="14" x2="16" y2="14" {...P} />
      </>
    ),
  }[name];
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      {svg}
    </svg>
  );
}

const SUBJECTS = [
  {icon: 'finance', title: 'Finance', blurb: 'Options, payoffs and Black–Scholes, with live labs you can drag and explore.', meta: 'Pricer · Greeks · payoff explorer', status: 'live', to: '/docs/Finance/derivatives'},
  {icon: 'math', title: 'Mathematics', blurb: 'Calculus, linear algebra, and the stochastic calculus behind every pricing model.', meta: 'Live GBM simulator · runnable Python', status: 'live', to: '/docs/Mathematics/stochastic-calculus'},
  {icon: 'stats', title: 'Statistics', blurb: 'Inference, regression and time series — drawing conclusions you can defend.', meta: 'ANOVA · Bayes · hypothesis labs', status: 'live', to: '/docs/Statistics/bayesian-inference'},
  {icon: 'probability', title: 'Probability', blurb: 'Distributions and stochastic processes — the language uncertainty is written in.', meta: 'Interactive bell-curve lab · CLT', status: 'live', to: '/docs/Probability/distributions'},
  {icon: 'code', title: 'Programming', blurb: 'A full Python course where every code block runs in your browser — no setup at all.', meta: 'Five modules · FIFO ledger project', status: 'live', to: '/docs/Programming/Python'},
  {icon: 'econ', title: 'Economics', blurb: 'Rates, macro and policy — the forces that move the markets quants model.', meta: 'Compound-interest lab · quiz', status: 'progress', to: '/docs/Economics/interest-rates'},
  {icon: 'ml', title: 'Machine Learning', blurb: 'From regression to deep learning, aimed squarely at financial applications.', meta: 'Eight lessons · scikit-learn', status: 'live', to: '/docs/Machine_Learning/overview'},
];

const FEATURES = [
  {icon: 'notebook', title: 'A real Python notebook', blurb: 'Jupyter-style cells with numpy, pandas and matplotlib — running fully in your browser.', to: '/notebook'},
  {icon: 'run', title: 'Runnable Python', blurb: 'Every Python snippet on the site has a Run button. Edit it, break it, learn from it.', to: '/docs/Programming/Python'},
  {icon: 'labs', title: 'Interactive labs', blurb: 'Price options with sliders, simulate Brownian motion, bend the bell curve.', to: '/docs/Finance/derivatives'},
  {icon: 'quiz', title: 'Quizzes on completed topics', blurb: 'Instant-feedback questions with explanations at the end of every finished lesson.', to: '/tutorial'},
  {icon: 'terminal', title: 'A live market terminal', blurb: 'Charts and market news, right inside the site — theory meets the tape.', to: '/terminal'},
];

// ── The Tearsheet: a two-series equity curve drawn inside the terminal ──
const EQUITY = [[44.00, 229.07], [46.39, 229.55], [48.78, 224.96], [51.17, 225.53], [53.56, 227.37], [55.95, 224.72], [58.34, 224.61], [60.72, 225.74], [63.11, 226.44], [65.50, 225.96], [67.89, 222.13], [70.28, 221.80], [72.67, 218.26], [75.06, 217.02], [77.45, 216.72], [79.84, 218.27], [82.23, 215.16], [84.62, 211.49], [87.01, 211.42], [89.40, 214.48], [91.79, 211.12], [94.17, 213.82], [96.56, 219.69], [98.95, 219.18], [101.34, 217.45], [103.73, 219.09], [106.12, 220.59], [108.51, 215.15], [110.90, 214.62], [113.29, 214.96], [115.68, 216.70], [118.07, 213.59], [120.46, 214.12], [122.85, 212.54], [125.23, 213.59], [127.62, 214.03], [130.01, 212.41], [132.40, 214.38], [134.79, 214.85], [137.18, 214.81], [139.57, 219.65], [141.96, 216.55], [144.35, 217.10], [146.74, 221.02], [149.13, 218.23], [151.52, 216.21], [153.91, 213.93], [156.30, 215.88], [158.68, 212.83], [161.07, 210.54], [163.46, 207.62], [165.85, 207.61], [168.24, 210.17], [170.63, 213.31], [173.02, 216.03], [175.41, 217.32], [177.80, 219.29], [180.19, 223.20], [182.58, 222.94], [184.97, 228.14], [187.36, 225.78], [189.74, 221.38], [192.13, 221.62], [194.52, 219.93], [196.91, 219.95], [199.30, 215.68], [201.69, 213.51], [204.08, 213.65], [206.47, 212.77], [208.86, 207.04], [211.25, 208.42], [213.64, 208.27], [216.03, 208.59], [218.42, 209.57], [220.81, 209.42], [223.19, 203.84], [225.58, 204.68], [227.97, 202.48], [230.36, 198.40], [232.75, 201.37], [235.14, 199.29], [237.53, 199.48], [239.92, 195.81], [242.31, 190.79], [244.70, 181.44], [247.09, 177.57], [249.48, 180.49], [251.87, 165.80], [254.26, 158.68], [256.64, 162.90], [259.03, 157.47], [261.42, 161.52], [263.81, 169.05], [266.20, 175.37], [268.59, 172.85], [270.98, 167.97], [273.37, 163.56], [275.76, 165.19], [278.15, 143.94], [280.54, 139.17], [282.93, 139.88], [285.32, 132.92], [287.70, 123.46], [290.09, 119.27], [292.48, 117.00], [294.87, 129.25], [297.26, 148.61], [299.65, 136.11], [302.04, 138.07], [304.43, 144.52], [306.82, 129.27], [309.21, 131.36], [311.60, 115.76], [313.99, 125.62], [316.38, 122.33], [318.77, 109.01], [321.15, 97.66], [323.54, 121.07], [325.93, 121.55], [328.32, 97.34], [330.71, 109.26], [333.10, 107.36], [335.49, 106.04], [337.88, 123.93], [340.27, 132.25], [342.66, 130.90], [345.05, 137.70], [347.44, 136.18], [349.83, 129.89], [352.21, 131.70], [354.60, 137.91], [356.99, 131.14], [359.38, 142.71], [361.77, 150.20], [364.16, 150.82], [366.55, 148.40], [368.94, 132.95], [371.33, 134.61], [373.72, 130.10], [376.11, 140.26], [378.50, 143.30], [380.89, 154.99], [383.28, 166.95], [385.66, 147.05], [388.05, 154.62], [390.44, 153.67], [392.83, 144.41], [395.22, 144.33], [397.61, 146.05], [400.00, 146.62]];
const BENCH = [[44.00, 231.33], [46.39, 230.94], [48.78, 230.55], [51.17, 230.16], [53.56, 229.77], [55.95, 229.38], [58.34, 228.99], [60.72, 228.60], [63.11, 228.20], [65.50, 227.81], [67.89, 227.42], [70.28, 227.03], [72.67, 226.64], [75.06, 226.25], [77.45, 225.86], [79.84, 225.47], [82.23, 225.08], [84.62, 224.68], [87.01, 224.29], [89.40, 223.90], [91.79, 223.51], [94.17, 223.12], [96.56, 222.73], [98.95, 222.34], [101.34, 221.95], [103.73, 221.56], [106.12, 221.16], [108.51, 220.77], [110.90, 220.38], [113.29, 219.99], [115.68, 219.60], [118.07, 219.21], [120.46, 218.82], [122.85, 218.43], [125.23, 218.04], [127.62, 217.64], [130.01, 217.25], [132.40, 216.86], [134.79, 216.47], [137.18, 216.08], [139.57, 215.69], [141.96, 215.30], [144.35, 214.91], [146.74, 214.52], [149.13, 214.12], [151.52, 213.73], [153.91, 213.34], [156.30, 212.95], [158.68, 212.56], [161.07, 212.17], [163.46, 211.78], [165.85, 211.39], [168.24, 211.00], [170.63, 210.60], [173.02, 210.21], [175.41, 209.82], [177.80, 209.43], [180.19, 209.04], [182.58, 208.65], [184.97, 208.26], [187.36, 207.87], [189.74, 207.48], [192.13, 207.08], [194.52, 206.69], [196.91, 206.30], [199.30, 205.91], [201.69, 205.52], [204.08, 205.13], [206.47, 204.74], [208.86, 204.35], [211.25, 203.96], [213.64, 203.56], [216.03, 203.17], [218.42, 202.78], [220.81, 202.39], [223.19, 202.00], [225.58, 201.61], [227.97, 201.22], [230.36, 200.83], [232.75, 200.44], [235.14, 200.04], [237.53, 199.65], [239.92, 199.26], [242.31, 198.87], [244.70, 198.48], [247.09, 198.09], [249.48, 197.70], [251.87, 197.31], [254.26, 196.92], [256.64, 196.52], [259.03, 196.13], [261.42, 195.74], [263.81, 195.35], [266.20, 194.96], [268.59, 194.57], [270.98, 194.18], [273.37, 193.79], [275.76, 193.40], [278.15, 193.00], [280.54, 192.61], [282.93, 192.22], [285.32, 191.83], [287.70, 191.44], [290.09, 191.05], [292.48, 190.66], [294.87, 190.27], [297.26, 189.88], [299.65, 189.48], [302.04, 189.09], [304.43, 188.70], [306.82, 188.31], [309.21, 187.92], [311.60, 187.53], [313.99, 187.14], [316.38, 186.75], [318.77, 186.36], [321.15, 185.96], [323.54, 185.57], [325.93, 185.18], [328.32, 184.79], [330.71, 184.40], [333.10, 184.01], [335.49, 183.62], [337.88, 183.23], [340.27, 182.84], [342.66, 182.44], [345.05, 182.05], [347.44, 181.66], [349.83, 181.27], [352.21, 180.88], [354.60, 180.49], [356.99, 180.10], [359.38, 179.71], [361.77, 179.32], [364.16, 178.92], [366.55, 178.53], [368.94, 178.14], [371.33, 177.75], [373.72, 177.36], [376.11, 176.97], [378.50, 176.58], [380.89, 176.19], [383.28, 175.80], [385.66, 175.40], [388.05, 175.01], [390.44, 174.62], [392.83, 174.23], [395.22, 173.84], [397.61, 173.45], [400.00, 173.06]];
const toPath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');

function Tearsheet() {
  const equityPath = toPath(EQUITY);
  const areaPath = `${equityPath} L400 250 L44 250 Z`;
  return (
    <svg viewBox="0 0 440 300" className={styles.tearsheet} role="img" aria-label="A two-series equity curve — a green strategy line above a dashed benchmark — inside a research tearsheet">
      <defs>
        <linearGradient id="equityArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--g-500)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--g-500)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="plotClip"><rect x="40" y="26" width="366" height="228" /></clipPath>
      </defs>

      {/* plot frame */}
      <rect x="40" y="26" width="366" height="228" rx="8" fill="none" stroke="var(--line-faint)" />

      {/* grid lattice */}
      {[70, 114, 158, 202, 246].map((y) => (
        <line key={`h${y}`} x1="40" x2="406" y1={y} y2={y} stroke="var(--line-faint)" />
      ))}
      {[116, 188, 260, 332].map((x) => (
        <line key={`v${x}`} x1={x} x2={x} y1="26" y2="254" stroke="var(--line-faint)" />
      ))}

      {/* area + series */}
      <g clipPath="url(#plotClip)">
        <path className={styles.area} d={areaPath} fill="url(#equityArea)" />
        <path className={styles.bench} d={toPath(BENCH)} fill="none" stroke="var(--viz-series-2)" strokeWidth="1.5" strokeDasharray="4 4" />
        <path className={styles.equity} d={equityPath} fill="none" stroke="var(--g-500)" strokeWidth="2" pathLength="1" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* crosshair + leading tip */}
      <g className={styles.tip}>
        <line x1="400" x2="400" y1="30" y2="250" stroke="var(--line-strong)" strokeDasharray="2 3" />
        <line x1="44" x2="406" y1="146.62" y2="146.62" stroke="var(--line-strong)" strokeDasharray="2 3" />
        <circle cx="400" cy="146.62" r="4" fill="var(--g-500)" />
        <circle cx="400" cy="146.62" r="8" fill="none" stroke="var(--g-500)" strokeOpacity="0.4" />
      </g>

      {/* axis ticks (mono) */}
      <g fontFamily="var(--ff-mono)" fontSize="9" fill="var(--tx-muted)">
        <text x="410" y="72" >1400</text>
        <text x="410" y="158">800</text>
        <text x="410" y="246">200</text>
        <text x="44" y="270">JAN</text>
        <text x="176" y="270">APR</text>
        <text x="308" y="270">JUL</text>
        <text x="388" y="270">OCT</text>
      </g>
    </svg>
  );
}

// ── Watchlist: MU is the featured chart above; these fill the board below ──
// `yf` is the symbol our Worker reads. The Worker routes each one by type: US
// equities come from Alpaca's IEX feed (real time), while the index, the gold
// future and the FX pair come from Yahoo (delayed ~15 min) because Alpaca does
// not carry them. Each row is tagged with which it got.
//
// px/chg/up are SAMPLE numbers, shown only until the first quote lands and if
// the feed fails. They are deliberately dimmed and tagged in the UI so a stale
// placeholder can never be mistaken for a live print. The sparkline shape is
// always illustrative; the price and % change are real once quotes resolve.
const WATCH = [
  {sym: 'AMD',     yf: 'AMD',   px: '516.13',    chg: '2.5', up: true,  s: [472.07,475.22,468.92,478.36,481.51,475.22,484.66,490.95,487.81,497.25,494.1,503.54,509.84,516.13]},
  {sym: 'KOSPI',   yf: '^KS11', px: '6,909.9',   chg: '1.8', up: false, s: [7016.9,7004.2,7022,6991.4,6978.7,6996.5,6966,6953.2,6971.1,6940.5,6927.7,6945.6,6920.1,6909.9]},
  {sym: 'SPY',     yf: 'SPY',   px: '764.29',    chg: '0.8', up: true,  s: [756.09,757.45,754.72,758.82,760.19,757.45,760.19,761.56,758.82,761.56,762.92,761.56,762.92,764.29]},
  {sym: 'CRM',     yf: 'CRM',   px: '247.72',    chg: '1.9', up: true,  s: [241.08,242.03,240.13,242.97,243.92,242.03,244.87,245.82,243.92,246.77,245.82,247.72,246.77,247.72]},
  {sym: 'TSLA',    yf: 'TSLA',  px: '365.44',    chg: '0.5', up: true,  s: [352.34,349.42,355.25,358.16,353.79,361.07,363.98,359.62,366.9,362.53,368.35,365.44,363.98,365.44]},
  {sym: 'GOLD',    yf: 'GC=F',  px: '4,408.9',   chg: '0.0', up: true,  s: [4377.9,4383.4,4374.3,4388.9,4392.5,4385.2,4396.1,4390.7,4399.8,4394.3,4403.4,4398,4405.3,4408.9]},
  {sym: 'USD/JPY', yf: 'JPY=X', px: '153.55',    chg: '0.5', up: false, s: [154.14,153.94,154.25,153.84,154.04,153.63,153.84,153.53,153.73,153.43,153.63,153.43,153.53,153.55]},
];

const fmtPx = (n) => fmtPrice(n, null);

// Poll /_m/quote every 60s. Returns the { symbol -> quote } map plus the board's
// own state: `status` is 'idle' before the first response, 'ok' after a good
// one, 'stale' once a poll has failed; `at` is when the last good response
// landed. On failure the last good prices stay on screen but the board says so
// rather than presenting a frozen number as the current one. Origin, timeout and
// the poll loop all come from the shared data layer.
function useQuotes(symbols) {
  const key = symbols.join(',');
  const [state, setState] = useState({map: {}, status: 'idle', at: null});
  usePolling(async ({signal, cancelled}) => {
    try {
      const m = await getQuotes(key.split(','), {signal});
      // A reachable Worker that returns no usable price is still a dead feed —
      // don't stamp a fresh time on a board full of placeholders.
      const usable = Object.values(m).some((q) => q && typeof q.price === 'number');
      if (cancelled()) return;
      if (usable) setState({map: m, status: 'ok', at: Date.now()});
      else setState((s) => ({...s, status: 'stale'}));
    } catch (_) {
      if (!cancelled()) setState((s) => ({...s, status: 'stale'}));
    }
  }, 60000, [key]);
  return state;
}

// Per-row provenance tag. `delayed` comes straight from the Worker, which knows
// which upstream served each symbol.
function sourceTag(q) {
  if (!q || q.price == null) return {label: 'SAMPLE', title: 'Placeholder figure — no live quote yet'};
  if (q.delayed) return {label: '15m', title: 'Yahoo Finance, delayed about 15 minutes'};
  return {label: 'LIVE', title: 'Alpaca IEX feed, real time (IEX volume only, not the full SIP tape)'};
}

// Every Yahoo symbol the board needs: the featured MU chart + the watchlist.
const YF_SYMBOLS = ['MU', ...WATCH.map((w) => w.yf)];

// Compact sparkline — normalizes a series into a 62×18 polyline.
function Spark({data, up}) {
  const w = 62, h = 18, pad = 1.5;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v - min) / rng) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className={styles.spark} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={up ? 'var(--g-500)' : 'var(--amber-500)'}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LiveClock() {
  const [t, setT] = useState('--:--:--');
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const tick = () => setT(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className={styles.tbClock}><span className="p-pip" />{t} CT</span>;
}

export default function Home() {
  // Reveal-on-scroll — one tiny IntersectionObserver.
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, {threshold: 0.15, rootMargin: '0px 0px -8% 0px'});
    els.forEach((el, i) => { el.style.setProperty('--i', i % 8); io.observe(el); });
    return () => io.disconnect();
  }, []);

  // Live quotes for the board, falling back to the sample numbers.
  const {map: quotes, status: feed, at: feedAt} = useQuotes(YF_SYMBOLS);
  const mu = quotes['MU'];
  const muDown = mu && mu.changePct != null && mu.changePct < 0;
  // Build the footer legend from what is actually on the board. If the Worker
  // ever loses its Alpaca credentials every row falls back to Yahoo, and the
  // legend must stop advertising a live feed that isn't there.
  const priced = Object.values(quotes).filter((q) => q && q.price != null);
  const hasLive = priced.some((q) => !q.delayed);
  const hasDelayed = priced.some((q) => q.delayed);

  return (
    <Layout
      title="Quantitative Finance"
      description="Interactive quantitative finance notes by Joyeb Kashyeb — math, markets and machine learning with runnable Python and hands-on pricing labs.">
      <header className={styles.heroWrap}>
        <div className={clsx('container', styles.heroContainer)}>
          <div className={styles.terminal}>
            <div className={styles.titlebar}>
              <span className={styles.tbDots}><i /><i /><i /></span>
              <span className={styles.tbLabel}>PHOSPHOR&nbsp;//&nbsp;QUANT-DESK v1.0</span>
              <LiveClock />
            </div>
            <div className={styles.termBody}>
              <div className={styles.heroText}>
                <p className={styles.eyebrow}>▮ Signal acquired · quantitative finance</p>
                <Heading as="h1" className={styles.heroTitle}>
                  Learning to think
                  <br />
                  in <span className={styles.accent}>probabilities</span>.
                </Heading>
                <p className={styles.heroSub}>
                  I'm Joyeb — documenting my path into quantitative finance. Every topic here is
                  interactive: run the Python, drag the sliders, take the quizzes. If I can't play
                  with an idea, I don't trust that I've learned it.
                </p>
                <div className={styles.heroButtons}>
                  <Link className="button button--primary button--lg" to="/docs/Introduction_and_Goals/overview">
                    Start learning →
                  </Link>
                  <Link className="button button--secondary button--outline button--lg" to="/roadmap">
                    See the roadmap
                  </Link>
                </div>
                <div className={styles.statRail}>
                  <div className={styles.statBlock}><span className={styles.statNum}>914</span><span className={styles.statLabel}>Symbols</span></div>
                  <span className={styles.statDivider} />
                  <div className={styles.statBlock}><span className={styles.statNum}>20</span><span className={styles.statLabel}>Flows</span></div>
                  <span className={styles.statDivider} />
                  <div className={styles.statBlock}><span className={styles.statNum}>7</span><span className={styles.statLabel}>Subjects</span></div>
                </div>
              </div>
              <div className={styles.heroVisual}>
                <div className={styles.visualHead}>
                  <span className={styles.visualTicker}><span className="p-pip" />MU&nbsp;·&nbsp;1D</span>
                  <span className={clsx(styles.visualReadout, !(mu && mu.price != null) && styles.wSample)}>
                    ${mu && mu.price != null ? fmtPx(mu.price) : '975.26'}&nbsp;
                    <b className={muDown ? styles.down : undefined}>{muDown ? '▼' : '▲'}</b>
                  </span>
                </div>
                <div className={styles.chartBox}>
                  <Tearsheet />
                  <span
                    className={clsx(styles.formula, styles.formulaTop)}
                    dangerouslySetInnerHTML={tex('dS = \\mu S\\,dt + \\sigma S\\,dW')}
                  />
                  <span
                    className={clsx(styles.formula, styles.formulaBottom)}
                    dangerouslySetInnerHTML={tex('\\Delta = \\dfrac{\\partial V}{\\partial S}')}
                  />
                </div>
                <div className={styles.watch}>
                  {WATCH.map((w) => {
                    const q = quotes[w.yf];
                    const live = q && q.price != null;
                    const price = live ? fmtPx(q.price) : w.px;
                    const cp = live && q.changePct != null
                      ? q.changePct
                      : (w.up ? parseFloat(w.chg) : -parseFloat(w.chg));
                    const up = cp >= 0;
                    const chg = Math.abs(cp).toFixed(1);
                    // Keep the illustrative sparkline pointing the real direction.
                    const sData = up === w.up ? w.s : [...w.s].reverse();
                    const tag = sourceTag(q);
                    return (
                      <div key={w.sym} className={clsx(styles.wRow, !live && styles.wSample)}>
                        <span className={styles.wSym}>{w.sym}</span>
                        <Spark data={sData} up={up} />
                        <span className={styles.wRight}>
                          <span className={styles.wPx}>{price}</span>
                          <span className={clsx(
                            styles.wChg,
                            live ? (up ? styles.up : styles.down) : styles.wFlat,
                          )}>
                            {up ? '▲' : '▼'}&nbsp;{chg}%
                          </span>
                          <span
                            className={clsx(styles.wTag, live && !q.delayed && styles.wTagLive)}
                            title={tag.title}>
                            {tag.label}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className={styles.watchFoot} role="status">
                  {feed === 'idle' && 'Loading quotes…'}
                  {feed === 'ok' && (
                    <>
                      {hasLive && (
                        <>
                          <span className={styles.wTagLive}>LIVE</span> Alpaca IEX
                        </>
                      )}
                      {hasLive && hasDelayed && <span className={styles.footDot}>·</span>}
                      {hasDelayed && (
                        <>
                          <span className={styles.wTag}>15m</span> Yahoo delayed
                        </>
                      )}
                      <span className={styles.footDot}>·</span>
                      {fmtClockCT(feedAt)}
                    </>
                  )}
                  {feed === 'stale' && (
                    <span className={styles.footStale}>
                      Quote feed unreachable
                      <span className={styles.footDot}>·</span>
                      {feedAt
                        ? `last good ${fmtClockCT(feedAt)}`
                        : 'showing sample figures'}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className="container">
            <div className={styles.sectionHead} data-reveal>
              <p className={styles.sectionEyebrow}>01 — The curriculum</p>
              <Heading as="h2" className={styles.sectionTitle}>Seven subjects, one goal</Heading>
              <p className={styles.sectionSub}>The skill set of a working quant — each area built to be played with, not just read.</p>
            </div>
            <div className={styles.grid3}>
              {SUBJECTS.map((s) => (
                <Link key={s.title} to={s.to} className={clsx('p-card', styles.subjectCard)} data-reveal>
                  <span className={styles.subjectTop}>
                    <span className={styles.subjectIcon}><Icon name={s.icon} /></span>
                    <span className={clsx(styles.subjectStatus, s.status === 'live' ? styles.statusLive : styles.statusProgress)}>
                      {/* The glyph is decoration; the word carries the meaning. */}
                      <span aria-hidden="true">{s.status === 'live' ? '●' : '◐'}</span>{' '}
                      {s.status === 'live' ? 'Live' : 'In progress'}
                    </span>
                  </span>
                  <span className={styles.subjectTitle}>{s.title}</span>
                  <span className={styles.subjectBlurb}>{s.blurb}</span>
                  <span className={styles.subjectMeta}>{s.meta}</span>
                  <span className={styles.subjectCta}>Open notes →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={clsx(styles.section, styles.sectionAlt)}>
          <div className="container">
            <div className={styles.sectionHead} data-reveal>
              <p className={styles.sectionEyebrow}>02 — Built to be played with</p>
              <Heading as="h2" className={styles.sectionTitle}>Reading is easy. This site makes you <em>do</em> it.</Heading>
            </div>
            <div className={styles.grid4}>
              {FEATURES.map((f) => (
                <Link key={f.title} to={f.to} className={clsx('p-card', styles.featureCard)} data-reveal>
                  <span className={styles.featureIcon}><Icon name={f.icon} /></span>
                  <span className={styles.featureTitle}>{f.title}</span>
                  <span className={styles.featureBlurb}>{f.blurb}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.ctaBand}>
          <span className={styles.ctaGlow} aria-hidden="true" />
          <div className={clsx('container', styles.ctaInner)} data-reveal>
            <p className={styles.sectionEyebrow}>03 — Theory in one tab, markets in the other</p>
            <Heading as="h2" className={styles.ctaTitle}>The desk is already streaming.</Heading>
            <p className={styles.ctaSub}>The built-in terminal streams live charts and news while you study — in Central Time, like the exchanges.</p>
            <Link className="button button--primary button--lg" to="/terminal">
              Open the terminal →
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
