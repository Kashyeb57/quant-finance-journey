import React, { useEffect, useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import styles from './styles.module.css';

/*
 * Quant Roadmap — based on the "Quant Guild Roadmap" by Roman Paolucci.
 * Five pillars × three levels. Click any node to mark it complete;
 * progress is saved to localStorage and scored against the three career tracks.
 */

const STORAGE_KEY = 'quantRoadmapProgressV1';

const PILLARS = [
  { id: 'math', name: 'Mathematics', color: '#7c3aed' },
  { id: 'prob', name: 'Probability & Statistics', color: '#2563eb' },
  { id: 'cs', name: 'Computer Science', color: '#0891b2' },
  { id: 'ml', name: 'Machine Learning', color: '#db2777' },
  { id: 'fin', name: 'Finance & Economics', color: '#16a34a' },
];

const LEVELS = [
  { n: 1, takeaway: 'Understanding lets you think critically and create NEW extensions.' },
  { n: 2, takeaway: 'New quantitative ideas come from MASTERY of foundational material.' },
  { n: 3, takeaway: 'Mastery is where original research and edge come from.' },
];

// goal text + topics per pillar per level. Empty topics => competency node added.
const DATA = {
  math: {
    1: {
      sub: 'Algebra & Geometry',
      goal: 'Solve deterministic problems with algebra.',
      topics: [
        'Solving Linear & Quadratic Equations',
        'Functions and their Graphs',
        'Polynomials & Rational Functions',
        'Exponents & Logarithms',
        'Coordinate Geometry',
        'Basic Proofs',
      ],
    },
    2: {
      sub: 'Calculus & Linear Algebra',
      goal: 'Solve deterministic problems with calculus.',
      topics: [
        'Limits, Derivatives & Integrals',
        'Optimization (Minima / Maxima)',
        'Multivariate Calculus (Partials, Gradients)',
        'Vectors, Matrices & Matrix Operations',
        'Eigenvalues & Eigenvectors',
        'Solving Systems of Linear Equations',
      ],
    },
    3: {
      sub: 'Stochastic Calculus',
      goal: 'Apply stochastic calculus to pricing.',
      topics: [
        'Itô Calculus & Stochastic Differential Equations',
        'Applying Stochastic Calculus to Pricing',
      ],
    },
  },
  prob: {
    1: {
      sub: 'Core Probabilistic Concepts',
      goal: 'Model fixed randomness: dice rolls, coin flips, etc.',
      topics: [
        'Mean, Median, Mode, Range',
        'Variance & Standard Deviation',
        'Sample Spaces & Events',
        'Conditional Probability',
        'Combinatorics (Permutations & Combinations)',
        'Set Theory Basics',
      ],
    },
    2: {
      sub: 'Modeling Assumptions',
      goal: 'Understand assumptions & violations in real-world modeling.',
      topics: [
        'Statistical Assumptions & Their Violations',
        'When Regression Beats Machine Learning',
      ],
    },
    3: {
      sub: 'Time Series & Advanced Statistics',
      goal: 'Master statistical inference for markets.',
      topics: [
        'Autoregressive (AR) & Moving Average (MA) Models',
        'ARMA / ARIMA / GARCH (Volatility Modeling)',
        'Stationarity & Unit Root Tests',
        'Bayesian Inference (Prior, Likelihood, Posterior)',
        'Nonparametric Methods',
        'Robust Statistics (Outliers, Non-normal Data)',
      ],
    },
  },
  cs: {
    1: {
      sub: 'Programming Foundations',
      goal: 'Be capable of building anything (APIs, UIs, etc.).',
      topics: [
        'Programming Fundamentals',
        'Building APIs',
        'Building UIs',
      ],
    },
    2: {
      sub: 'DSA & Complexity',
      goal: 'Understand data structures, algorithms, time/space complexity.',
      topics: [
        'Data Structures',
        'Algorithms',
        'Time & Space Complexity',
      ],
    },
    3: {
      sub: 'Advanced Search, Optimization & Systems',
      goal: 'Connect search procedures to policy search & optimization.',
      topics: [
        'Numerical Optimization (Gradient Descent, Newton’s Method)',
        'Simulated Annealing & Genetic Algorithms',
        'Low-Latency Architecture (Market Data, Execution)',
        'Concurrency & Parallelism',
        'Distributed Systems (Microservices, Message Queues)',
      ],
    },
  },
  ml: {
    1: { sub: '', goal: '', topics: [] },
    2: {
      sub: 'Core Machine Learning Principles',
      goal: 'Understand the model development pipeline.',
      topics: [
        'Supervised vs. Unsupervised Learning',
        'Bias-Variance Tradeoff',
        'Cross-Validation & Model Evaluation Metrics',
        'Linear / Logistic Regression',
        'Decision Trees & Ensembles (Random Forests, Boosting)',
        'Support Vector Machines (SVM)',
        'K-Nearest Neighbors (KNN)',
        'Intro to Neural Networks (Perceptrons, Backprop)',
      ],
    },
    3: {
      sub: 'ML for Time Series & Advanced Concepts',
      goal: 'Build and validate models that generate alpha.',
      topics: [
        'Finance Feature Engineering (Volume, Volatility, Order Book)',
        'Walk-Forward Validation & Backtesting (No Lookahead Bias)',
        'Reinforcement Learning (Policy Search, Q-Learning)',
        'Deep Learning (RNNs, LSTMs for Sequences)',
        'Causal Inference',
        'Combining Alpha (Ensembles, Cross-sectional vs. Time-series)',
      ],
    },
  },
  fin: {
    1: {
      sub: 'Reading the Market',
      goal: 'Understand the news you read: interest rates, monetary vs. fiscal.',
      topics: [
        'Interest Rates',
        'Monetary vs. Fiscal Policy',
        'Reading Financial News',
      ],
    },
    2: {
      sub: 'Instruments & Theory Critique',
      goal: 'See why much of modern financial theory (EMH, CAPM) falls short.',
      topics: [
        'Options, Futures, Swaps (Derivatives Basics)',
        'Fixed Income (Yield, Duration, Convexity)',
        'Foreign Exchange (FX)',
        'Capital Asset Pricing Model (CAPM)',
        'Efficient Market Hypothesis (EMH)',
        'The Concept of Alpha & Its Existence',
        'Valuation (DCF) & Risk Management Basics',
      ],
    },
    3: {
      sub: 'Hypothesizing Markets',
      goal: 'Hypothesize what MAY happen and the likelihood of each outcome.',
      topics: [
        'Scenario & Likelihood Reasoning',
      ],
    },
  },
};

// Career tracks. Required level per pillar (3 = Mastery). Finance is foundational
// across all tracks but was not gated in the source roadmap, so it is shown but
// not counted toward track completion.
const TRACKS = [
  {
    id: 'analyst', name: 'Quant Analyst', req: { math: 3, cs: 2, ml: 2, prob: 3 },
    does: [
      'Analyzes market data and prices derivatives (equity, rates, commodities, FX, credit)',
      'Computes Greeks, implied volatility, and sensitivities for traders',
      'Builds pricing models (Black-Scholes, Binomial, Monte Carlo, Finite Difference)',
      'Improves model accuracy via market-data calibration',
      'Works closely with traders, risk, and structuring teams',
    ],
  },
  {
    id: 'research', name: 'Quant Researcher', req: { math: 3, cs: 3, ml: 3, prob: 3 },
    does: [
      'Designs new trading models, pricing methods, and ML frameworks',
      'Works on stochastic calculus, volatility surfaces, and HFT microstructure',
      'Runs large-scale backtests and optimization experiments',
      'Publishes research, white papers, and internal documentation',
      'Collaborates with quants and PMs to turn theory into strategy',
    ],
  },
  {
    id: 'dev', name: 'Quant Developer', req: { math: 2, cs: 3, ml: 3, prob: 2 },
    does: [
      'Converts pricing models and trading logic into production systems',
      'Builds low-latency engines, risk libraries, APIs, and data pipelines',
      'Ensures accuracy, speed, and scalability of trading models in real time',
      'Optimizes execution, caching, threading, and memory usage',
      'Works with researchers and traders to deploy code',
    ],
  },
  {
    id: 'trader', name: 'Quant Trader', req: { math: 2, cs: 2, ml: 2, prob: 3 },
    does: [
      'Executes trades and manages inventory and portfolio risk',
      'Uses Greeks, volatility, and statistical signals to size positions',
      'Monitors order-book dynamics, spreads, and slippage continuously',
      'Adjusts strategy based on market movements and risk limits',
      'Works with quants to refine strategies and stress-test models',
    ],
  },
  {
    id: 'pm', name: 'Portfolio Manager', req: { math: 2, cs: 2, ml: 2, prob: 3 },
    does: [
      'Manages portfolios using factor models, alpha signals, and risk parity',
      'Allocates capital based on Sharpe, drawdowns, and risk constraints',
      'Uses optimization (Markowitz, Black-Litterman, Kelly)',
      'Runs live strategy monitoring with execution-cost modeling',
      'Works closely with researchers and risk teams',
    ],
  },
  {
    id: 'modelval', name: 'Model Validation Quant', req: { math: 3, cs: 2, ml: 3, prob: 3 },
    does: [
      'Independently checks pricing and risk models built by other quants',
      'Performs backtesting, benchmarking, sensitivity analysis, and stress testing',
      'Reviews documentation, assumptions, calibration, and limitations',
      'Identifies model weaknesses and regulatory non-compliance',
      'Signs off models used in trading, valuation, and risk reporting',
    ],
  },
  {
    id: 'marketrisk', name: 'Market Risk Quant', req: { math: 2, cs: 2, ml: 2, prob: 3 },
    does: [
      'Builds and monitors VaR, Expected Shortfall, stress, and volatility models',
      'Assesses trading-desk limits and real-time PnL impact',
      'Investigates losses and explains them to regulators and management',
      'Designs scenario tests (2008 crisis, COVID, high-vol events)',
      'Works with traders to control risk \u2014 but does not trade',
    ],
  },
  {
    id: 'creditrisk', name: 'Credit Risk Quant', req: { math: 2, cs: 2, ml: 3, prob: 3 },
    does: [
      'Builds and validates PD, LGD, and EAD models',
      'Uses scorecards, logistic regression, survival models, and ML',
      'Tracks default trends, credit migration, and loan exposure',
      'Works under Basel IRB, IFRS-9, CECL, and CCAR frameworks',
      'Used in banks, rating agencies, lending platforms, and hedge funds',
    ],
  },
];

const LEVEL_LABEL = { 1: 'L1', 2: 'L2', 3: 'Mastery' };

// stable id for a topic
const nodeId = (pillar, level, i) => `${pillar}-${level}-${i}`;

// build a flat list of every node id, plus per-pillar/level groupings
function buildIndex() {
  const all = [];
  const byPillarLevel = {};
  for (const p of PILLARS) {
    byPillarLevel[p.id] = {};
    for (const lvl of [1, 2, 3]) {
      const entry = DATA[p.id][lvl];
      const ids = (entry?.topics || []).map((_, i) => nodeId(p.id, lvl, i));
      byPillarLevel[p.id][lvl] = ids;
      all.push(...ids);
    }
  }
  return { all, byPillarLevel };
}

const INDEX = buildIndex();

function pct(done, total) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function RoadmapInner() {
  const [done, setDone] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (e) {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...done]));
    } catch (e) {
      /* ignore */
    }
  }, [done]);

  const toggle = (id) => {
    setDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const reset = () => {
    if (window.confirm('Reset all roadmap progress?')) setDone(new Set());
  };

  const overall = pct(done.size, INDEX.all.length);

  // progress for a pillar up to and including a level
  const pillarUpTo = (pillarId, maxLevel) => {
    let total = 0;
    let d = 0;
    for (let lvl = 1; lvl <= maxLevel; lvl++) {
      const ids = INDEX.byPillarLevel[pillarId][lvl] || [];
      total += ids.length;
      d += ids.filter((id) => done.has(id)).length;
    }
    return { d, total };
  };

  const trackProgress = (track) => {
    let total = 0;
    let d = 0;
    for (const [pillarId, lvl] of Object.entries(track.req)) {
      const r = pillarUpTo(pillarId, lvl);
      total += r.total;
      d += r.d;
    }
    return { pct: pct(d, total), complete: d === total && total > 0 };
  };

  const cellProgress = (pillarId, lvl) => {
    const ids = INDEX.byPillarLevel[pillarId][lvl] || [];
    const d = ids.filter((id) => done.has(id)).length;
    return { d, total: ids.length };
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.intro}>
        <p>
          Five pillars, three levels. Tick off each topic as you learn it &mdash;
          your progress saves automatically and scores you against the three quant
          career tracks below. Adapted from Roman Paolucci&rsquo;s Quant Guild roadmap.
        </p>
      </div>

      {/* Overall progress */}
      <div className={styles.overall}>
        <strong>Overall</strong>
        <div className={styles.overallBarOuter}>
          <div className={styles.overallBarInner} style={{ width: `${overall}%` }} />
        </div>
        <span className={styles.overallPct}>{overall}%</span>
        <button className={styles.resetBtn} onClick={reset}>Reset</button>
      </div>

      {/* Tracks */}
      <p className={styles.tracksNote}>
        Eight quant career tracks and what each role actually does. Level targets for the
        newer roles are my own estimates &mdash; adjust to taste.
      </p>
      <div className={styles.tracks}>
        {TRACKS.map((t) => {
          const tp = trackProgress(t);
          return (
            <div
              key={t.id}
              className={`${styles.trackCard} ${tp.complete ? styles.trackCardDone : ''}`}
            >
              <div className={styles.trackHead}>
                <span className={styles.trackName}>
                  {t.name} {tp.complete ? '✅' : ''}
                </span>
                <span className={styles.trackPct}>{tp.pct}%</span>
              </div>
              <div className={styles.trackBarOuter}>
                <div className={styles.trackBarInner} style={{ width: `${tp.pct}%` }} />
              </div>
              <ul className={styles.trackReq}>
                {Object.entries(t.req).map(([pid, lvl]) => {
                  const r = pillarUpTo(pid, lvl);
                  const met = r.d === r.total;
                  const pillar = PILLARS.find((p) => p.id === pid);
                  return (
                    <li key={pid} className={met ? styles.reqMet : ''}>
                      <span>{met ? '✓' : '○'} {pillar.name}</span>
                      <span>{LEVEL_LABEL[lvl]}</span>
                    </li>
                  );
                })}
              </ul>
              <div className={styles.trackDoesLabel}>What they do</div>
              <ul className={styles.trackDoes}>
                {t.does.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Levels */}
      {LEVELS.map((lvl) => (
        <div key={lvl.n}>
          <div className={styles.levelLabel}>
            <span className={styles.levelBadge}>Level {lvl.n}</span>
            <span className={styles.levelTakeaway}>{lvl.takeaway}</span>
          </div>
          <div className={styles.grid}>
            {PILLARS.map((p) => {
              const entry = DATA[p.id][lvl.n];
              const hasTopics = entry && entry.topics.length > 0;
              const cp = cellProgress(p.id, lvl.n);
              return (
                <div
                  key={p.id}
                  className={`${styles.cell} ${hasTopics ? '' : styles.cellEmpty}`}
                  style={{ '--pillar': p.color }}
                >
                  <div className={styles.cellHead}>{p.name}</div>
                  {hasTopics ? (
                    <>
                      {entry.sub && (
                        <div className={styles.cellGoal}><strong>{entry.sub}</strong> &mdash; {entry.goal}</div>
                      )}
                      {entry.topics.map((label, i) => {
                        const id = nodeId(p.id, lvl.n, i);
                        const isDone = done.has(id);
                        return (
                          <button
                            key={id}
                            className={styles.node}
                            onClick={() => toggle(id)}
                            aria-pressed={isDone}
                          >
                            <span className={`${styles.check} ${isDone ? styles.checkDone : ''}`}>
                              {isDone ? '✓' : ''}
                            </span>
                            <span className={isDone ? styles.nodeDone : ''}>{label}</span>
                          </button>
                        );
                      })}
                      <div className={styles.cellBar}>
                        <div className={styles.cellBarInner} style={{ width: `${pct(cp.d, cp.total)}%` }} />
                      </div>
                    </>
                  ) : (
                    <div className={styles.cellGoal} style={{ marginTop: '0.3rem' }}>
                      No dedicated topics at this level &mdash; covered within other levels.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className={styles.footnote}>
        <p>
          <strong>How much do I need?</strong> Depends on your goal &mdash; you don&rsquo;t have to
          learn everything, but learn as much as you can. Most topics are covered in
          high-school and college courses, and free videos on{' '}
          <a href="https://www.youtube.com/@QuantGuild" target="_blank" rel="noreferrer">Quant Guild</a>.
          Original roadmap by Roman Paolucci on{' '}
          <a href="https://roadmap.sh/r/quant-roadmap-bzunq" target="_blank" rel="noreferrer">roadmap.sh</a>.
        </p>
      </div>
    </div>
  );
}

export default function QuantRoadmap() {
  return (
    <BrowserOnly fallback={<div className={styles.wrap}><p>Loading roadmap&hellip;</p></div>}>
      {() => <RoadmapInner />}
    </BrowserOnly>
  );
}
