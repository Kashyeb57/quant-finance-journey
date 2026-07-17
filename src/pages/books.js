import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import ResourceCards from '@site/src/components/ResourceCards';
import BookShelf from '@site/src/components/BookShelf';

// My own library — PDFs living in my GitHub repos, served as application/pdf
// through jsDelivr's CDN so they can be embedded in the on-site reader
// (/read) and opened without ever leaving this site.
const QIP = 'https://cdn.jsdelivr.net/gh/Kashyeb57/Quant-Interview-Prep-Resources@main';
const QR = 'https://cdn.jsdelivr.net/gh/Kashyeb57/Quant_resources@main';

const LIBRARY = [
  // ── Core textbooks ────────────────────────────────────────────────
  {
    title: 'Options, Futures & Other Derivatives (9th ed.)',
    author: 'John C. Hull',
    category: 'Core Textbooks',
    url: `${QIP}/Hull%20J.C.-Options%2C%20Futures%20and%20Other%20Derivatives_9th%20edition.pdf`,
  },
  {
    title: 'Concepts & Practice of Mathematical Finance',
    author: 'Mark S. Joshi',
    category: 'Core Textbooks',
    url: `${QR}/Concepts%20_%20Practice%20of%20Mathematical%20Finance%20-%20M.%20S.%20Joshi.pdf`,
  },
  {
    title: 'The ETF Handbook',
    author: 'David J. Abner',
    category: 'Core Textbooks',
    url: `${QIP}/The%20ETF%20Handbook%20How%20to%20Value%20and%20Trade%20Exchange%20Traded%20Funds%20by%20David%20J.%20Abner%20(z-lib.org).pdf`,
  },
  {
    title: 'A Primer in Game Theory',
    author: 'Robert Gibbons',
    category: 'Core Textbooks',
    url: `${QIP}/A_primer_in_game_theory.pdf`,
  },

  // ── Quant interview prep ──────────────────────────────────────────
  {
    title: 'A Practical Guide to Quantitative Finance Interviews',
    author: 'Xinfeng Zhou',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QR}/A%20Practical%20Guide%20to%20Quantitative%20Financial%20Interviews%20(X.%20Zhou).pdf`,
  },
  {
    title: 'Heard on the Street',
    author: 'Timothy Falcon Crack',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QR}/Heard%20on%20the%20Street%20-%20Quantitative%20Questions%20from%20Wall%20Street%20Job%20Interviews%20(T.%20Crack).pdf`,
  },
  {
    title: 'Quant Job Interview Questions & Answers',
    author: 'Mark Joshi',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QIP}/markjoshi-InterviewQuestions-QuantJob.pdf`,
  },
  {
    title: 'Quantitative Finance Questions',
    author: 'Interview compilation',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QIP}/quant-finance-questions.pdf`,
  },
  {
    title: 'Quant Interview Questions',
    author: 'Interview compilation',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QR}/Quant%20Interview%20Questions.pdf`,
  },
  {
    title: 'FAQ of Quant Finance',
    author: 'Interview compilation',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QR}/FAQ%20of%20Quant%20Finance.pdf`,
  },
  {
    title: 'Trading Interview',
    author: 'Prep notes',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QIP}/trading-interview.pdf`,
  },
  {
    title: 'Market Making Guide',
    author: 'Prep notes',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QIP}/MARKET%20MAKING%20GUIDE.pdf`,
  },
  {
    title: 'Market Making — Technical Interview',
    author: 'Prep notes',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QIP}/MM%20explanation%20-%20Technical%20Interview.pdf`,
  },
  {
    title: 'WorldQuant University Proficiency Test',
    author: 'Practice test',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QIP}/world-quant-university-proficiency-test.pdf`,
  },
  {
    title: 'Quantitative Proficiency Test',
    author: 'Practice test',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QIP}/quantitative-proficiency-test-231-pdfcoffee.pdf`,
  },
  {
    title: '64 HR Questions',
    author: 'Behavioral prep',
    category: 'Quant Interview Prep',
    shortCat: 'Interview',
    url: `${QIP}/64_HR_Questions.pdf`,
  },

  // ── Probability, puzzles & math ───────────────────────────────────
  {
    title: 'Fifty Challenging Problems in Probability',
    author: 'Frederick Mosteller',
    category: 'Probability, Puzzles & Math',
    shortCat: 'Probability',
    url: `${QIP}/fifty_challenging_problems_in__2.pdf`,
  },
  {
    title: 'Challenging Mathematical Problems with Elementary Solutions, Vol. 1',
    author: 'Yaglom & Yaglom',
    category: 'Probability, Puzzles & Math',
    shortCat: 'Math',
    url: `${QIP}/Yaglom%2C%20Yaglom%20-%20Challenging%20Mathematical%20Problems%20with%20Elementary%20Solutions%20Vol.%201%20.pdf`,
  },
  {
    title: 'The Probabilistic Method',
    author: 'Alon & Spencer',
    category: 'Probability, Puzzles & Math',
    shortCat: 'Math',
    url: `${QIP}/ProbabilisticMethod.pdf`,
  },
  {
    title: "Competitive Programmer's Handbook",
    author: 'Antti Laaksonen',
    category: 'Probability, Puzzles & Math',
    shortCat: 'Algorithms',
    url: `${QIP}/CP%20Handbook.pdf`,
  },
  {
    title: 'Probability Cheatsheet',
    author: 'Blitzstein & Chen',
    category: 'Probability, Puzzles & Math',
    shortCat: 'Probability',
    url: `${QIP}/probability_cheatsheet.pdf`,
  },
  {
    title: 'Probability Questions',
    author: 'Practice set',
    category: 'Probability, Puzzles & Math',
    shortCat: 'Probability',
    url: `${QIP}/probabilityQuestions.pdf`,
  },
  {
    title: 'Probability — Course Notes',
    author: 'COT 3100',
    category: 'Probability, Puzzles & Math',
    shortCat: 'Probability',
    url: `${QIP}/COT3100Probability05.pdf`,
  },
  {
    title: 'Brain-teaser Puzzles',
    author: 'Quant puzzles',
    category: 'Probability, Puzzles & Math',
    shortCat: 'Puzzles',
    url: `${QIP}/Puzzles.pdf`,
  },
  {
    title: 'Dice Problems',
    author: 'Probability puzzles',
    category: 'Probability, Puzzles & Math',
    shortCat: 'Puzzles',
    url: `${QIP}/dice1.pdf`,
  },

  // ── Markets & trading notes ───────────────────────────────────────
  {
    title: 'Derivatives — A Primer',
    author: 'Study notes',
    category: 'Markets & Trading Notes',
    shortCat: 'Markets',
    url: `${QR}/Derivatives.pdf`,
  },
  {
    title: 'The Long Straddle',
    author: 'Options strategy note',
    category: 'Markets & Trading Notes',
    shortCat: 'Markets',
    url: `${QR}/Long_straddle.pdf`,
  },
  {
    title: 'Moving Averages — SMA & EMA',
    author: 'Technical analysis note',
    category: 'Markets & Trading Notes',
    shortCat: 'Markets',
    url: `${QR}/SMA%20%26%20EMA.pdf`,
  },
  {
    title: 'Financial Ratios for Executives',
    author: 'Reference',
    category: 'Markets & Trading Notes',
    shortCat: 'Markets',
    url: `${QR}/Financial%20Ratios%20for%20Executives.pdf`,
  },
  {
    title: 'Credit Suisse — Cash Flow & OOPS for Fintech',
    author: 'Case note',
    category: 'Markets & Trading Notes',
    shortCat: 'Markets',
    url: `${QR}/CREDIT%20SUISSE%20CASH%20FLOW%20AND%20OOPS%20LESSON%20FOR%20FINTECH.pdf`,
  },
];

const SECTIONS = [
  {
    title: 'Mathematics & Statistics',
    groups: [
      { group: 'Linear Algebra', items: [{ label: 'Linear Algebra and Its Applications — Gilbert Strang' }] },
      {
        group: 'Probability',
        items: [
          { label: 'A First Course in Probability — Sheldon Ross' },
          { label: 'Introduction to Probability — Blitzstein & Hwang' },
        ],
      },
      {
        group: 'Econometrics',
        items: [
          { label: 'Econometric Analysis — William Greene' },
          { label: 'Introductory Econometrics: A Modern Approach — Jeffrey Wooldridge' },
          { label: 'Analysis of Financial Time Series — Ruey Tsay' },
        ],
      },
    ],
  },
  {
    title: 'Programming',
    groups: [
      {
        group: 'Python',
        items: [
          { label: 'Effective Python — Brett Slatkin' },
          { label: 'Fluent Python — Luciano Ramalho (advanced)' },
        ],
      },
      { group: 'Data Structures', items: [{ label: 'Data Structures & Algorithms in Python — Goodrich et al.' }] },
      {
        group: 'Machine Learning',
        items: [
          { label: 'Machine Learning and Applications — Peter Flach' },
          { label: 'Advances in Financial Machine Learning — Marcos López de Prado' },
        ],
      },
    ],
  },
  {
    title: 'Finance & Misc.',
    groups: [
      { group: 'Derivatives', items: [{ label: 'Options, Futures and Other Derivatives — Hull & Basu' }] },
      { group: 'Fixed Income', items: [{ label: 'Handbook of Fixed Income Securities — Frank Fabozzi' }] },
      {
        group: 'Miscellaneous',
        items: [
          { label: 'Paul Wilmott on Quantitative Finance' },
          { label: 'My Life as a Quant — Emanuel Derman' },
          { label: 'Asset Management — Andrew Ang' },
        ],
      },
    ],
  },
];

export default function BooksPage() {
  return (
    <Layout title="Books" description="My quant library — read textbooks, interview guides, and probability puzzle books right in the browser, plus a curated recommended-reading list.">
      <header className="hero hero--primary" style={{ padding: '2.5rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title">Library</Heading>
          <p className="hero__subtitle">
            My own collection — click any cover to read it right in your browser.
          </p>
        </div>
      </header>
      <main>
        <section style={{ padding: '2rem 0 1rem' }}>
          <div className="container">
            <Heading as="h2" style={{ letterSpacing: '-0.02em' }}>
              📖 My digital library
            </Heading>
            <p style={{ color: 'var(--ifm-color-emphasis-700)', maxWidth: '48rem' }}>
              {LIBRARY.length} books &amp; guides I keep in my GitHub repos. Click a cover and it
              opens in an in-browser reader — no download needed. Filter by category below.
            </p>
          </div>
          <BookShelf books={LIBRARY} />
        </section>

        <section style={{ padding: '2.5rem 0 1rem', borderTop: '1px solid var(--ifm-toc-border-color)', marginTop: '2rem' }}>
          <div className="container">
            <Heading as="h2" style={{ letterSpacing: '-0.02em' }}>
              ⭐ Recommended reading
            </Heading>
            <p style={{ color: 'var(--ifm-color-emphasis-700)' }}>
              The canonical texts I'm working through alongside the roadmap.
            </p>
          </div>
          <ResourceCards sections={SECTIONS} />
        </section>
      </main>
    </Layout>
  );
}
