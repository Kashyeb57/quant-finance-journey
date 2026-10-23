import React from 'react';
import Layout from '@theme/Layout';
import BrowserOnly from '@docusaurus/BrowserOnly';
import PageHeader from '@site/src/components/PageHeader';
import { ChartSkeleton } from '@site/src/components/Terminal/Skeletons';

export default function DeskPage() {
  return (
    <Layout title="Quant Desk" description="One-screen quant workstation: live chart, implied-vol surface, options depth, risk and the SATS model.">
      <PageHeader
        eyebrow="Live · market data"
        title="Quant Desk"
        subtitle="Price action, volatility, positioning and risk on one screen."
      />
      <main>
        <BrowserOnly fallback={<div style={{ padding: '2rem' }}><ChartSkeleton /></div>}>
          {() => {
            const Desk = require('@site/src/components/Desk').default;
            return <Desk />;
          }}
        </BrowserOnly>
      </main>
    </Layout>
  );
}
