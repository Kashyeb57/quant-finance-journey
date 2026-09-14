import React from 'react';
import Link from '@docusaurus/Link';
import useGlobalData from '@docusaurus/useGlobalData';
import styles from './styles.module.css';

// Readiness from plugins/content-stats.js: which docs are still placeholders,
// and how many notes each section holds. Absent (e.g. an old build) -> no chips.
function useReadiness() {
  const data = useGlobalData()['content-stats'];
  const d = data && data.default;
  return {
    drafts: new Set((d && d.drafts) || []),
    sections: (d && d.sections) || {},
  };
}

function TopicStatus({ to, drafts, sections }) {
  if (drafts.has(to)) {
    return <span className={styles.statusDraft}>In progress</span>;
  }
  const s = sections[to];
  if (s) {
    const [notes, pending] = s;
    return (
      <span className={styles.statusCount}>
        {notes} note{notes === 1 ? '' : 's'}{pending ? ` · ${pending} in progress` : ''}
      </span>
    );
  }
  return null;
}

/*
 * Tutorial Hub — a roadmap-style visual index of the docs.
 * Each field is a card with a short blurb; each topic links to its own deep-dive page.
 */

const FIELDS = [
  {
    name: 'Finance',
    color: '#16a34a',
    blurb: 'Markets, instruments & risk — from derivatives to valuation.',
    topics: [
      { label: 'Quant Finance Bootcamp', to: '/docs/Finance/Quant_Finance_Bootcamp/introduction' },
      { label: 'Derivatives (Forwards, Futures, Options, Swaps)', to: '/docs/Finance/derivatives' },
      { label: 'Fixed Income (Yield, Duration, Convexity)', to: '/docs/Finance/fixed-income' },
      { label: 'Foreign Exchange (FX)', to: '/docs/Finance/foreign-exchange' },
      { label: 'CAPM & Asset Pricing', to: '/docs/Finance/capm' },
      { label: 'Efficient Market Hypothesis', to: '/docs/Finance/efficient-market-hypothesis' },
      { label: 'Valuation & Risk Management', to: '/docs/Finance/valuation-and-risk' },
    ],
  },
  {
    name: 'Mathematics',
    color: '#7c3aed',
    blurb: 'The mathematical backbone — algebra through stochastic calculus.',
    topics: [
      { label: 'Calculus', to: '/docs/Calculus-Notes' },
      { label: 'Linear Algebra', to: '/docs/Mathematics/linear-algebra' },
      { label: 'Differential Equations', to: '/docs/Mathematics/differential-equations' },
      { label: 'Optimization', to: '/docs/Mathematics/optimization' },
      { label: 'Stochastic Calculus', to: '/docs/Mathematics/stochastic-calculus' },
      { label: 'Numerical Methods', to: '/docs/Mathematics/numerical-methods' },
      { label: 'Discrete Mathematics', to: '/docs/Mathematics/discrete-mathematics' },
      { label: 'Matrix Factorization (PCA / SVD)', to: '/docs/Mathematics/matrix-factorization' },
    ],
  },
  {
    name: 'Statistics',
    color: '#2563eb',
    blurb: 'Drawing conclusions from data — inference through time series.',
    topics: [
      { label: 'Descriptive Statistics', to: '/docs/Statistics/descriptive-statistics' },
      { label: 'Inferential Statistics & Hypothesis Testing', to: '/docs/Statistics/inferential-statistics' },
      { label: 'Regression Analysis', to: '/docs/Statistics/regression-analysis' },
      { label: 'Time Series (AR, MA, ARIMA, GARCH)', to: '/docs/Statistics/time-series' },
      { label: 'Bayesian Inference', to: '/docs/Statistics/bayesian-inference' },
      { label: 'Robust & Nonparametric Statistics', to: '/docs/Statistics/robust-statistics' },
      { label: 'Causal Inference & DAGs', to: '/docs/Statistics/causal-inference' },
    ],
  },
  {
    name: 'Probability',
    color: '#0ea5e9',
    blurb: 'Modeling uncertainty — from foundations to stochastic processes.',
    topics: [
      { label: 'Probability Foundations', to: '/docs/Probability/foundations' },
      { label: 'Combinatorics', to: '/docs/Probability/combinatorics' },
      { label: 'Random Variables & Distributions', to: '/docs/Probability/distributions' },
      { label: 'Conditional Probability & Bayes Theorem', to: '/docs/Probability/conditional-probability' },
      { label: 'Stochastic Processes & Brownian Motion', to: '/docs/Probability/stochastic-processes' },
    ],
  },
  {
    name: 'Economics',
    color: '#d97706',
    blurb: 'The forces behind markets — micro, macro & policy.',
    topics: [
      { label: 'Microeconomics', to: '/docs/Economics/microeconomics' },
      { label: 'Macroeconomics', to: '/docs/Economics/macroeconomics' },
      { label: 'Monetary vs. Fiscal Policy', to: '/docs/Economics/monetary-vs-fiscal' },
      { label: 'Interest Rates', to: '/docs/Economics/interest-rates' },
    ],
  },
  {
    name: 'Programming',
    color: '#0891b2',
    blurb: 'Building it — Python, algorithms & systems.',
    topics: [
      { label: 'Python', to: '/docs/Programming/Python' },
      { label: 'Data Structures & Algorithms', to: '/docs/Programming/data-structures-and-algorithms' },
      { label: 'Time & Space Complexity', to: '/docs/Programming/complexity' },
      { label: 'APIs & Systems', to: '/docs/Programming/apis-and-systems' },
      { label: 'Tooling & MLOps (Git, Docker, MLflow)', to: '/docs/Programming/tooling-and-mlops' },
      { label: 'Concurrency & Low-Latency', to: '/docs/Programming/concurrency-and-low-latency' },
    ],
  },
  {
    name: 'Machine Learning',
    color: '#db2777',
    blurb: 'Learning from data — models, deep learning & alpha.',
    topics: [
      { label: 'ML Foundations', to: '/docs/Machine_Learning/foundations' },
      { label: 'Regression & Classification', to: '/docs/Machine_Learning/regression-and-classification' },
      { label: 'Bias-Variance & Model Evaluation', to: '/docs/Machine_Learning/model-evaluation' },
      { label: 'Trees, Ensembles & SVM', to: '/docs/Machine_Learning/ensembles-and-svm' },
      { label: 'Unsupervised Learning', to: '/docs/Machine_Learning/unsupervised-learning' },
      { label: 'Natural Language Processing', to: '/docs/Machine_Learning/nlp' },
      { label: 'Neural Networks & Deep Learning', to: '/docs/Machine_Learning/deep-learning' },
      { label: 'Reinforcement Learning', to: '/docs/Machine_Learning/reinforcement-learning' },
      { label: 'ML for Finance', to: '/docs/Machine_Learning/ml-for-finance' },
    ],
  },
];

export default function TutorialHub() {
  const { drafts, sections } = useReadiness();
  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Pick a subject, then click any topic to deep-dive into its notes. Every topic has its
        own page — a growing library of everything on the quant path.
      </p>
      <p className={styles.legend}>
        <span className={styles.statusDraft}>In progress</span> topics are outlines with what&rsquo;s
        planned and where to learn it meanwhile; every other topic is written. Section topics show
        how many notes they hold.
      </p>
      <div className={styles.grid}>
        {FIELDS.map((f) => (
          <div key={f.name} className={styles.card} style={{ ['--field']: f.color }}>
            <div className={styles.cardTitle}>{f.name}</div>
            <div className={styles.blurb}>{f.blurb}</div>
            <ul className={styles.list}>
              {f.topics.map((t) => (
                <li key={t.to} className={styles.item}>
                  <Link className={styles.link} to={t.to}>
                    <span className={styles.dot} />
                    <span className={styles.topicLabel}>{t.label}</span>
                    <TopicStatus to={t.to} drafts={drafts} sections={sections} />
                    <span className={styles.go}>{'→'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
