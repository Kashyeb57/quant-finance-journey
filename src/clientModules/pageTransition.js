/**
 * Page switches that answer at once.
 *
 * The moment a link is followed, the page being left dims (CSS, keyed on
 * html[data-nav-pending]) while the next one loads and draws; the new page
 * then fades in. Only the content area changes — the navbar stays still.
 * The fade uses the site's motion tokens (--dur-2, --ease-out) and is skipped
 * for hash-only changes (table-of-contents links), on the first page load and
 * for visitors who ask for reduced motion.
 */

const PENDING = 'navPending';
const MAX_PENDING_MS = 4000; // never leave the page dimmed if a switch stalls

let pendingTimer = null;
let releasing = false; // true while re-sending a held click

const pageChanged = (location, previousLocation) =>
  Boolean(previousLocation) && location.pathname !== previousLocation.pathname;

function clearPending() {
  clearTimeout(pendingTimer);
  delete document.documentElement.dataset[PENDING];
}

function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function setPending() {
  document.documentElement.dataset[PENDING] = '';
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(clearPending, MAX_PENDING_MS);
}

// A plain left-click (or Enter) on a link to another page of this site.
// New-tab clicks, downloads, external and same-page (#hash) links are left alone.
function internalPageLink(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return null;
  return a;
}

// Drawing a heavy page can keep the browser busy for a few hundred ms, and
// without a painted frame first the click looks ignored. So hold the click,
// let the browser paint the dimmed page (two frames, ~33 ms), then send the
// same click on to the router.
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (releasing) return;
    const a = internalPageLink(e);
    if (!a || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    e.stopPropagation();
    setPending();
    const from = window.location.pathname;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!a.isConnected) { clearPending(); return; }
      releasing = true;
      let followed;
      try {
        followed = a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } finally {
        releasing = false;
      }
      // The router moves the page synchronously; a plain link is followed by
      // the browser. A handler that cancelled the click without moving on
      // means no page switch is coming, so undo the dim.
      if (!followed && window.location.pathname === from) clearPending();
    }));
  }, true);
  // A page restored by Back after a full page load must not come back dimmed.
  window.addEventListener('pageshow', clearPending);
}

export function onRouteUpdate({ location, previousLocation }) {
  if (typeof document === 'undefined' || !pageChanged(location, previousLocation)) return;
  setPending();
}

// Runs after the new page is in the DOM but before it is painted, so the fade
// starts from transparent with no flash of the finished page.
export function onRouteDidUpdate({ location, previousLocation }) {
  if (!pageChanged(location, previousLocation)) return;
  clearPending();
  const content = document.querySelector('.main-wrapper');
  if (!content || typeof content.animate !== 'function') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  content.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: parseFloat(token('--dur-2', '180ms')) || 180,
    easing: token('--ease-out', 'cubic-bezier(0.22, 1, 0.36, 1)'),
  });
}
