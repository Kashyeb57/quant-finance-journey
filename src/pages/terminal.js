import React from 'react';
import Layout from '@theme/Layout';
import PageHeader from '@site/src/components/PageHeader';
import Heading from '@theme/Heading';
import Terminal from '@site/src/components/Terminal';

export default function TerminalPage() {
  return (
    <Layout title="Terminal" description="A market terminal: live stock charts, news, option chains with greeks, expected moves, volatility and risk.">
      <PageHeader
        eyebrow="Live · market data"
        title="Market Terminal"
        subtitle="Charts, news, options and risk. Collapse or reorder any section."
      />
      <main>
        <Terminal />
      </main>
    </Layout>
  );
}
