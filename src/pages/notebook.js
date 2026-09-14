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
          <Heading as="h1">Python Notebook</Heading>
          <p>
            A Jupyter-style notebook that runs <b>entirely in your browser</b> — nothing to install,
            no account.
          </p>
          <details className={styles.how}>
            <summary>How it works</summary>
            <ul>
              <li>
                Variables persist between cells. <code>numpy</code>, <code>pandas</code>,{' '}
                <code>matplotlib</code> and <code>scipy</code> load when you import them, and plots
                appear below the cell.
              </li>
              <li>
                The first run downloads the Python runtime (~10 MB), and heavy packages add a few
                seconds on their first import. Later runs reuse what is already loaded.
              </li>
              <li>
                Your cell code is saved in this browser; variables are not, so re-run cells after a
                reload.
              </li>
              <li>
                <i>Stop</i> ends a long-running cell by restarting Python, which also clears your
                variables.
              </li>
            </ul>
          </details>
        </div>
        <Notebook />
        <div className={styles.tips}>
          <b>Tips:</b> <kbd>Shift</kbd>+<kbd>Enter</kbd> runs a cell · <kbd>Esc</kbd> then{' '}
          <kbd>Tab</kbd> leaves a cell · the last expression in a cell is echoed like a REPL ·{' '}
          <i>Restart kernel</i> clears all variables · <i>Reset examples</i> brings back the starter
          cells, and <i>Undo</i> brings yours back. Try changing the volatility in the GBM cell and
          re-running it!
        </div>
      </main>
    </Layout>
  );
}
