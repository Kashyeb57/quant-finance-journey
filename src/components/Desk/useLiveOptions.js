import { useEffect, useState } from 'react';

/*
 * Live option quotes from the owner's local bridge (127.0.0.1), which runs only
 * while he has started it on his PC. The site never contacts the bridge unless
 * this browser was switched on once with /terminal?live=1 (?live=0 switches it
 * off): a request to a visitor's own machine would make their browser ask for
 * a local-network permission, so ordinary visitors must never send one.
 * Returns the latest snapshot, or null when the bridge is not running.
 */

const BRIDGE = 'http://127.0.0.1:8765/snapshot';
const FLAG = 'terminal.liveOptions';
const POLL_MS = 5000;
const MISSES_TO_HIDE = 2; // one slow reply should not make the tile blink

function ownerSwitchedOn() {
  try {
    const q = new URLSearchParams(window.location.search).get('live');
    if (q === '1') window.localStorage.setItem(FLAG, '1');
    if (q === '0') window.localStorage.removeItem(FLAG);
    return window.localStorage.getItem(FLAG) === '1';
  } catch (_) {
    return false;
  }
}

export default function useLiveOptions() {
  const [snap, setSnap] = useState(null);

  useEffect(() => {
    if (!ownerSwitchedOn()) return undefined;
    let alive = true, timer = null, misses = 0;
    const poll = async () => {
      try {
        const r = await fetch(BRIDGE, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        misses = 0;
        if (alive) setSnap(j);
      } catch (_) {
        misses += 1;
        if (alive && misses >= MISSES_TO_HIDE) setSnap(null);
      }
      if (alive) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return snap;
}
