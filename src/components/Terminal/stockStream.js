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
 */

const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 80000;

export function subscribeStockTrades(symbol, onTrade, onState) {
  let ws = null;
  let closed = false;
  let reconnectTimer = null;
  let attempt = 0;

  // Give up for good — the stream cannot work right now, and saying so once is
  // more useful than reconnecting forever. A fatal stop arrives twice (the error
  // message, then the 4406 close), so only the first one reports.
  function standDown() {
    if (closed) return;
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (onState) onState('unavailable');
  }

  function scheduleReconnect() {
    if (closed) return;
    const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect() {
    if (closed || typeof window === 'undefined') return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const urlStr = `${proto}//${window.location.host}/_m/stream?symbol=${encodeURIComponent(symbol)}`;
    try {
      ws = new WebSocket(urlStr);
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws.onmessage = (e) => {
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
        if (onState) onState('ready');
      } else if (m.type === 'error') {
        if (m.fatal) standDown();
        else if (onState) onState('error');
      }
    };
    // Reconnect on drop (unless we closed on purpose). The market-closed case
    // just means no trades arrive; polling underneath keeps the price current.
    // 4406 is the Worker's own code for "upstream refused, don't come back".
    ws.onclose = (e) => {
      if (e && e.code === 4406) standDown();
      else scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
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
