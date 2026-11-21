// Browser side of the WebMCP tools. Loaded only after src/clientModules/webmcp.js
// has seen document.modelContext.registerTool, so browsers without WebMCP never
// download this file or the catalog.
import { TOOLS, ANNOTATIONS, CATALOG_PATH, runTool } from './core.mjs';

let catalogPromise = null;

async function fetchJson(url, init, signal, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    if (signal && signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
    try {
      const res = await fetch(url, { ...init, signal });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} from ${new URL(url, location.origin).pathname}`), { code: 'UNAVAILABLE' });
      return await res.json();
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      lastErr = err;
      if (i + 1 < attempts) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

// Fetched on the first tool call that needs it, then reused. A failed load is
// forgotten so the next call tries again. A cancelled call does not cancel the
// shared download, which other calls may be waiting on.
function loadCatalog(signal) {
  if (!catalogPromise) {
    catalogPromise = fetchJson(CATALOG_PATH, { cache: 'no-cache', credentials: 'omit' }).catch((err) => {
      catalogPromise = null;
      throw Object.assign(new Error(`The site catalog could not be loaded (${err.message}). Try again.`), { code: 'CATALOG_UNAVAILABLE' });
    });
  }
  if (!signal) return catalogPromise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    catalogPromise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function readPage() {
  const root = document.querySelector('article') || document.querySelector('main') || document.body;
  const meta = document.querySelector('meta[name="description"]');
  const headings = [...root.querySelectorAll('h1, h2, h3')].map((h) => ({
    level: Number(h.tagName.slice(1)),
    text: (h.textContent || '').replace(/[#\u200B]+$/, '').replace(/\s+/g, ' ').trim(),
  })).filter((h) => h.text);
  const seen = new Set();
  const links = [];
  for (const a of root.querySelectorAll('a[href]')) {
    const url = a.href;
    if (!/^https?:/.test(url) || url.split('#')[0] === location.href.split('#')[0] || seen.has(url)) continue;
    seen.add(url);
    links.push({ text: (a.textContent || '').replace(/\s+/g, ' ').trim(), url });
  }
  return {
    title: document.title,
    description: meta ? meta.getAttribute('content') : '',
    url: location.href,
    headings,
    links,
  };
}

const deps = {
  origin: location.origin,
  loadCatalog,
  readPage,
  fetchQuote: (url, init, signal) => fetchJson(url, init, signal),
};

let registered = null;

// Registers every tool, or none: if one registration fails, the ones already
// registered are removed again through their shared AbortSignal.
export default async function registerWebMcpTools() {
  if (registered) return;
  const mc = document.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;
  const controller = new AbortController();
  try {
    for (const tool of TOOLS) {
      await mc.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: ANNOTATIONS,
          execute: (input, ctx) => runTool(tool.name, input, deps, ctx && ctx.signal),
        },
        { signal: controller.signal },
      );
    }
    registered = controller;
  } catch (err) {
    controller.abort();
    console.warn('[webmcp] tool registration failed; no tools registered.', err);
  }
}
