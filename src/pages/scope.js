import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import ResourceCards from '@site/src/components/ResourceCards';

/*
 * Scope — firms that hire from quantitative finance.
 * Tiers reflect a community-circulated "quant firm tier list" (opinion, not
 * official rankings). The elite "100% Quant" firms are grouped by tier; large
 * tech and finance firms also hire quant-skilled graduates.
 */

const SECTIONS = [
  {
    title: 'God Tier',
    groups: [
      {
        items: [
          { label: 'Renaissance Technologies' },
          { label: 'Radix Trading' },
          { label: 'TGS Management' },
          { label: 'Arrowstreet Capital' },
          { label: 'PDT Partners' },
        ],
      },
    ],
  },
  {
    title: 'SSS Tier',
    groups: [
      {
        items: [
          { label: 'Citadel / Citadel Securities' },
          { label: 'Point72' },
          { label: 'Jane Street' },
          { label: 'Hudson River Trading (HRT)' },
          { label: 'Jump Trading' },
          { label: 'Quadrature Capital' },
          { label: 'Bridgewater Associates' },
        ],
      },
    ],
  },
  {
    title: 'SS Tier',
    groups: [
      {
        items: [
          { label: 'Optiver' },
          { label: 'Two Sigma' },
          { label: 'D. E. Shaw & Co.' },
          { label: 'Five Rings' },
          { label: 'The Voleon Group' },
          { label: 'XTX Markets' },
          { label: 'Squarepoint Capital' },
        ],
      },
    ],
  },
  {
    title: 'SS- Tier',
    groups: [
      {
        items: [
          { label: 'IMC Trading' },
          { label: 'Susquehanna (SIG)' },
          { label: 'DRW' },
          { label: 'Virtu Financial' },
          { label: 'Millennium' },
          { label: 'Tower Research Capital' },
          { label: 'AQR Capital Management' },
          { label: 'WorldQuant' },
        ],
      },
    ],
  },
  {
    title: 'Also Hiring Quants',
    groups: [
      {
        group: 'Big Tech & Finance',
        items: [
          { label: 'Quant skills also open doors at OpenAI, Nvidia, Google, Meta, Microsoft, Amazon, Bloomberg, and major banks — strong math/CS/ML transfers directly.' },
        ],
      },
    ],
  },
];

export default function ScopePage() {
  return (
    <Layout title="Scope" description="Quant firms and companies that hire from quantitative finance.">
      <header className="hero hero--primary" style={{ padding: '2.5rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title">Scope</Heading>
          <p className="hero__subtitle">Where quants get hired — the firms to aim for.</p>
        </div>
      </header>
      <main>
        <ResourceCards
          intro="Elite quantitative-finance firms, grouped by a community-circulated tier list (opinion, not official rankings). These are the “100% quant” shops; big tech and banks hire quant-skilled grads too."
          sections={SECTIONS}
        />
      </main>
    </Layout>
  );
}
