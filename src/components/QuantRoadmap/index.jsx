import React, { useEffect, useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

/*
 * Quant Roadmap — five pillars × three levels. Click any node to mark it
 * complete; progress is saved to localStorage and scored against every career
 * track in TRACKS. Never hard-code how many there are — use TRACKS.length.
 */

const STORAGE_KEY = 'quantRoadmapProgressV1';

// `docs` points each pillar at the notes that actually teach it, so the roadmap
// is a way in to the 191 notes rather than a list of topics with no next step.
const PILLARS = [
  { id: 'math', name: 'Mathematics', color: '#7c3aed', docs: '/docs/Mathematics' },
  { id: 'prob', name: 'Probability & Statistics', color: '#2563eb', docs: '/docs/Probability' },
  { id: 'cs', name: 'Computer Science', color: '#0891b2', docs: '/docs/Programming' },
  { id: 'ml', name: 'Machine Learning', color: '#db2777', docs: '/docs/Machine_Learning' },
  { id: 'fin', name: 'Finance & Economics', color: '#16a34a', docs: '/docs/Finance' },
];

// The note that teaches each topic, where one genuinely covers it (checked
// against the note's content, not just its title). Topics without a matching
// note are left unlinked rather than pointed somewhere vague. Every path is a
// real route: onBrokenLinks 'throw' fails the build if one ever breaks.
const TOPIC_NOTES = {
  'Functions and their Graphs': '/docs/Mathematics/Calculus/single-variable-calculus/functions-and-models',
  'Limits, Derivatives & Integrals': '/docs/Mathematics/Calculus/single-variable-calculus/limits-and-derivatives',
  'Optimization (Minima / Maxima)': '/docs/Mathematics/Calculus/single-variable-calculus/applications-of-differentiation',
  'Multivariate Calculus (Partials, Gradients)': '/docs/Mathematics/Calculus/multivariable-calculus/partial-derivatives',
  'Vectors, Matrices & Matrix Operations': '/docs/Mathematics/linear-algebra',
  'Eigenvalues & Eigenvectors': '/docs/Mathematics/linear-algebra',
  'Solving Systems of Linear Equations': '/docs/Mathematics/linear-algebra',
  'Itô Calculus & Stochastic Differential Equations': '/docs/Mathematics/stochastic-calculus',
  'Applying Stochastic Calculus to Pricing': '/docs/Mathematics/stochastic-calculus',
  'Mean, Median, Mode, Range': '/docs/Statistics/descriptive-statistics/summary-measures/central-tendency',
  'Variance & Standard Deviation': '/docs/Statistics/descriptive-statistics/summary-measures/standard-deviation',
  'Sample Spaces & Events': '/docs/Probability/foundations',
  'Conditional Probability': '/docs/Probability/conditional-probability',
  'Combinatorics (Permutations & Combinations)': '/docs/Probability/combinatorics',
  'Set Theory Basics': '/docs/Probability/foundations',
  'Statistical Assumptions & Their Violations': '/docs/Statistics/regression-analysis',
  'Autoregressive (AR) & Moving Average (MA) Models': '/docs/Statistics/time-series',
  'ARMA / ARIMA / GARCH (Volatility Modeling)': '/docs/Statistics/time-series',
  'Stationarity & Unit Root Tests': '/docs/Statistics/time-series',
  'Bayesian Inference (Prior, Likelihood, Posterior)': '/docs/Statistics/bayesian-inference',
  'Nonparametric Methods': '/docs/Statistics/robust-statistics',
  'Robust Statistics (Outliers, Non-normal Data)': '/docs/Statistics/robust-statistics',
  'Programming Fundamentals': '/docs/Programming/Python',
  'Building APIs': '/docs/Programming/apis-and-systems',
  'Data Structures': '/docs/Programming/data-structures-and-algorithms',
  'Algorithms': '/docs/Programming/data-structures-and-algorithms',
  'Time & Space Complexity': '/docs/Programming/complexity',
  'Numerical Optimization (Gradient Descent, Newton’s Method)': '/docs/Mathematics/numerical-methods',
  'Low-Latency Architecture (Market Data, Execution)': '/docs/Programming/concurrency-and-low-latency',
  'Concurrency & Parallelism': '/docs/Programming/concurrency-and-low-latency',
  'Supervised vs. Unsupervised Learning': '/docs/Machine_Learning/foundations',
  'Bias-Variance Tradeoff': '/docs/Machine_Learning/model-evaluation',
  'Cross-Validation & Model Evaluation Metrics': '/docs/Machine_Learning/model-evaluation',
  'Linear / Logistic Regression': '/docs/Machine_Learning/regression-and-classification',
  'Decision Trees & Ensembles (Random Forests, Boosting)': '/docs/Machine_Learning/ensembles-and-svm',
  'Support Vector Machines (SVM)': '/docs/Machine_Learning/ensembles-and-svm',
  'K-Nearest Neighbors (KNN)': '/docs/Machine_Learning/regression-and-classification',
  'Intro to Neural Networks (Perceptrons, Backprop)': '/docs/Machine_Learning/deep-learning',
  'Finance Feature Engineering (Volume, Volatility, Order Book)': '/docs/Machine_Learning/ml-for-finance',
  'Walk-Forward Validation & Backtesting (No Lookahead Bias)': '/docs/Machine_Learning/ml-for-finance',
  'Reinforcement Learning (Policy Search, Q-Learning)': '/docs/Machine_Learning/reinforcement-learning',
  'Deep Learning (RNNs, LSTMs for Sequences)': '/docs/Machine_Learning/deep-learning',
  'Causal Inference': '/docs/Statistics/causal-inference',
  'Combining Alpha (Ensembles, Cross-sectional vs. Time-series)': '/docs/Machine_Learning/ml-for-finance',
  'Interest Rates': '/docs/Economics/interest-rates',
  'Monetary vs. Fiscal Policy': '/docs/Economics/monetary-vs-fiscal',
  'Options, Futures, Swaps (Derivatives Basics)': '/docs/Finance/derivatives',
  'Fixed Income (Yield, Duration, Convexity)': '/docs/Finance/fixed-income',
  'Foreign Exchange (FX)': '/docs/Finance/foreign-exchange',
  'Capital Asset Pricing Model (CAPM)': '/docs/Finance/capm',
  'Efficient Market Hypothesis (EMH)': '/docs/Finance/efficient-market-hypothesis',
  'The Concept of Alpha & Its Existence': '/docs/Finance/capm',
  'Valuation (DCF) & Risk Management Basics': '/docs/Finance/valuation-and-risk',
};

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
export const TRACKS = [
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

  // The first unticked topic, walking level by level and pillar by pillar, so
  // there is always an obvious next step rather than just a percentage.
  const nextUp = (() => {
    for (const lvl of [1, 2, 3]) {
      for (const p of PILLARS) {
        const entry = DATA[p.id][lvl];
        const i = (entry?.topics || []).findIndex((_, k) => !done.has(nodeId(p.id, lvl, k)));
        if (i >= 0) return { id: nodeId(p.id, lvl, i), label: entry.topics[i], pillar: p, level: lvl };
      }
    }
    return null;
  })();
  const goToNext = () => {
    if (!nextUp) return;
    const el = document.getElementById(`node-${nextUp.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus({ preventScroll: true });
    }
  };

  // Phones: the career cards collapse behind a summary so the study list isn't
  // pushed eight cards down the page.
  const [narrow] = useState(() => window.matchMedia('(max-width: 700px)').matches);

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
          Five pillars, three levels. Tick off each topic once you&rsquo;ve studied it &mdash;
          it saves in this browser. The percentages count ticked topics against what each of
          the {TRACKS.length} career tracks below calls for: a study checklist you mark
          yourself, not a measure of mastery or job readiness.
        </p>
      </div>

      {/* Overall progress */}
      <div className={styles.overall}>
        <strong>Topics ticked</strong>
        <div className={styles.overallBarOuter}>
          <div className={styles.overallBarInner} style={{ width: `${overall}%` }} />
        </div>
        <span className={styles.overallPct}>{done.size} / {INDEX.all.length}</span>
        <button className={styles.resetBtn} onClick={reset}>Reset</button>
      </div>

      {nextUp ? (
        <div className={styles.nextUp}>
          <span className={styles.nextUpLabel}>Next up</span>
          <span className={styles.nextUpTopic}>{nextUp.label}</span>
          <span className={styles.nextUpWhere}>{nextUp.pillar.name} · Level {nextUp.level}</span>
          <button type="button" className={styles.nextUpBtn} onClick={goToNext}>Show me</button>
          <Link to={TOPIC_NOTES[nextUp.label] || nextUp.pillar.docs} className={styles.nextUpBtn}>Open the notes ↗</Link>
        </div>
      ) : (
        <div className={styles.nextUp}>
          <span className={styles.nextUpLabel}>All topics ticked</span>
        </div>
      )}

      {/* Tracks */}
      <details className={styles.tracksDetails} open={!narrow}>
      <summary className={styles.tracksSummary}>Career tracks ({TRACKS.length}) &mdash; what each role does and which levels it calls for</summary>
      <p className={styles.tracksNote}>
        {TRACKS.length} quant career tracks and what each role actually does. Level targets for the
        newer roles are my own estimates &mdash; adjust to taste. A track&rsquo;s percentage is the
        share of its topics you&rsquo;ve ticked.
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
                  {t.name} {tp.complete ? <span className={styles.trackAllTicked}>all topics ticked</span> : ''}
                </span>
                <span className={styles.trackPct} title="Share of this track's topics you've ticked">{tp.pct}%</span>
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
      </details>

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
                  <div className={styles.cellHead}>
                    {p.docs && hasTopics ? (
                      <Link to={p.docs} className={styles.cellHeadLink}>
                        {p.name} <span aria-hidden="true">↗</span>
                      </Link>
                    ) : (
                      p.name
                    )}
                  </div>
                  {hasTopics ? (
                    <>
                      {entry.sub && (
                        <div className={styles.cellGoal}><strong>{entry.sub}</strong> &mdash; {entry.goal}</div>
                      )}
                      {entry.topics.map((label, i) => {
                        const id = nodeId(p.id, lvl.n, i);
                        const isDone = done.has(id);
                        const note = TOPIC_NOTES[label];
                        return (
                          <div key={id} className={styles.nodeRow}>
                            <button
                              id={`node-${id}`}
                              className={`${styles.node} ${nextUp && nextUp.id === id ? styles.nodeNext : ''}`}
                              onClick={() => toggle(id)}
                              aria-pressed={isDone}
                            >
                              <span className={`${styles.check} ${isDone ? styles.checkDone : ''}`}>
                                {isDone ? '✓' : ''}
                              </span>
                              <span className={isDone ? styles.nodeDone : ''}>{label}</span>
                            </button>
                            {note && (
                              <Link to={note} className={styles.nodeLink} title={`Open the notes on ${label}`} aria-label={`Notes: ${label}`}>
                                ↗
                              </Link>
                            )}
                          </div>
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
          high-school and college courses, and plenty of free videos online.
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
