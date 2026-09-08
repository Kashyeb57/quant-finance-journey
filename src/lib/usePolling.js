import { useEffect, useRef } from 'react';

/**
 * Poll something on an interval, correctly.
 *
 * Six components had each hand-written this same loop — interval, cancelled
 * flag, `visibilitychange` listener, cleanup — and they had drifted apart (some
 * paused on a hidden tab, some did not; none aborted the in-flight request).
 * This is that loop, written once:
 *
 *   - runs immediately, then every `intervalMs`,
 *   - skips ticks while the tab is hidden and fires once when it comes back,
 *     so a backgrounded terminal stops burning the Worker's rate limit,
 *   - aborts the in-flight request and stops on unmount,
 *   - swallows rejections, because a polled panel must never break the page.
 *
 * The callback receives `{ signal, cancelled }`: pass `signal` to the API layer
 * and check `cancelled()` before calling setState.
 *
 * @param {(ctx: {signal: AbortSignal, cancelled: () => boolean}) => any} callback
 * @param {number} intervalMs         Poll period. Falsy disables polling.
 * @param {Array}  deps              Restart the loop when these change.
 * @param {{enabled?: boolean, pauseWhenHidden?: boolean, runImmediately?: boolean}} [options]
 */
export default function usePolling(callback, intervalMs, deps = [], options = {}) {
  const { enabled = true, pauseWhenHidden = true, runImmediately = true } = options;

  // Keep the newest callback without restarting the interval every render.
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  });

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;

    let cancelled = false;
    const ctrl = new AbortController();
    const hasDoc = typeof document !== 'undefined';

    const tick = () => {
      if (cancelled) return;
      if (pauseWhenHidden && hasDoc && document.visibilityState === 'hidden') return;
      try {
        // Rejections are expected here (offline, aborted, Worker down) and are
        // never the page's problem — the caller shows its own quiet fallback.
        Promise.resolve(cbRef.current({ signal: ctrl.signal, cancelled: () => cancelled })).catch(() => {});
      } catch (_) {
        /* a synchronous throw in the callback must not kill the interval */
      }
    };

    if (runImmediately) tick();
    const id = setInterval(tick, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    if (pauseWhenHidden && hasDoc) document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      ctrl.abort();
      clearInterval(id);
      if (pauseWhenHidden && hasDoc) document.removeEventListener('visibilitychange', onVisible);
    };
    // `deps` is spread deliberately: this is the standard custom-hook escape
    // hatch, and the rule cannot statically verify a caller-supplied array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, pauseWhenHidden, runImmediately, ...deps]);
}
