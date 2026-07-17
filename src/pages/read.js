import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import BrowserOnly from '@docusaurus/BrowserOnly';
import PdfReader from '@site/src/components/PdfReader';
import styles from './read.module.css';

// Only books from my own repos may be opened — this keeps /read from being
// turned into an open renderer for any URL.
const ALLOWED_PREFIX = 'https://raw.githubusercontent.com/Kashyeb57/';

function Reader() {
  const params = new URLSearchParams(window.location.search);
  const file = params.get('file') || '';
  const title = params.get('title') || 'Reader';

  if (!file) {
    return (
      <div className={styles.msg}>
        <p>No book selected.</p>
        <Link className="button button--primary" to="/books">← Back to the Library</Link>
      </div>
    );
  }
  if (!file.startsWith(ALLOWED_PREFIX)) {
    return (
      <div className={styles.msg}>
        <p>This reader only opens books from the Library.</p>
        <Link className="button button--primary" to="/books">← Back to the Library</Link>
      </div>
    );
  }

  return (
    <div className={styles.readerWrap}>
      <div className={styles.toolbar}>
        <Link to="/books" className={styles.back}>← Library</Link>
        <span className={styles.title} title={title}>{title}</span>
        <span className={styles.actions}>
          <a href={file} target="_blank" rel="noreferrer">Open PDF ↗</a>
          <a href={file} download>Download ↓</a>
        </span>
      </div>
      <div className={styles.frame}>
        <PdfReader url={file} title={title} />
      </div>
    </div>
  );
}

export default function ReadPage() {
  return (
    <Layout title="Reader" description="Read a book from the Library, right here in your browser.">
      <BrowserOnly fallback={<div className={styles.msg}><p>Loading the reader…</p></div>}>
        {() => <Reader />}
      </BrowserOnly>
    </Layout>
  );
}
