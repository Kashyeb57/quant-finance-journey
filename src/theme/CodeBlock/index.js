import React, { useState } from 'react';
import OriginalCodeBlock from '@theme-original/CodeBlock';
import { runPython, isPyodideLoaded, interruptPython, usesInput } from '@site/src/components/Interactive/pyRuntime';
import StdinBox from '@site/src/components/Interactive/StdinBox';
import styles from './styles.module.css';

// Sample answers for a snippet's input() calls, from the fence's meta string:
// ```python stdin="56\n10"   (\n separates answers)
function metaStdin(metastring) {
  const m = /(?:^|\s)stdin="([^"]*)"/.exec(metastring || '');
  return m ? m[1].split('\\n').join('\n') : '';
}

// Wraps the stock CodeBlock: every ```python fence on the site gets a
// "Run" button that executes the snippet in the browser via Pyodide.
export default function CodeBlock(props) {
  const lang = props.language || (props.className || '').replace(/.*language-(\w+).*/, '$1');
  const code = typeof props.children === 'string' ? props.children : null;
  const runnable = !!code && (lang === 'python' || lang === 'py');

  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);
  const [state, setState] = useState('idle');
  const [stdin, setStdin] = useState(() => metaStdin(props.metastring));

  if (!runnable) {
    return <OriginalCodeBlock {...props} />;
  }

  const needsInput = usesInput(code);

  const run = async () => {
    setState(isPyodideLoaded() ? 'running' : 'loading');
    const res = await runPython(code, needsInput ? stdin : '');
    setOutput(res.output);
    setError(res.error);
    setState('idle');
  };

  const hasResult = output !== null || error !== null;

  return (
    <div className={styles.runnable}>
      <OriginalCodeBlock {...props} />
      {needsInput && <StdinBox value={stdin} onChange={setStdin} variant="attached" />}
      <div className={styles.runBar}>
        <button className={styles.runBtn} onClick={run} disabled={state !== 'idle'}>
          {state === 'loading' ? '⏳ Loading Python…' : state === 'running' ? '⏳ Running…' : '▶ Run'}
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
        <span className={styles.runNote}>
          {state === 'loading' ? 'downloading the runtime (~10 MB, one time)' : 'runs in your browser'}
        </span>
        {hasResult && (
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
      {hasResult && (
        <div className={styles.result}>
          <div className={styles.resultTag}>output</div>
          {output ? <pre className={styles.out}>{output}</pre> : null}
          {error ? <pre className={styles.err}>{error}</pre> : null}
          {!output && !error ? <pre className={styles.out}>(no output)</pre> : null}
        </div>
      )}
    </div>
  );
}
