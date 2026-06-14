import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Tools from '@site/src/components/Tools';

export default function ToolsPage() {
  return (
    <Layout title="Tools" description="Software and tools I use for quantitative finance work.">
      <header className="hero hero--primary" style={{ padding: '2.5rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title">Tools</Heading>
          <p className="hero__subtitle">The software in my quant toolkit.</p>
        </div>
      </header>
      <main>
        <Tools />
      </main>
    </Layout>
  );
}
