import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Terminal from '@site/src/components/Terminal';

export default function TerminalPage() {
  return (
    <Layout title="Terminal" description="A market terminal — live stock charts and news.">
      <header className="hero hero--primary" style={{ padding: '2rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title">Market Terminal</Heading>
          <p className="hero__subtitle">Stock charts and news, side by side.</p>
        </div>
      </header>
      <main>
        <Terminal />
      </main>
    </Layout>
  );
}
