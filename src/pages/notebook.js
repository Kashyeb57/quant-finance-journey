import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Notebook from '@site/src/components/Interactive/Notebook';
import styles from './notebook.module.css';

export default function NotebookPage() {
  return (
    <Layout
      title="Python Notebook"
      description="A Jupyter-style Python notebook that runs entirely in your browser — numpy, pandas and matplotlib included. No installs, no server.">
      <main className={styles.wrap}>
        <div className={styles.head}>
          <Heading as="h1">🐍 Python Notebook</Heading>
          <p>
            A Jupyter-style notebook that runs <b>entirely in your browser</b> — nothing to install,
            no server, no account. Variables persist between cells, <code>numpy</code>,{' '}
            <code>pandas</code>, <code>matplotlib</code> and <code>scipy</code> load automatically
            when you import them, and plots render right below the cell. Your cells are saved in
            this browser, so your scratch work survives a refresh.
          </p>
          <p className={styles.note}>
            First run downloads the Python runtime (~10 MB) — after that it's instant. Heavy
            packages like numpy add a few seconds on their first import only.
          </p>
        </div>
        <Notebook />
        <div className={styles.tips}>
          <b>Tips:</b> <kbd>Shift</kbd>+<kbd>Enter</kbd> runs a cell · the last expression in a
          cell is echoed like a REPL · <i>Restart kernel</i> clears all variables ·{' '}
          <i>Reset examples</i> brings back the starter cells. Try changing the volatility in the
          GBM cell and re-running it!
        </div>
      </main>
    </Layout>
  );
}
