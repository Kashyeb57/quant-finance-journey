/**
 * The market Worker's API contract, in one place.
 *
 * Every `/_m/*` endpoint the site uses is declared here as a named function, so
 * a component never hand-builds a URL or a query string. If the Worker's routes
 * change (see `market/src/worker.js`), this file is the only thing that changes
 * with it.
 *
 * These all throw `ApiError` on failure — callers decide whether that is fatal
 * (the portfolio page) or merely means "hide this panel" (the chart overlays).
 */

import { getJson, postJson } from './api';

/* ------------------------------------------------------------ market data */

/** OHLC candles. `tf` is a timeframe key from `marketData.js` (e.g. '5Min'). */
export function getBars(symbol, tf, opts) {
  return getJson(`/_m/bars?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}`, opts);
}

/** Latest trade + day change for one symbol. */
export function getSnapshot(symbol, opts) {
  return getJson(`/_m/snapshot?symbol=${encodeURIComponent(symbol)}`, opts);
}

/**
 * Quotes for a mixed board — US equities, a foreign index, gold, an FX pair.
 * Takes Yahoo-style symbols (e.g. `['AMD', '^KS11', 'GC=F']`) and resolves to a
 * `{ symbol -> quote }` map so callers can look up by symbol instead of
 * scanning an array.
 *
 * The Worker routes each symbol to whichever upstream carries it, so quotes on
 * one board can have different provenance. Every quote therefore carries:
 *
 *   - `source`  — 'alpaca-iex' | 'yahoo' | null (no data)
 *   - `delayed` — false for Alpaca (real time), true for Yahoo (~15 min)
 *   - `at`      — the upstream's own timestamp, ISO, when it gives one
 *
 * A board that shows prices from both MUST label them per row. Alpaca's free
 * tier is the IEX feed: genuinely real time, but IEX volume only — not the
 * consolidated SIP tape.
 */
export async function getQuotes(symbols, opts) {
  const list = (symbols || []).filter(Boolean);
  if (!list.length) return {};
  const d = await getJson(`/_m/quote?symbols=${encodeURIComponent(list.join(','))}`, opts);
  const map = {};
  for (const q of (d && d.quotes) || []) {
    if (q && q.symbol) map[q.symbol] = q;
  }
  return map;
}

/**
 * Dealer gamma exposure for a symbol. `exp` buckets the expiries:
 * 'day' (0DTE) | 'week' | '15d' | '30d'.
 */
export function getGex(symbol, exp = 'day', opts) {
  return getJson(`/_m/gex?symbol=${encodeURIComponent(symbol)}&exp=${encodeURIComponent(exp)}`, opts);
}

/* ------------------------------------------------- paper trading account */

/** Account equity + open positions. Read-only; safe for any visitor. */
export function getPortfolio(opts) {
  return getJson('/_m/portfolio', opts);
}

/** Closed-trade ledger + equity curve. Read-only. */
export function getLedger(opts) {
  return getJson('/_m/ledger', opts);
}

/**
 * Place a whole-share market order on the PAPER account. Owner-only: the
 * Worker rejects anything without a matching trade token.
 */
export function placeOrder({ symbol, side, qty }, token, opts) {
  return postJson('/_m/order', { symbol, side, qty }, { token, ...opts });
}

/** Cancel a still-open order by id. Owner-only. */
export function cancelOrder(id, token, opts) {
  return postJson('/_m/cancel', { id }, { token, ...opts });
}
