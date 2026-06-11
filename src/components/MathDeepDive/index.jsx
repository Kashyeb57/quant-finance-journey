import React, { useEffect, useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import styles from './styles.module.css';

/*
 * Math Deep-Dive — the core mathematics subfields a quant needs, each with key
 * topics (trackable), quant-finance applications, and study resources.
 * Progress is saved to localStorage independently of the main roadmap.
 */

const STORAGE_KEY = 'mathDeepDiveProgressV1';

const FIELDS = [
  {
    id: 'la',
    name: 'Linear Algebra',
    topics: [
      'Vectors and matrices',
      'Matrix operations (multiplication, inversion)',
      'Eigenvalues and eigenvectors',
      'Singular Value Decomposition (SVD)',
    ],
    apps: [
      'Portfolio variance calculation',
      'Principal Component Analysis (PCA) for risk factor analysis',
    ],
    note: 'Essential for portfolio theory, risk management, and machine learning algorithms.',
    resources: 'Linear Algebra and Its Applications — Gilbert Strang · MIT OCW (Strang) · 3Blue1Brown',
  },
  {
    id: 'calc',
    name: 'Calculus',
    topics: [
      'Derivatives and integrals',
      'Partial derivatives',
      'Multivariable calculus',
      'Gradient, divergence, and Hessians',
    ],
    apps: [
      'Derivatives pricing (e.g., Black-Scholes model)',
      'Sensitivity analysis (the Greeks)',
    ],
    note: 'Used to model continuous changes in prices, interest rates, and other financial variables.',
  },
  {
    id: 'de',
    name: 'Differential Equations',
    topics: [
      'Ordinary Differential Equations (ODEs)',
      'Partial Differential Equations (PDEs)',
      'Boundary value problems',
    ],
    apps: [
      'Black-Scholes PDE for options pricing',
      'Term structure models (e.g., Vasicek, Hull-White)',
    ],
    note: 'Models time-evolving systems such as stock prices, interest rates, and economic variables.',
  },
  {
    id: 'opt',
    name: 'Optimization',
    topics: [
      'Linear and nonlinear optimization',
      'Constrained optimization',
      'Convex optimization',
      'Quadratic programming',
    ],
    apps: [
      'Markowitz portfolio optimization',
      'Risk-adjusted performance optimization',
    ],
    note: 'Helps solve portfolio construction, minimizing costs, and maximizing returns.',
  },
  {
    id: 'sc',
    name: 'Stochastic Calculus',
    topics: [
      'Brownian motion',
      "Itô's Lemma",
      'Stochastic Differential Equations (SDEs) & Martingales',
    ],
    apps: [
      'Geometric Brownian Motion for stock prices',
      'Modeling interest rates with stochastic processes',
    ],
    note: 'Models randomness in financial markets — a key aspect of derivatives pricing and risk modeling.',
  },
  {
    id: 'nm',
    name: 'Numerical Methods',
    topics: [
      'Root-finding algorithms (e.g., Newton-Raphson)',
      'Numerical integration (e.g., Monte Carlo methods)',
      'Finite difference methods',
    ],
    apps: [
      'Numerical solutions to the Black-Scholes PDE',
      'Monte Carlo simulations for derivative pricing',
    ],
    note: "Enables solving equations and models that don't have analytical solutions.",
  },
  {
    id: 'dm',
    name: 'Discrete Mathematics',
    topics: [
      'Combinatorics',
      'Graph theory',
      'Discrete optimization',
    ],
    apps: [
      'Risk management algorithms',
      'High-frequency trading strategies',
    ],
    note: 'Forms the basis for algorithms, cryptography, and combinatorics in financial applications.',
  },
  {
    id: 'mf',
    name: 'Matrix Factorization',
    topics: [
      'Eigenvalue decomposition',
      'Principal Component Analysis (PCA)',
      'Singular Value Decomposition (SVD)',
    ],
    apps: [
      'Reducing dimensionality in large datasets',
      'Identifying key risk factors in portfolio management',
    ],
    note: 'Simplifies complex datasets; used in machine learning and risk analysis.',
    resources: 'Introduction to Linear Algebra — Gilbert Strang · Practice: PCA & SVD with Python (scikit-learn)',
  },
];

const ALL_IDS = FIELDS.flatMap((f) => f.topics.map((_, i) => `${f.id}-${i}`));

function MathDeepDiveInner() {
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

  const toggle = (id) =>
    setDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const overall =
    ALL_IDS.length === 0 ? 0 : Math.round(([...done].filter((id) => ALL_IDS.includes(id)).length / ALL_IDS.length) * 100);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>📐 Mathematics Deep-Dive</div>
      <p className={styles.sub}>
        The core mathematical subfields behind quantitative finance — each with the key
        topics to learn and where they show up in practice. Tick topics off as you go.
      </p>

      <div className={styles.overall}>
        <strong>Math progress</strong>
        <div className={styles.barOuter}>
          <div className={styles.barInner} style={{ width: `${overall}%` }} />
        </div>
        <span className={styles.pct}>{overall}%</span>
      </div>

      <div className={styles.grid}>
        {FIELDS.map((f) => (
          <div key={f.id} className={styles.card}>
            <div className={styles.cardTitle}>{f.name}</div>

            <div className={styles.label}>Key Topics</div>
            {f.topics.map((t, i) => {
              const id = `${f.id}-${i}`;
              const isDone = done.has(id);
              return (
                <button key={id} className={styles.node} onClick={() => toggle(id)} aria-pressed={isDone}>
                  <span className={`${styles.check} ${isDone ? styles.checkDone : ''}`}>{isDone ? '✓' : ''}</span>
                  <span className={isDone ? styles.nodeDone : ''}>{t}</span>
                </button>
              );
            })}

            <div className={styles.label}>Applications in Quant Finance</div>
            <ul className={styles.apps}>
              {f.apps.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>

            {f.resources && (
              <div className={styles.resources}>
                <strong>Study:</strong> {f.resources}
              </div>
            )}
            <div className={styles.note}>{f.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MathDeepDive() {
  return (
    <BrowserOnly fallback={<div className={styles.wrap}><p>Loading math deep-dive&hellip;</p></div>}>
      {() => <MathDeepDiveInner />}
    </BrowserOnly>
  );
}
