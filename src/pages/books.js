import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import ResourceCards from '@site/src/components/ResourceCards';

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
    <Layout title="Books" description="Recommended books for quantitative finance — math, statistics, programming, and finance.">
      <header className="hero hero--primary" style={{ padding: '2.5rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title">Books</Heading>
          <p className="hero__subtitle">Recommended reading across math, programming, and finance.</p>
        </div>
      </header>
      <main>
        <ResourceCards
          intro="A curated bookshelf for the quant journey. Work through them alongside the roadmap."
          sections={SECTIONS}
        />
      </main>
    </Layout>
  );
}
