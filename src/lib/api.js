/**
 * The single HTTP client for this site's own backends.
 *
 * Everything that talks to a Cloudflare Worker goes through here — the market
 * Worker on `/_m/*` and the analytics Worker on `/_a/*`. Before this module the
 * base URL was resolved three different ways in three files, `HTTP ${status}`
 * was thrown from four, and no request had a timeout. One place now owns:
 *
 *   - where the API lives (production origin vs. same-origin),
 *   - how a failure is represented (ApiError, with status + parsed body),
 *   - request timeouts, so a hung Worker can never hang a panel forever.
 *
 * Deliberately dependency-free: plain fetch, no client library.
 */

/** The production host, and the origin built from it. Workers are only routed here. */
export const PROD_HOST = 'joyebkashyeb.com.np';
export const PROD_ORIGIN = `https://${PROD_HOST}`;

/**
 * Where API requests should go.
 *
 * The Workers are routed on the production domain only. So: served from that
 * domain, a relative path is correct (same origin, no preflight). Served from
 * anywhere else — the local dev server, a preview deploy, the raw
 * github.io host — there is no Worker in front of us, so call production
 * directly; it allow-lists those origins for CORS.
 *
 * Testing "is this the production host?" rather than "is this localhost?" is
 * deliberate: it keeps every non-production host working instead of only the
 * two loopback names. Returns '' during SSR; nothing fetches at build time.
 */
export function apiBase() {
  if (typeof window === 'undefined') return '';
  return window.location.hostname === PROD_HOST ? '' : PROD_ORIGIN;
}

/** Absolute URL for an API path such as `/_m/snapshot?symbol=AAPL`. */
export function apiUrl(path) {
  return `${apiBase()}${path}`;
}

/**
 * A failed API call. Carries the HTTP status and whatever body we could parse,
 * so callers can distinguish "not configured yet" from "genuinely broken".
 */
export class ApiError extends Error {
  constructor(message, { status = 0, body = null, path = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

const DEFAULT_TIMEOUT_MS = 12000;

/**
 * fetch + timeout. Returns the Response; callers decide how to read it.
 * An aborted request surfaces as an ApiError with status 0, same as a network
 * failure, because callers treat both the same way (fall back / stay quiet).
 */
async function request(path, { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...init } = {}) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(apiUrl(path), { cache: 'no-store', ...init, signal: ctrl.signal });
  } catch (err) {
    throw new ApiError(err && err.name === 'AbortError' ? 'Request timed out' : 'Network error', {
      status: 0,
      path,
    });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** Parse a JSON body, tolerating an empty or non-JSON response. */
async function readJson(res) {
  try {
    return await res.json();
  } catch (_) {
    return null;
  }
}

/**
 * GET JSON. Throws ApiError on a non-2xx response or a network/timeout failure.
 */
export async function getJson(path, opts = {}) {
  const res = await request(path, { method: 'GET', ...opts });
  const body = await readJson(res);
  if (!res.ok) {
    throw new ApiError((body && body.error) || `HTTP ${res.status}`, {
      status: res.status,
      body,
      path,
    });
  }
  return body;
}

/**
 * POST JSON to an owner-only endpoint. The trade token travels in a header
 * (never a query string, so it stays out of logs and referrers) and is compared
 * server-side; it is never persisted by this module.
 */
export async function postJson(path, body, { token, ...opts } = {}) {
  const res = await request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Trade-Token': token } : {}),
    },
    body: JSON.stringify(body || {}),
    ...opts,
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new ApiError((data && data.error) || `HTTP ${res.status}`, {
      status: res.status,
      body: data,
      path,
    });
  }
  return data || {};
}
