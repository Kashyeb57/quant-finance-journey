/**
 * Owner-only visitor beacon.
 *
 * Fires a tiny same-origin request to the Cloudflare Worker (/_a/collect) on
 * each page view so the private analytics log can record the visit (IP + geo
 * + device are read server-side by the Worker from Cloudflare's edge — this
 * script only sends the path and referrer).
 *
 * It is intentionally defensive: it never throws, and if the Worker isn't
 * deployed yet the request just fails silently — the site is unaffected.
 */

const ENDPOINT = '/_a/collect';

function send(pathname) {
  if (typeof navigator === 'undefined') return;
  try {
    const payload = JSON.stringify({
      p: pathname,
      r: document.referrer || '',
      w: window.screen ? window.screen.width : undefined,
      h: window.screen ? window.screen.height : undefined,
    });
    if (navigator.sendBeacon) {
      // sendBeacon survives page unloads and is fire-and-forget.
      navigator.sendBeacon(ENDPOINT, payload);
    } else {
      fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true }).catch(() => {});
    }
  } catch (_) {
    /* analytics must never break the page */
  }
}

// Called by Docusaurus after every route change, including the first load.
// previousLocation is null on the initial page view, so that view is counted.
export function onRouteDidUpdate({ location, previousLocation }) {
  if (previousLocation && previousLocation.pathname === location.pathname) return;
  send(location.pathname);
}
