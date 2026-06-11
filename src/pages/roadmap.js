import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import QuantRoadmap from '@site/src/components/QuantRoadmap';

export default function RoadmapPage() {
  return (
    <Layout
      title="Quant Roadmap"
      description="An interactive, trackable roadmap for becoming a quant — five pillars across three levels, scored against the Trader, Developer, and Researcher tracks.">
      <header className="hero hero--primary" style={{ padding: '2.5rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title">Quant Roadmap</Heading>
          <p className="hero__subtitle">
            Track your journey across Math, Probability &amp; Statistics, CS, ML, and Finance.
          </p>
        </div>
      </header>
      <main>
        <QuantRoadmap />
      </main>
    </Layout>
  );
}
