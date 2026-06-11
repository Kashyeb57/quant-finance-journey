import React from 'react';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import ResourceCards from '@site/src/components/ResourceCards';

const SECTIONS = [
  {
    title: 'Mathematics',
    groups: [
      {
        group: 'Courses',
        items: [
          { label: 'Single Variable Calculus — MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/18-01-single-variable-calculus-fall-2006/' },
          { label: 'Multivariable Calculus — MIT OpenCourseWare', url: 'https://ocw.mit.edu/courses/18-02-multivariable-calculus-fall-2007/' },
          { label: 'Mathematical Methods for Quantitative Finance — edX', url: 'https://www.edx.org/search?q=mathematical%20methods%20for%20quantitative%20finance' },
          { label: 'NPTEL — Mathematics lecture series', url: 'http://www.digimat.in/nptel/courses/video/111104144/L01.html' },
        ],
      },
    ],
  },
  {
    title: 'Programming',
    groups: [
      {
        group: 'Courses',
        items: [
          { label: '100 Days of Code: Python — Udemy', url: 'https://www.udemy.com/course/100-days-of-code/' },
          { label: 'Data Structures & Algorithms in C (IBM) — edX', url: 'https://www.edx.org/learn/data-structures/ibm-data-structures-algorithms-using-c' },
          { label: 'Machine Learning A-Z — Udemy', url: 'https://www.udemy.com/course/machinelearning/' },
        ],
      },
    ],
  },
  {
    title: 'Finance',
    groups: [
      {
        group: 'Courses',
        items: [
          { label: 'Kaplan Schweser CFA Level 1 — Equity Investments, Financial Statement Analysis (Book 2), Portfolio Management (Book 4)' },
          { label: 'Financial Markets (Yale, Robert Shiller) — Coursera', url: 'https://www.coursera.org/learn/financial-markets-global' },
        ],
      },
    ],
  },
  {
    title: 'YouTube Channels',
    groups: [
      {
        items: [
          { label: '3Blue1Brown — Animated Math (Essence of Linear Algebra/Calculus)', url: 'https://www.youtube.com/@3blue1brown' },
          { label: 'StatQuest with Josh Starmer — Statistics & ML', url: 'https://www.youtube.com/@statquest' },
          { label: 'Quant Guild — Roman Paolucci', url: 'https://www.youtube.com/@QuantGuild' },
        ],
      },
    ],
  },
];

export default function ResourcesPage() {
  return (
    <Layout title="Resources" description="Courses, lectures, and channels for learning quantitative finance.">
      <header className="hero hero--primary" style={{ padding: '2.5rem 1rem' }}>
        <div className="container">
          <Heading as="h1" className="hero__title">Resources</Heading>
          <p className="hero__subtitle">Courses, lectures, and channels — where to learn each topic.</p>
        </div>
      </header>
      <main>
        <ResourceCards
          intro="Free and paid courses, plus the YouTube channels worth following on the quant path."
          sections={SECTIONS}
        />
      </main>
    </Layout>
  );
}
