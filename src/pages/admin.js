import { useState } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import Heading from '@theme/Heading';
import styles from './admin.module.css';

const REPO = 'https://github.com/Kashyeb57/Quantitative-Finance_Joyeb';

const NOTE_TEMPLATE = `---
title: My New Note
---

# My New Note

Write your notes here. **Bold**, *italic*, $E = mc^2$ math, and Python:

\`\`\`python
print("this code will be runnable on the site!")
\`\`\`
`;

const SECTIONS = [
  { name: 'Finance', dir: 'docs/Finance' },
  { name: 'Mathematics', dir: 'docs/Mathematics' },
  { name: 'Probability', dir: 'docs/Probability' },
  { name: 'Statistics', dir: 'docs/Statistics' },
  { name: 'Economics', dir: 'docs/Economics' },
  { name: 'Machine Learning', dir: 'docs/Machine_Learning' },
  { name: 'Python course', dir: 'docs/Programming/Python' },
  { name: 'Programming', dir: 'docs/Programming' },
];

const SNIPPETS = [
  {
    label: 'Quiz',
    code: `<Quiz questions={[
  {
    q: 'Your question?',
    options: ['A', 'B', 'C'],
    answer: 1,
    explain: 'Why B is correct.',
  },
]} />`,
  },
  {
    label: 'Python sandbox',
    code: `<PySandbox title="Try it yourself" code={\`print("hello quant")\`} />`,
  },
  { label: 'Option payoff lab', code: `<PayoffDiagram />` },
  { label: 'Black–Scholes lab', code: `<BlackScholesLab />` },
  { label: 'Normal distribution lab', code: `<NormalExplorer />` },
  { label: 'Monte Carlo simulator', code: `<GBMSimulator />` },
  { label: 'Compound interest lab', code: `<CompoundInterestLab />` },
  {
    label: 'Flashcards',
    code: `<Flashcards cards={[
  { front: 'Term', back: 'Definition' },
]} />`,
  },
];

function newFileUrl(dir) {
  return `${REPO}/new/main/${dir}?filename=my-new-note.mdx&value=${encodeURIComponent(NOTE_TEMPLATE)}`;
}

function Snippet({ label, code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className={styles.snippet}>
      <div className={styles.snippetHead}>
        <span>{label}</span>
        <button onClick={copy} className={styles.copyBtn}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className={styles.snippetCode}>{code}</pre>
    </div>
  );
}

export default function Admin() {
  return (
    <Layout title="Publishing Studio" description="Owner tools for publishing content.">
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className={styles.wrap}>
        <div className={styles.header}>
          <Heading as="h1">✍️ Publishing Studio</Heading>
          <p>
            Create notes, upload files, and edit any page — <b>no code, no terminal</b>. Everything
            here runs through GitHub, so it works only for you: visitors without access to your
            repository simply can't publish. After you commit, the site rebuilds and goes live
            automatically in ~3 minutes.
          </p>
        </div>

        <div className={styles.grid}>
          <section className={styles.card}>
            <h2>📝 Create a new note</h2>
            <p>
              Pick a section — GitHub opens a new file with a ready-made template. Write, scroll
              down, press <b>Commit changes</b>, done.
            </p>
            <div className={styles.chipRow}>
              {SECTIONS.map((s) => (
                <a key={s.dir} href={newFileUrl(s.dir)} target="_blank" rel="noreferrer" className={styles.chip}>
                  {s.name}
                </a>
              ))}
            </div>
            <p className={styles.tip}>
              Tip: name the file ending in <code>.mdx</code> to use the interactive widgets below,
              or plain <code>.md</code> for simple notes.
            </p>
          </section>

          <section className={styles.card}>
            <h2>📤 Upload images & files</h2>
            <p>
              Drag-and-drop PDFs, images, anything. Uploaded images live at{' '}
              <code>/img/your-file.png</code> and can be shown in any note with{' '}
              <code>![caption](/img/your-file.png)</code>.
            </p>
            <div className={styles.btnRow}>
              <a className="button button--primary" href={`${REPO}/upload/main/static/img`} target="_blank" rel="noreferrer">
                Upload images
              </a>
              <a className="button button--secondary" href={`${REPO}/upload/main/docs`} target="_blank" rel="noreferrer">
                Upload docs / PDFs
              </a>
            </div>
          </section>

          <section className={styles.card}>
            <h2>✏️ Edit any page</h2>
            <p>
              Every notes page has an <b>“Edit this page”</b> link at the bottom — it opens that
              exact file in the GitHub editor. Or browse everything:
            </p>
            <div className={styles.btnRow}>
              <a className="button button--secondary" href={`${REPO}/tree/main/docs`} target="_blank" rel="noreferrer">
                Browse all notes
              </a>
              <a className="button button--secondary" href={`${REPO}/edit/main/docusaurus.config.js`} target="_blank" rel="noreferrer">
                Site settings
              </a>
            </div>
          </section>

          <section className={styles.card}>
            <h2>🚀 Watch it go live</h2>
            <p>
              Every commit triggers an automatic build & deploy. Green check = live on{' '}
              <a href="https://joyebkashyeb.com.np">joyebkashyeb.com.np</a>.
            </p>
            <div className={styles.btnRow}>
              <a className="button button--secondary" href={`${REPO}/actions`} target="_blank" rel="noreferrer">
                Deployment status
              </a>
            </div>
            <ol className={styles.steps}>
              <li>Write or upload on GitHub</li>
              <li>Press “Commit changes”</li>
              <li>~3 min later it's live ✨</li>
            </ol>
          </section>
        </div>

        <section className={styles.snippets}>
          <Heading as="h2">🧩 Interactive widgets — copy & paste into any .mdx note</Heading>
          <p className={styles.tip}>
            These work with zero imports. Paste one into a note and it renders as a live widget.
          </p>
          <div className={styles.snippetGrid}>
            {SNIPPETS.map((s) => (
              <Snippet key={s.label} {...s} />
            ))}
          </div>
        </section>

        <p className={styles.footNote}>
          🔒 <b>Why only you?</b> Publishing requires committing to{' '}
          <a href={REPO}>your GitHub repository</a>. GitHub asks anyone who tries to sign in — and
          only your account has write access. Readers can browse this page, but every button above
          is a locked door for them. <Link to="/">← Back to the site</Link>
        </p>
      </main>
    </Layout>
  );
}
