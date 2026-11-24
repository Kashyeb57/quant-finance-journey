/**
 * Stop Guard: the stop rule that tested best on the owner's own MU option
 * trades (Nov 2026 backtest), as pure functions the panel and the tests share.
 *
 *   Stop for a CALL = low of the last 2 COMPLETED 1-minute candles before entry
 *                     minus the buffer.
 *   Stop for a PUT  = high of those candles plus the buffer.
 *   Hit             = the underlying trades at or through the stop.
 *   Trapped         = still losing (underlying against the trade) after N minutes.
 *
 * Alerts only: nothing here places or changes an order.
 * Bars are { time (UTC seconds, candle start), open, high, low, close }.
 */

export const BUFFERS = [0.25, 0.5, 1];
export const DEFAULT_BUFFER = 0.5;
export const TRAPPED_MINUTES = 5;
const MIN = 60;

const ctDay = (sec) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(sec * 1000));

/** The 1-minute candles that had fully closed before `entrySec`, same CT day. */
export function completedBefore(bars, entrySec, count = 2) {
  const day = ctDay(entrySec);
  return (bars || []).filter((b) => b.time + MIN <= entrySec && ctDay(b.time) === day).slice(-count);
}

/** Stop level, or null when no candle has closed yet today (e.g. 8:30:20). */
export function stopLevel(bars, entrySec, side, buffer = DEFAULT_BUFFER) {
  const basis = completedBefore(bars, entrySec, 2);
  if (!basis.length) return null;
  const level = side === 'put'
    ? Math.max(...basis.map((b) => b.high)) + buffer
    : Math.min(...basis.map((b) => b.low)) - buffer;
  return { level: Math.round(level * 100) / 100, basis };
}

/** Has the underlying touched the stop? Pass a bar's low/high or one price as both. */
export function isHit(side, level, low, high = low) {
  if (level == null) return false;
  return side === 'put' ? high >= level : low <= level;
}

/**
 * First 1-minute candle after the entry minute that touched the stop, so a
 * touch between live samples is still caught. Returns the candle or null.
 */
export function firstHitBar(bars, entrySec, side, level) {
  const after = Math.floor(entrySec / MIN) * MIN + MIN;
  return (bars || []).find((b) => b.time >= after && isHit(side, level, b.low, b.high)) || null;
}

/**
 * A stop for every entry triangle of the current CT day, set the moment the
 * triangle is confirmed (its candle closes: signal time + chart candle length),
 * from the 1-minute candles closed by then. Each line runs until the stop is
 * touched, the next triangle replaces it, or now.
 * signals: [{ time, side: 'call'|'put', tfSec }]  ->  [{ ...signal, startSec, level, hitSec, endSec }]
 */
export function signalStops(bars, signals, buffer = DEFAULT_BUFFER, nowSec = Date.now() / 1000) {
  const today = ctDay(nowSec);
  const list = (signals || [])
    .map((s) => ({ ...s, startSec: s.time + (s.tfSec || MIN) }))
    .filter((s) => s.startSec <= nowSec && ctDay(s.time) === today)
    .sort((a, b) => a.startSec - b.startSec);
  const out = [];
  list.forEach((s, i) => {
    const st = stopLevel(bars, s.startSec, s.side, buffer);
    if (!st) return;
    // On a 3- or 5-minute chart the last two 1-minute candles can sit inside the
    // triangle's own candle; the stop must be beyond that whole candle too.
    const own = (bars || []).filter((b) => b.time >= s.time && b.time < s.startSec);
    let level = st.level;
    if (own.length) {
      level = s.side === 'put'
        ? Math.max(level, Math.max(...own.map((b) => b.high)) + buffer)
        : Math.min(level, Math.min(...own.map((b) => b.low)) - buffer);
      level = Math.round(level * 100) / 100;
    }
    const next = list[i + 1] ? list[i + 1].startSec : Infinity;
    const hit = firstHitBar((bars || []).filter((b) => b.time < next), s.startSec, s.side, level);
    const hitSec = hit ? hit.time : null;
    out.push({ ...s, level, hitSec, endSec: Math.min(hitSec != null ? hitSec + MIN : Infinity, next, nowSec) });
  });
  return out;
}

/** Time in the trade and whether it is "trapped" (losing past the limit). */
export function trapState({ entrySec, nowSec, side, entrySpot, price, minutes = TRAPPED_MINUTES }) {
  const elapsedMin = Math.max(0, (nowSec - entrySec) / MIN);
  const against = entrySpot != null && price != null && (side === 'put' ? price > entrySpot : price < entrySpot);
  return { elapsedMin, against, trapped: against && elapsedMin >= minutes };
}

/** Today's CT clock time ("9:05" or "09:05:30") to UTC seconds, DST-aware. */
export function ctTimeToday(text, nowMs = Date.now()) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((text || '').trim());
  if (!m) return null;
  const [hh, mm, ss] = [+m[1], +m[2], +(m[3] || 0)];
  if (hh > 23 || mm > 59 || ss > 59) return null;
  const [y, mo, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(nowMs)).split('-').map(Number);
  for (const off of [6, 5]) { // CST is UTC-6, CDT is UTC-5
    const ms = Date.UTC(y, mo - 1, d, hh + off, mm, ss);
    const h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date(ms));
    if (h === hh) return Math.floor(ms / 1000);
  }
  return null;
}
