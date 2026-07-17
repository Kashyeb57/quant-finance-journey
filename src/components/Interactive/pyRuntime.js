// Lazy-loaded Pyodide runtime shared by PySandbox and the CodeBlock Run button.
// Nothing loads until the first click, so normal page visits pay zero cost.

const PYODIDE_VERSION = 'v0.26.4';
const CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

let pyodidePromise = null;
let runChain = Promise.resolve(); // serialize runs so stdout never interleaves

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load the Python runtime.'));
    document.head.appendChild(s);
  });
}

export function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      if (typeof window.loadPyodide !== 'function') {
        await loadScript(CDN + 'pyodide.js');
      }
      return window.loadPyodide({ indexURL: CDN });
    })();
    pyodidePromise.catch(() => {
      pyodidePromise = null; // allow a retry after a network failure
    });
  }
  return pyodidePromise;
}

export function isPyodideLoaded() {
  return pyodidePromise !== null;
}

/**
 * Run Python code, returning { output, error }.
 * The repr of a trailing expression is appended, REPL-style.
 */
export function runPython(code) {
  const job = runChain.then(async () => {
    const py = await getPyodide();
    let out = '';
    py.setStdout({ batched: (s) => (out += s + '\n') });
    py.setStderr({ batched: (s) => (out += s + '\n') });
    try {
      const result = await py.runPythonAsync(code);
      if (result !== undefined && result !== null) {
        const text = String(result);
        if (result && typeof result.destroy === 'function') result.destroy();
        out += (out && !out.endsWith('\n') ? '\n' : '') + text + '\n';
      }
      return { output: out, error: null };
    } catch (err) {
      // Keep only the Python traceback, not pyodide's internal JS frames.
      const msg = String(err.message || err);
      const idx = msg.indexOf('Traceback');
      return { output: out, error: idx >= 0 ? msg.slice(idx) : msg };
    }
  });
  // keep the chain alive even if this job failed
  runChain = job.then(
    () => undefined,
    () => undefined
  );
  return job;
}
