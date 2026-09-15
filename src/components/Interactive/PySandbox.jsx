import React, { useRef, useState } from 'react';
import LabCard from './LabCard';
import styles from './pysandbox.module.css';
import { runPython, isPyodideLoaded, interruptPython, usesInput } from './pyRuntime';
import StdinBox from './StdinBox';

/**
 * Editable Python playground that runs entirely in the browser (Pyodide).
 *
 * <PySandbox title="Try it yourself" code={`print("hello")`} stdin="42" />
 * `stdin` pre-fills the Input box (one answer per line) when the code uses input().
 */
export default function PySandbox({ title = 'Python playground', code = '', rows, stdin: initialStdin = '' }) {
  const [src, setSrc] = useState(code.replace(/^\n+|\s+$/g, ''));
  const [stdin, setStdin] = useState(initialStdin);
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);
  const [state, setState] = useState('idle'); // idle | loading | running
  const needsInput = usesInput(src);

  const run = async () => {
    setState(isPyodideLoaded() ? 'running' : 'loading');
    setOutput(null);
    setError(null);
    const res = await runPython(src, needsInput ? stdin : '');
    setOutput(res.output);
    setError(res.error);
    setState('idle');
  };

  // Keyboard escape from the editor (WCAG 2.1.2): Tab indents, so Esc arms the
  // next Tab to move focus instead. Shift+Tab is never intercepted.
  const tabExit = useRef(false);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      tabExit.current = true;
      return;
    }
    const leaving = tabExit.current;
    tabExit.current = false;
    if (e.key === 'Tab' && !e.shiftKey && !leaving) {
      e.preventDefault();
      const el = e.target;
      const { selectionStart: s, selectionEnd: t } = el;
      setSrc(src.slice(0, s) + '    ' + src.slice(t));
      requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      run();
    }
  };

  const lines = rows || Math.min(Math.max(src.split('\n').length + 1, 4), 20);

  return (
    <LabCard badge="Code" title={title}>
      <textarea
        className={styles.editor}
        value={src}
        rows={lines}
        spellCheck={false}
        onChange={(e) => setSrc(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => { tabExit.current = false; }}
        aria-label="Python code editor"
      />
      {needsInput && <StdinBox value={stdin} onChange={setStdin} />}
      <div className={styles.bar}>
        <button className={styles.runBtn} onClick={run} disabled={state !== 'idle'}>
          {state === 'loading'
            ? '⏳ Loading Python…'
            : state === 'running'
              ? '⏳ Running…'
              : '▶ Run'}
        </button>
        {state !== 'idle' && (
          <button
            className={styles.clearBtn}
            onClick={() => interruptPython()}
            title="Stop the running code. Python restarts, so earlier variables are cleared."
          >
            ■ Stop
          </button>
        )}
        <span className={styles.note}>
          {state === 'loading'
            ? 'first run downloads the runtime (~10 MB), then it’s instant'
            : 'runs in your browser · Ctrl+Enter to run · Esc then Tab leaves the editor'}
        </span>
        {(output || error) && (
          <button
            className={styles.clearBtn}
            onClick={() => {
              setOutput(null);
              setError(null);
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>
      {(output || error) !== null && (output || error) !== undefined && (
        <div className={styles.outWrap}>
          {output ? <pre className={styles.out}>{output}</pre> : null}
          {error ? <pre className={styles.err}>{error}</pre> : null}
          {!output && !error ? <pre className={styles.out}>(no output)</pre> : null}
        </div>
      )}
    </LabCard>
  );
}
