/**
 * Display formatting — numbers, money, and time.
 *
 * These were scattered: `fmtPrice`/`fmtVolume` lived in the Terminal's data
 * client, `fmtWhen`/`fmtDay` in the portfolio page, a third date helper inside
 * the Terminal's portfolio panel, and a fourth price formatter on the homepage.
 * They had already drifted (some returned '—' on bad input, some '').
 *
 * The timezone rule matters most: this project shows every timestamp in
 * America/Chicago. Putting that in one constant means it cannot silently vary
 * from page to page.
 */

/** Every timestamp on this site is rendered in Central Time. */
export const TZ = 'America/Chicago';

const EM_DASH = '—';

const isNum = (v) => v != null && typeof v === 'number' && Number.isFinite(v);

/* --------------------------------------------------------------- numbers */

/** Price with exactly two decimals and thousands separators. */
export function fmtPrice(v, fallback = EM_DASH) {
  if (!isNum(v)) return fallback;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Compact volume: 1.23B / 4.56M / 7.8K. */
export function fmtVolume(v, fallback = EM_DASH) {
  if (!isNum(v)) return fallback;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(v);
}

/** Percentage magnitude, unsigned — pair it with your own ▲/▼ or +/−. */
export function fmtPct(v, digits = 2, fallback = EM_DASH) {
  if (!isNum(v)) return fallback;
  return `${Math.abs(v).toFixed(digits)}%`;
}

/** Signed money, e.g. `+$1,240.50` / `−$83.10` (true minus sign, not a hyphen). */
export function fmtSignedMoney(v, fallback = EM_DASH) {
  if (!isNum(v)) return fallback;
  return `${v >= 0 ? '+' : '−'}$${fmtPrice(Math.abs(v))}`;
}

/* ------------------------------------------------------------------ time */

/**
 * A date in CT — `Sep 04` or, with time, `Sep 04 14:32 CT`.
 * Accepts an ISO string, a Date, or epoch millis.
 */
export function fmtDateCT(value, { withTime = false, fallback = EM_DASH } = {}) {
  if (!value) return fallback;
  try {
    const opts = { timeZone: TZ, month: 'short', day: '2-digit' };
    if (withTime) {
      opts.hour = '2-digit';
      opts.minute = '2-digit';
      opts.hour12 = false;
    }
    const out = new Intl.DateTimeFormat('en-US', opts).format(new Date(value));
    return withTime ? `${out} CT` : out;
  } catch (_) {
    return fallback;
  }
}

/**
 * A calendar day in CT from an epoch value that may be seconds OR millis —
 * Alpaca's equity curve sends seconds, most other things send millis.
 */
export function fmtDayCT(t, fallback = '') {
  if (t == null) return fallback;
  const ms = typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(t);
  if (Number.isNaN(ms)) return fallback;
  return fmtDateCT(ms, { fallback });
}

/**
 * Wall-clock time in CT — `14:32:05 CT`, or `14:32 CT` without seconds.
 * Used by the desk clock (ticking) and by "retrieved at" stamps (no seconds).
 */
export function fmtClockCT(value = new Date(), { withSeconds = true } = {}) {
  try {
    const t = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
    }).format(new Date(value));
    return `${t} CT`;
  } catch (_) {
    return '';
  }
}
