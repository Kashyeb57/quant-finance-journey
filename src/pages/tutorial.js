import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import TutorialHub from '@site/src/components/TutorialHub';

export default function TutorialPage() {
  return (
    <Layout title="Tutorial" description="Study notes by field — Finance, Mathematics, Statistics, Probability, Economics, Programming, and Machine Learning.">
      <header className="hero hero--primary" style={{ padding: '2.5rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title">Tutorial</Heading>
          <p className="hero__subtitle">My study notes, organized by field — click any topic to dive in.</p>
        </div>
      </header>
      <main>
        <TutorialHub />
      </main>
    </Layout>
  );
}
