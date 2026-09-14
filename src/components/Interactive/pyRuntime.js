// Lazy-loaded Pyodide runtime shared by Notebook, PySandbox and the CodeBlock
// Run button. Nothing loads until the first click, so normal page visits pay
// zero cost.
//
// Python runs in a Web Worker, not on the page's main thread. Before, a long
// or endless computation (`while True: pass`) froze the whole tab with no way
// out. Now the page stays responsive, and interruptPython() terminates the
// worker and lets the next run start a fresh one.
//
// Why terminate instead of a gentle KeyboardInterrupt: Pyodide's interrupt
// buffer needs SharedArrayBuffer, which needs cross-origin isolation headers
// (COOP/COEP) that GitHub Pages cannot send. Stopping therefore resets the
// session — earlier variables are gone — and the callers say so.
//
// The worker source is a plain string turned into a Blob URL: no bundler
// config, a classic worker (so importScripts works), and nothing a minifier
// can rewrite. It deliberately contains no backslashes or backticks.

const PYODIDE_VERSION = 'v0.26.4';
const CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

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

// Force the AGG backend so plt.show() never tries to touch a display, and
// silence the "agg is a non-GUI backend" warning show() emits.
const AGG_SETUP = `import matplotlib
matplotlib.use("AGG")
import warnings
warnings.filterwarnings("ignore", message="Matplotlib is currently using agg")`;

const STOPPED_MESSAGE =
  'KeyboardInterrupt: execution was stopped. The Python session was restarted, ' +
  'so variables from earlier runs are gone.';
const LOAD_FAILED_MESSAGE = 'Failed to load the Python runtime. Check your connection and try again.';

const WORKER_SRC = `
importScripts(${JSON.stringify(CDN + 'pyodide.js')});
var NL = String.fromCharCode(10);
var COLLECT_FIGS = ${JSON.stringify(COLLECT_FIGS)};
var AGG_SETUP = ${JSON.stringify(AGG_SETUP)};
var pyodide = null;
var spaces = new Map();
var nsSeq = 0;
var ready = loadPyodide({ indexURL: ${JSON.stringify(CDN)} }).then(function (p) { pyodide = p; });
var chain = Promise.resolve();

self.onmessage = function (e) {
  var m = e.data;
  // One job at a time, so stdout from two runs can never interleave.
  chain = chain.then(function () { return handle(m); });
};

function post(msg) { self.postMessage(msg); }

async function handle(m) {
  try {
    await ready;
  } catch (err) {
    post({ id: m.id, ok: false, fatal: true, error: String((err && err.message) || err) });
    return;
  }

  if (m.op === 'ns-new') {
    nsSeq += 1;
    spaces.set(nsSeq, pyodide.toPy({}));
    post({ id: m.id, ok: true, value: nsSeq });
    return;
  }

  if (m.op === 'ns-free') {
    var d = spaces.get(m.nsId);
    if (d) { try { d.destroy(); } catch (e) {} spaces.delete(m.nsId); }
    post({ id: m.id, ok: true, value: null });
    return;
  }

  // op === 'run'
  var globals;
  if (m.nsId !== null && m.nsId !== undefined) {
    if (!spaces.has(m.nsId)) spaces.set(m.nsId, pyodide.toPy({}));
    globals = spaces.get(m.nsId);
  }
  var opts = globals ? { globals: globals } : undefined;
  var out = '';

  if (m.cell) {
    post({ id: m.id, op: 'status', status: 'loading-packages' });
    try {
      await pyodide.loadPackagesFromImports(m.code);
      if (/matplotlib|pyplot/.test(m.code)) await pyodide.runPythonAsync(AGG_SETUP, opts);
    } catch (e) {
      // Unknown imports fail naturally inside the run below.
    }
    post({ id: m.id, op: 'status', status: 'running' });
  }

  pyodide.setStdout({ batched: function (s) { out += s + NL; } });
  pyodide.setStderr({ batched: function (s) { out += s + NL; } });

  try {
    var result = await pyodide.runPythonAsync(m.code, opts);
    if (result !== undefined && result !== null) {
      var text = String(result);
      if (typeof result.destroy === 'function') result.destroy();
      out += (out && out.charAt(out.length - 1) !== NL ? NL : '') + text + NL;
    }
    var images = [];
    if (m.cell) {
      try {
        var proxy = await pyodide.runPythonAsync(COLLECT_FIGS, opts);
        images = proxy.toJs();
        proxy.destroy();
      } catch (e) {
        // no matplotlib, or figure capture failed: not fatal
      }
    }
    post({ id: m.id, ok: true, value: { output: out, error: null, images: images } });
  } catch (err) {
    // Keep only the Python traceback, not Pyodide's internal JS frames.
    var msg = String((err && err.message) || err);
    var idx = msg.indexOf('Traceback');
    post({ id: m.id, ok: true, value: { output: out, error: idx >= 0 ? msg.slice(idx) : msg, images: [] } });
  }
}
`;

