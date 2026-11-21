/**
 * WebMCP: read-only tools an AI agent in the visitor's browser can call
 * (search notes, list projects and events, describe the page, market snapshot).
 *
 * Only a feature check lives here. Browsers without WebMCP (today: anything
 * without Chrome's WebMCP flag or origin trial) stop at the check and never
 * download the tool code or the catalog; the tools sit in a separate chunk.
 */
if (typeof document !== 'undefined' && document.modelContext && typeof document.modelContext.registerTool === 'function') {
  import(/* webpackChunkName: "webmcp" */ '../lib/webmcp/register.js')
    .then((m) => m.default())
    .catch(() => { /* chunk failed to load: the site works exactly as without WebMCP */ });
}
