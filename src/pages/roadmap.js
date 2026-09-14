import React from 'react';
import Layout from '@theme/Layout';
import PageHeader from '@site/src/components/PageHeader';
import Heading from '@theme/Heading';
import QuantRoadmap, {TRACKS} from '@site/src/components/QuantRoadmap';
import MathDeepDive from '@site/src/components/MathDeepDive';

export default function RoadmapPage() {
  return (
    <Layout
      title="Quant Roadmap"
      description={`An interactive, trackable roadmap for becoming a quant — five pillars across three levels, scored against ${TRACKS.length} quant career tracks, from Quant Analyst to Credit Risk Quant.`}>
      <PageHeader
        eyebrow="Career path"
        title="Quant Roadmap"
        subtitle="Track your journey across Math, Probability & Statistics, CS, ML, and Finance."
      />
      <main>
        <QuantRoadmap />
        <MathDeepDive />
      </main>
    </Layout>
  );
}
