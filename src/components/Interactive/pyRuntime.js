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

// Collects any matplotlib figures produced by a cell as base64 PNGs.
const COLLECT_FIGS = `
import sys as _sys
_imgs = []
if "matplotlib" in _sys.modules:
    import base64 as _b64, io as _io
    import matplotlib.pyplot as _plt
    for _n in _plt.get_fignums():
        _fig = _plt.figure(_n)
        _buf = _io.BytesIO()
        _fig.savefig(_buf, format="png", dpi=110, bbox_inches="tight")
        _imgs.append(_b64.b64encode(_buf.getvalue()).decode())
    _plt.close("all")
_imgs
`;

/**
 * Create a fresh notebook namespace (Python globals dict).
 * Pass it to runPythonCell so variables persist between cells, Jupyter-style.
 */
export async function createNamespace() {
  const py = await getPyodide();
  return py.toPy({});
}

/**
 * Run one notebook cell inside a shared namespace.
 * Auto-loads known packages (numpy, pandas, matplotlib, scipy, …) from the
 * cell's imports and returns { output, error, images } where images are
 * base64 PNGs of any matplotlib figures the cell drew.
 */
export function runPythonCell(code, ns, onStatus) {
  const job = runChain.then(async () => {
    const py = await getPyodide();
    let out = '';
    try {
      if (onStatus) onStatus('loading-packages');
      await py.loadPackagesFromImports(code);
      // Force the AGG backend so plt.show() never tries to touch the DOM,
      // and silence the "agg is a non-GUI backend" warning show() emits.
      if (/matplotlib|pyplot/.test(code)) {
        await py.runPythonAsync(
          'import matplotlib\nmatplotlib.use("AGG")\n' +
            'import warnings\n' +
            'warnings.filterwarnings("ignore", message="Matplotlib is currently using agg")',
          { globals: ns }
        );
      }
    } catch (e) {
      // Unknown imports fail naturally inside the cell run below.
    }
    if (onStatus) onStatus('running');
    py.setStdout({ batched: (s) => (out += s + '\n') });
    py.setStderr({ batched: (s) => (out += s + '\n') });
    try {
      const result = await py.runPythonAsync(code, { globals: ns });
      if (result !== undefined && result !== null) {
        const text = String(result);
        if (result && typeof result.destroy === 'function') result.destroy();
        out += (out && !out.endsWith('\n') ? '\n' : '') + text + '\n';
      }
      let images = [];
      try {
        const proxy = await py.runPythonAsync(COLLECT_FIGS, { globals: ns });
        images = proxy.toJs();
        proxy.destroy();
      } catch (e) {
        // no matplotlib or figure capture failed — not fatal
      }
      return { output: out, error: null, images };
    } catch (err) {
      const msg = String(err.message || err);
      const idx = msg.indexOf('Traceback');
      return { output: out, error: idx >= 0 ? msg.slice(idx) : msg, images: [] };
    }
  });
  runChain = job.then(
    () => undefined,
    () => undefined
  );
  return job;
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
