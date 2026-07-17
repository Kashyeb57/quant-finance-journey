import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

const SUBJECTS = [
  {
    icon: '∑',
    title: 'Mathematics',
    blurb: 'Calculus, linear algebra, and the stochastic calculus behind every pricing model.',
    to: '/docs/Mathematics/stochastic-calculus',
  },
  {
    icon: '🎲',
    title: 'Probability & Statistics',
    blurb: 'Distributions, inference and time series — the language uncertainty is written in.',
    to: '/docs/Probability/distributions',
  },
  {
    icon: '📈',
    title: 'Finance & Derivatives',
    blurb: 'Options, payoffs and Black–Scholes, with live labs you can drag and explore.',
    to: '/docs/Finance/derivatives',
  },
  {
    icon: '🐍',
    title: 'Python',
    blurb: 'A full course where every code block runs in your browser — no setup at all.',
    to: '/docs/Programming/Python',
  },
  {
    icon: '🤖',
    title: 'Machine Learning',
    blurb: 'From regression to deep learning, aimed squarely at financial applications.',
    to: '/docs/Machine_Learning/overview',
  },
  {
    icon: '🏦',
    title: 'Economics',
    blurb: 'Rates, macro and policy — the forces that move the markets quants model.',
    to: '/docs/Economics/interest-rates',
  },
];

const FEATURES = [
  {
    icon: '📓',
    title: 'A real Python notebook',
    blurb: 'Jupyter-style cells with numpy, pandas and matplotlib — running fully in your browser.',
    to: '/notebook',
  },
  {
    icon: '▶',
    title: 'Runnable Python',
    blurb: 'Every Python snippet on the site has a Run button. Edit it, break it, learn from it.',
    to: '/docs/Programming/Python',
  },
  {
    icon: '🧪',
    title: 'Interactive labs',
    blurb: 'Price options with sliders, simulate Brownian motion, bend the bell curve.',
    to: '/docs/Finance/derivatives',
  },
  {
    icon: '✅',
    title: 'Quizzes everywhere',
    blurb: 'Instant-feedback questions with explanations at the end of each lesson.',
    to: '/tutorial',
  },
  {
    icon: '📊',
    title: 'A live market terminal',
    blurb: 'Charts and market news, right inside the site — theory meets the tape.',
    to: '/terminal',
  },
];

function HeroChart() {
  return (
    <svg viewBox="0 0 460 300" className={styles.heroChart} role="img" aria-label="Stylized market chart">
      <defs>
        <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ifm-color-primary)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--ifm-color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[60, 120, 180, 240].map((y) => (
        <line key={y} x1="0" x2="460" y1={y} y2={y} className={styles.heroGrid} />
      ))}
      <path
        d="M0 245 L46 210 L92 226 L138 176 L184 194 L230 138 L276 158 L322 108 L368 126 L414 78 L460 92 L460 300 L0 300 Z"
        fill="url(#heroArea)"
      />
      <path
        d="M0 245 L46 210 L92 226 L138 176 L184 194 L230 138 L276 158 L322 108 L368 126 L414 78 L460 92"
        fill="none"
        stroke="var(--ifm-color-primary)"
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="414" cy="78" r="6" className={styles.heroDot} />
      <g className={styles.heroFormula}>
        <rect x="18" y="22" rx="8" width="210" height="38" />
        <text x="32" y="47">dS = μS dt + σS dW</text>
      </g>
      <g className={styles.heroFormula}>
        <rect x="250" y="200" rx="8" width="160" height="38" />
        <text x="264" y="225">Δ = ∂V / ∂S</text>
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <Layout
      title="Quantitative Finance"
      description="Interactive quantitative finance notes by Joyeb Kashyeb — math, markets and machine learning with runnable Python and hands-on pricing labs.">
      <header className={styles.hero}>
        <div className={clsx('container', styles.heroInner)}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>Quantitative finance · self-study, in public</p>
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
            <div className={styles.heroChips}>
              <span>9 subject areas</span>
              <span>Python runs in your browser</span>
              <span>Hands-on pricing labs</span>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <HeroChart />
          </div>
        </div>
      </header>

      <main>
        <section className={styles.section}>
          <div className="container">
            <Heading as="h2" className={styles.sectionTitle}>
              The curriculum
            </Heading>
            <p className={styles.sectionSub}>
              Six pillars, one goal: the skill set of a working quant.
            </p>
            <div className={styles.grid3}>
              {SUBJECTS.map((s) => (
                <Link key={s.title} to={s.to} className={styles.subjectCard}>
                  <span className={styles.subjectIcon}>{s.icon}</span>
                  <span className={styles.subjectTitle}>{s.title}</span>
                  <span className={styles.subjectBlurb}>{s.blurb}</span>
                  <span className={styles.subjectCta}>Open notes →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={clsx(styles.section, styles.sectionAlt)}>
          <div className="container">
            <Heading as="h2" className={styles.sectionTitle}>
              Built to be played with
            </Heading>
            <p className={styles.sectionSub}>
              Reading about quant finance is easy. This site makes you <em>do</em> it.
            </p>
            <div className={styles.grid4}>
              {FEATURES.map((f) => (
                <Link key={f.title} to={f.to} className={styles.featureCard}>
                  <span className={styles.featureIcon}>{f.icon}</span>
                  <span className={styles.featureTitle}>{f.title}</span>
                  <span className={styles.featureBlurb}>{f.blurb}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.ctaBand}>
          <div className="container">
            <Heading as="h2">Theory in one tab, markets in the other.</Heading>
            <p>The built-in terminal streams live charts and news while you study.</p>
            <Link className="button button--primary button--lg" to="/terminal">
              Open the terminal
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