let worker = null;
let workerUrl = null;
let generation = 0; // bumps every time the session is torn down
let seq = 0;
const pending = new Map(); // id -> { resolve, reject, onStatus, kind }

// What a caller waiting on a job receives when the session goes away.
function settleForTeardown(job, message) {
  if (job.kind === 'run') job.resolve({ output: '', error: message, images: [] });
  else job.reject(new Error(message));
}

function teardown(message) {
  if (worker) worker.terminate();
  if (workerUrl) URL.revokeObjectURL(workerUrl);
  worker = null;
  workerUrl = null;
  generation += 1;
  const jobs = [...pending.values()];
  pending.clear();
  jobs.forEach((job) => settleForTeardown(job, message));
}

function ensureWorker() {
  if (worker) return worker;
  workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  worker = new Worker(workerUrl);
  worker.onmessage = (e) => {
    const m = e.data;
    const job = pending.get(m.id);
    if (!job) return;
    if (m.op === 'status') {
      if (job.onStatus) job.onStatus(m.status);
      return;
    }
    if (m.fatal) {
      // Pyodide itself failed to start: drop this worker so the next run retries.
      teardown(LOAD_FAILED_MESSAGE);
      return;
    }
    pending.delete(m.id);
    if (m.ok) job.resolve(m.value);
    else settleForTeardown(job, m.error);
  };
  // importScripts failed (offline, CDN blocked): same retry-able teardown.
  worker.onerror = () => teardown(LOAD_FAILED_MESSAGE);
  return worker;
}

function call(msg, kind, onStatus) {
  const w = ensureWorker();
  seq += 1;
  const id = seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onStatus, kind });
    w.postMessage({ ...msg, id });
  });
}

/** True once a Python session has been started (it may still be booting). */
export function isPyodideLoaded() {
  return worker !== null;
}

/**
 * Stop whatever Python is running. Terminates the worker, resolves every
 * waiting run with a KeyboardInterrupt-style error, and resets the session;
 * the next run starts a fresh one. Returns false if nothing was running.
 */
export function interruptPython() {
  if (!worker) return false;
  teardown(STOPPED_MESSAGE);
  return true;
}

/**
 * Create a fresh notebook namespace (Python globals dict), living in the
 * worker. Pass it to runPythonCell so variables persist between cells.
 * The handle keeps a destroy() method, as the in-page PyProxy used to.
 */
export async function createNamespace() {
  const nsId = await call({ op: 'ns-new' }, 'ns');
  const handle = {
    nsId,
    generation,
    destroy() {
      if (worker && handle.generation === generation) {
        call({ op: 'ns-free', nsId: handle.nsId }, 'ns').catch(() => {});
      }
    },
  };
  return handle;
}

/**
 * Run one notebook cell inside a shared namespace.
 * Auto-loads known packages (numpy, pandas, matplotlib, scipy, …) from the
 * cell's imports and resolves { output, error, images } where images are
 * base64 PNGs of any matplotlib figures the cell drew.
 */
export async function runPythonCell(code, ns, onStatus) {
  // A handle from before a Stop points at a namespace that died with the old
  // worker: rebind it to a new, empty one instead of failing.
  if (ns && ns.generation !== generation) {
    ns.nsId = await call({ op: 'ns-new' }, 'ns');
    ns.generation = generation;
  }
  return call({ op: 'run', code, nsId: ns ? ns.nsId : null, cell: true }, 'run', onStatus);
}

/**
 * Run Python code, resolving { output, error }.
 * The repr of a trailing expression is appended, REPL-style.
 */
export function runPython(code) {
  return call({ op: 'run', code, nsId: null, cell: false }, 'run');
}
