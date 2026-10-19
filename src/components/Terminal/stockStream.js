/*
 * Live stock trade stream via our Cloudflare Worker (/_m/stream), which relays
 * Alpaca's IEX trade feed with the API keys kept server-side.
 *
 *   subscribeStockTrades('AAPL', onTrade, onState) -> returns an unsubscribe fn
 *
 * onTrade receives { price, timeSec }. onState (optional) gets 'ready' | 'error'
 * | 'unavailable'. It only emits trades while the US market is trading; when
 * closed it just stays quiet — so callers should keep their polling fallback
 * running underneath.
 *
 * Reconnects back off exponentially (5s -> 80s, capped) rather than retrying on
 * a fixed timer. And when the Worker reports a FATAL condition — Alpaca's free
 * tier allows one concurrent connection, so a second viewer gets error 406 — we
 * stop entirely and emit 'unavailable'. Retrying that in a loop just hammers
 * Alpaca on every open tab and never succeeds.
 *
 * Everything on the page that wants one symbol shares ONE connection: the
 * price header and the chart used to open two, so the second was always
 * refused by that one-connection limit and the chart never got a live tick.
 */

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 80000;
// A refusal right after switching symbols is usually our own previous
// connection still being released upstream, so try a couple more times.
const FATAL_RETRY_MS = [3000, 8000];

const shared = new Map(); // symbol -> { listeners: Set, state, stop }

export function subscribeStockTrades(symbol, onTrade, onState) {
  let entry = shared.get(symbol);
  if (!entry) {
    const e = { listeners: new Set(), state: null, stop: null };
    e.stop = openStream(
      symbol,
      (t) => e.listeners.forEach((l) => l.onTrade(t)),
      (s) => {
        e.state = s;
        e.listeners.forEach((l) => l.onState && l.onState(s));
      },
    );
    shared.set(symbol, e);
    entry = e;
  }
  const me = { onTrade, onState };
  entry.listeners.add(me);
  if (entry.state && onState) onState(entry.state); // a late joiner learns where things stand
  return () => {
    entry.listeners.delete(me);
    if (entry.listeners.size) return;
    entry.stop();
    if (shared.get(symbol) === entry) shared.delete(symbol);
  };
}

function openStream(symbol, onTrade, onState) {
  let ws = null;
  let closed = false;
  let reconnectTimer = null;
  let attempt = 0;
  let fatalRetries = 0;

  // Give up for good — the stream cannot work right now, and saying so once is
  // more useful than reconnecting forever. A fatal stop arrives twice (the error
  // message, then the 4406 close), so only the first one reports.
  function standDown() {
    if (closed) return;
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (onState) onState('unavailable');
  }

  // One reconnect at a time: a drop or refusal can be reported twice (an error
  // message, then the close), and both would otherwise schedule a connect.
  function retryAfter(delay) {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    retryAfter(Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS));
    attempt += 1;
  }

  function refused() {
    if (closed || reconnectTimer) return;
    if (fatalRetries >= FATAL_RETRY_MS.length) standDown();
    else retryAfter(FATAL_RETRY_MS[fatalRetries++]);
  }

  function connect() {
    if (closed || typeof window === 'undefined') return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const urlStr = `${proto}//${window.location.host}/_m/stream?symbol=${encodeURIComponent(symbol)}`;
    let sock;
    try {
      sock = new WebSocket(urlStr);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws = sock;
    sock.onmessage = (e) => {
      if (sock !== ws) return; // a socket we already replaced
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (_) {
        return;
      }
      if (m.type === 'trade' && m.price != null) {
        onTrade({ price: +m.price, timeSec: m.time || Math.floor(Date.now() / 1000) });
      } else if (m.type === 'ready') {
        attempt = 0; // a good connection resets the backoff
        fatalRetries = 0;
        if (onState) onState('ready');
      } else if (m.type === 'error') {
        if (m.fatal) refused();
        else if (onState) onState('error');
      }
    };
    // Reconnect on drop (unless we closed on purpose). The market-closed case
    // just means no trades arrive; polling underneath keeps the price current.
    // 4406 is the Worker's own code for "upstream refused, don't come back".
    sock.onclose = (e) => {
      if (sock !== ws) return;
      if (e && e.code === 4406) refused();
      else scheduleReconnect();
    };
    sock.onerror = () => {
      try {
        sock.close();
      } catch (_) {
        /* ignore */
      }
    };
  }

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try {
      if (ws) ws.close();
    } catch (_) {
      /* ignore */
    }
  };
}
