import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Projects from '@site/src/components/Projects';

export default function ProjectsPage() {
  return (
    <Layout title="Projects" description="My quantitative finance projects — models, backtests, tools, and experiments.">
      <header className="hero hero--primary" style={{ padding: '2.5rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title">Projects</Heading>
          <p className="hero__subtitle">What I&rsquo;ve built on the quant journey.</p>
        </div>
      </header>
      <main>
        <Projects />
      </main>
    </Layout>
  );
}
