import React, { useEffect, useRef, useState } from 'react';
import styles from './notebook.module.css';
import { createNamespace, runPythonCell, isPyodideLoaded } from './pyRuntime';

const STARTER_CELLS = [
  `# Welcome to your in-browser Python notebook!
# Variables persist between cells, exactly like Jupyter.
msg = "Hello, quant world"
prices = [100, 102.5, 101.8, 105.2, 107.9]
print(msg)`,
  `# numpy auto-loads when you import it (first import takes a few seconds)
import numpy as np

returns = np.diff(prices) / np.array(prices[:-1])
print("daily returns:  ", np.round(returns, 4))
print("annualized vol: ", round(float(np.std(returns) * np.sqrt(252)), 4))`,
  `# matplotlib works too — plots appear right below the cell
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(42)
T, n, paths = 1.0, 252, 12
dt = T / n
steps = (0.07 - 0.5 * 0.2**2) * dt + 0.2 * np.sqrt(dt) * rng.standard_normal((n, paths))
S = 100 * np.exp(np.cumsum(steps, axis=0))

plt.figure(figsize=(8, 4))
plt.plot(S, lw=1)
plt.title("12 simulated GBM price paths")
plt.xlabel("trading day")
plt.ylabel("price")
plt.show()`,
];

let nextId = 1;
const newCell = (source = '') => ({ id: nextId++, source });

/**
 * A Jupyter-style multi-cell Python notebook running fully in the browser.
 * <Notebook /> or <Notebook initialCells={['print(1)']} storageKey="my-lesson" />
 */
export default function Notebook({ initialCells, storageKey = 'qf-notebook-v1' }) {
  const [cells, setCells] = useState(() => (initialCells || STARTER_CELLS).map(newCell));
  const [results, setResults] = useState({}); // id -> {count, output, error, images, state}
  const [kernelBusy, setKernelBusy] = useState(false);
  const [booted, setBooted] = useState(false);
  const nsRef = useRef(null);
  const execCount = useRef(0);

  // Restore saved cells after mount (SSR-safe).
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey));
      if (Array.isArray(saved) && saved.length) {
        setCells(saved.map((source) => newCell(source)));
      }
    } catch (e) {
      /* keep starters */
    }
    setBooted(true);
  }, [storageKey]);

  // Persist sources whenever they change.
  useEffect(() => {
    if (!booted) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cells.map((c) => c.source)));
    } catch (e) {
      /* storage full/blocked — not fatal */
    }
  }, [cells, booted, storageKey]);

  const setResult = (id, patch) =>
    setResults((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  const runCell = async (cell) => {
    setKernelBusy(true);
    setResult(cell.id, {
      state: isPyodideLoaded() ? 'running' : 'booting',
      output: null,
      error: null,
      images: [],
    });
    try {
      if (!nsRef.current) nsRef.current = await createNamespace();
      const res = await runPythonCell(cell.source, nsRef.current, (s) =>
        setResult(cell.id, { state: s === 'loading-packages' ? 'packages' : 'running' })
      );
      execCount.current += 1;
      setResult(cell.id, { ...res, state: 'done', count: execCount.current });
    } catch (e) {
      setResult(cell.id, { state: 'done', error: String(e), output: null, images: [] });
    }
    setKernelBusy(false);
  };

  const runAll = async () => {
    for (const cell of cells) {
      // eslint-disable-next-line no-await-in-loop
      await runCell(cell);
    }
  };

  const restartKernel = () => {
    if (nsRef.current) {
      try {
        nsRef.current.destroy();
      } catch (e) {
        /* already gone */
      }
    }
    nsRef.current = null;
    execCount.current = 0;
    setResults({});
  };

  const updateSource = (id, source) =>
    setCells((cs) => cs.map((c) => (c.id === id ? { ...c, source } : c)));

  const addCell = (afterIndex) =>
    setCells((cs) => {
      const next = [...cs];
      next.splice(afterIndex + 1, 0, newCell(''));
      return next;
    });

  const deleteCell = (id) =>
    setCells((cs) => (cs.length > 1 ? cs.filter((c) => c.id !== id) : cs));

  const moveCell = (index, dir) =>
    setCells((cs) => {
      const j = index + dir;
      if (j < 0 || j >= cs.length) return cs;
      const next = [...cs];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const resetExamples = () => {
    restartKernel();
    setCells(STARTER_CELLS.map(newCell));
  };

  const stateLabel = { booting: '⏳ starting Python…', packages: '📦 loading packages…', running: '⏳ running…' };

  return (
    <div className={styles.nb}>
      <div className={styles.toolbar}>
        <button className={styles.tbBtn} onClick={runAll} disabled={kernelBusy}>
          ▶▶ Run all
        </button>
        <button className={styles.tbBtn} onClick={() => addCell(cells.length - 1)}>
          ＋ Add cell
        </button>
        <button className={styles.tbBtn} onClick={restartKernel} disabled={kernelBusy}>
          ↻ Restart kernel
        </button>
        <button className={styles.tbBtn} onClick={resetExamples} disabled={kernelBusy}>
          ⌂ Reset examples
        </button>
        <span className={styles.tbNote}>
          Shift+Enter runs a cell · numpy / pandas / matplotlib auto-load · work is saved in your browser
        </span>
      </div>

      {cells.map((cell, i) => {
        const res = results[cell.id] || {};
        const busy = res.state && res.state !== 'done';
        return (
          <div key={cell.id} className={styles.cell}>
            <div className={styles.gutter}>
              <button
                className={styles.runBtn}
                title="Run cell (Shift+Enter)"
                onClick={() => runCell(cell)}
                disabled={kernelBusy}
              >
                {busy ? '…' : '▶'}
              </button>
              <span className={styles.execCount}>{res.count ? `[${res.count}]` : '[ ]'}</span>
            </div>

            <div className={styles.cellMain}>
              <textarea
                className={styles.editor}
                value={cell.source}
                spellCheck={false}
                rows={Math.min(Math.max(cell.source.split('\n').length, 2), 24)}
                onChange={(e) => updateSource(cell.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    runCell(cell);
                  } else if (e.key === 'Tab') {
                    e.preventDefault();
                    const el = e.target;
                    const { selectionStart: s, selectionEnd: t } = el;
                    updateSource(cell.id, cell.source.slice(0, s) + '    ' + cell.source.slice(t));
                    requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
                  }
                }}
                aria-label={`Code cell ${i + 1}`}
              />

              <div className={styles.cellActions}>
                <button title="Move up" onClick={() => moveCell(i, -1)}>↑</button>
                <button title="Move down" onClick={() => moveCell(i, 1)}>↓</button>
                <button title="Insert cell below" onClick={() => addCell(i)}>＋</button>
                <button title="Delete cell" onClick={() => deleteCell(cell.id)}>🗑</button>
              </div>

              {busy && <div className={styles.status}>{stateLabel[res.state] || '⏳'}</div>}

              {res.state === 'done' && (res.output || res.error || (res.images && res.images.length)) ? (
                <div className={styles.outArea}>
                  {res.output ? <pre className={styles.out}>{res.output}</pre> : null}
                  {res.images &&
                    res.images.map((b64, k) => (
                      <img
                        key={k}
                        className={styles.plot}
                        src={`data:image/png;base64,${b64}`}
                        alt={`Plot output ${k + 1}`}
                      />
                    ))}
                  {res.error ? <pre className={styles.err}>{res.error}</pre> : null}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
