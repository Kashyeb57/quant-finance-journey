/**
 * Owner-only visitor beacon.
 *
 * Fires a tiny same-origin request to the Cloudflare Worker (/_a/collect) on
 * each page view so the private analytics log can record the visit (IP + geo
 * + device + language are read server-side by the Worker; this script sends
 * the path, referrer, and — when the visitor leaves a page — how long they
 * stayed on it).
 *
 * Defensive by design: it never throws, and if the Worker isn't deployed the
 * requests just fail silently — the site is unaffected.
 */

const ENDPOINT = '/_a/collect';

let currentVid = null; // id of the page view currently being timed
let startSec = 0; // when the current view started (unix seconds)

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function genVid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function post(obj) {
  try {
    const body = JSON.stringify(obj);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, body);
    } else {
      fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch (_) {
    /* analytics must never break the page */
  }
}

// Report how long the current view lasted (idempotent: the Worker keeps the max).
function endCurrentView() {
  if (!currentVid) return;
  post({ t: 'end', v: currentVid, s: Math.max(0, nowSec() - startSec) });
}

function startView(pathname) {
  endCurrentView(); // close out the previous page's timer
  currentVid = genVid();
  startSec = nowSec();
  post({
    p: pathname,
    r: document.referrer || '',
    v: currentVid,
    w: window.screen ? window.screen.width : undefined,
    h: window.screen ? window.screen.height : undefined,
  });
}

if (typeof document !== 'undefined') {
  // Fires when the tab is hidden or the page is being unloaded — the reliable
  // moment to capture time-on-page (sendBeacon still works during unload).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') endCurrentView();
  });
  window.addEventListener('pagehide', endCurrentView);
}

// Called by Docusaurus after every route change, including the first load.
export function onRouteDidUpdate({ location, previousLocation }) {
  if (previousLocation && previousLocation.pathname === location.pathname) return;
  startView(location.pathname);
}
