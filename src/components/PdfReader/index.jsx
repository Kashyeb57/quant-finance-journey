import React, { useEffect, useRef, useState } from 'react';
import styles from './styles.module.css';

// PDF.js is vendored under /vendor/pdfjs so the worker is same-origin.
const PDFJS_SRC = '/vendor/pdfjs/pdf.min.js';
const PDFJS_WORKER = '/vendor/pdfjs/pdf.worker.min.js';

let _pdfjsPromise = null;
function loadPdfjs() {
  if (_pdfjsPromise) return _pdfjsPromise;
  if (typeof window !== 'undefined' && window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return Promise.resolve(window.pdfjsLib);
  }
  _pdfjsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS_SRC;
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Could not load the PDF engine.'));
    document.head.appendChild(s);
  });
  return _pdfjsPromise;
}

const clampScale = (v) => Math.max(0.4, Math.min(4, +(+v).toFixed(3)));

// One page — renders its canvas only when scrolled near the viewport.
function PdfPage({ pdf, pageNumber, scale, size, registerObserver }) {
  const holderRef = useRef(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return undefined;
    return registerObserver(el, async () => {
      if (rendered) return;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const ratio = window.devicePixelRatio || 1;
      canvas.width = viewport.width * ratio;
      canvas.height = viewport.height * ratio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.scale(ratio, ratio);
      await page.render({ canvasContext: ctx, viewport }).promise;
      el.innerHTML = '';
      el.appendChild(canvas);

      // Invisible, positioned text over the canvas so the page can be selected,
      // found with Ctrl+F, and read by a screen reader — a canvas alone is just
      // pixels. pdf.js sizes the layer from --scale-factor on an ancestor.
      try {
        el.style.setProperty('--scale-factor', String(viewport.scale));
        const textLayer = document.createElement('div');
        textLayer.className = styles.textLayer;
        const textContentSource = await page.getTextContent();
        await window.pdfjsLib.renderTextLayer({ textContentSource, container: textLayer, viewport, textDivs: [] }).promise;
        el.appendChild(textLayer);
      } catch (e) {
        /* scanned page or no text: the canvas still shows */
      }
      setRendered(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  return (
    <div ref={holderRef} className={styles.page} data-page={pageNumber}>
      {/* Sized like the real page at this zoom, so unrendered pages take their
          true height: scroll positions and page jumps stay accurate before the
          pages around them have rendered. */}
      <div
        className={styles.pagePlaceholder}
        style={size ? { width: `${size.w}px`, height: `${size.h}px`, aspectRatio: 'auto' } : undefined}
      >
        Page {pageNumber}
      </div>
    </div>
  );
}

function OutlineNode({ item, onNavigate }) {
  const hasChildren = item.items && item.items.length > 0;
  return (
    <div className={styles.outlineNode}>
      {/* A real button, so chapters are reachable by keyboard and announced as controls. */}
      <button
        type="button"
        className={styles.outlineItem}
        onClick={() => onNavigate(item.dest)}
      >
        {item.title}
      </button>
      {hasChildren && (
        <div className={styles.outlineChildren}>
          {item.items.map((child, i) => (
            <OutlineNode key={i} item={child} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PdfReader({ url, title }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState('');
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [jumpPage, setJumpPage] = useState('');
  const [outline, setOutline] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // On a phone the 260px contents column leaves only a sliver for the page, so
  // start collapsed there; the ☰ button still opens it.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      setSidebarOpen(false);
    }
  }, []);
  const baseSize = useRef(null); // { w, h } of page 1 at scale 1
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const observerRef = useRef(null);
  const jobsRef = useRef(new Map());

  // Where the reader is, and where it was last time for this book.
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(1);
  const [pageFocus, setPageFocus] = useState(false);
  const [pageLabels, setPageLabels] = useState(null); // printed page numbers, if the PDF has them
  const [resumedAt, setResumedAt] = useState(null);
  const allowSave = useRef(false);
  const pendingPage = useRef(null);
  // 'auto' (the opening fit-width, capped at 160%) | 'width' | 'page' while a fit
  // mode is active, so a resize re-fits; null after a manual zoom.
  const [fitMode, setFitMode] = useState('auto');
  const autoScale = () => clampScale(Math.min(fitScale('width'), 1.6));
  const posKey = `reader-pos:${url}`;

  // Scroll the reader's own pane to a page. scrollIntoView would also scroll the
  // window and could tuck the page under the site's sticky navbar.
  const scrollToPage = (n, smooth) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const el = sc.querySelector(`[data-page="${n}"]`);
    if (!el) return;
    const top = sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8;
    sc.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
  };

  // Zooming re-renders every page; keep the reader on the page it was on.
  const changeScale = (next, mode = null) => {
    pendingPage.current = currentPageRef.current;
    setFitMode(mode);
    setScale(next);
  };
  useEffect(() => {
    if (pendingPage.current == null) return undefined;
    const n = pendingPage.current;
    pendingPage.current = null;
    const id = requestAnimationFrame(() => scrollToPage(n, false));
    return () => cancelAnimationFrame(id);
  }, [scale]);

  // Shared IntersectionObserver for lazy page rendering.
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const job = jobsRef.current.get(entry.target);
            if (job) {
              job();
              observerRef.current.unobserve(entry.target);
              jobsRef.current.delete(entry.target);
            }
          }
        }
      },
      { root: scrollRef.current, rootMargin: '600px 0px' }
    );
    return () => observerRef.current && observerRef.current.disconnect();
  }, []);

  const registerObserver = (el, job) => {
    jobsRef.current.set(el, job);
    observerRef.current && observerRef.current.observe(el);
    return () => {
      if (observerRef.current) observerRef.current.unobserve(el);
      jobsRef.current.delete(el);
    };
  };

  const fitScale = (mode) => {
    const el = scrollRef.current;
    const base = baseSize.current;
    if (!el || !base) return scale;
    const availW = el.clientWidth - 28;
    const availH = el.clientHeight - 28;
    return clampScale(mode === 'page' ? Math.min(availW / base.w, availH / base.h) : availW / base.w);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('loading');
      setProgress(0);
      try {
        const pdfjsLib = await loadPdfjs();
        const task = pdfjsLib.getDocument({ url, disableAutoFetch: true });
        task.onProgress = ({ loaded, total }) => {
          if (total) setProgress(Math.min(100, Math.round((loaded / total) * 100)));
        };
        const doc = await task.promise;
        if (cancelled) return;
        const p1 = await doc.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        baseSize.current = { w: vp.width, h: vp.height };
        // default: fit width, but capped so narrow pages don't blow up huge
        const el = scrollRef.current;
        if (el) setScale(clampScale(Math.min((el.clientWidth - 28) / vp.width, 1.6)));
        setPdf(doc);
        setNumPages(doc.numPages);

        try {
          const outlineData = await doc.getOutline();
          setOutline(outlineData || []);
        } catch (err) {
          setOutline([]);
        }
        try {
          const labels = await doc.getPageLabels();
          if (!cancelled && Array.isArray(labels)) setPageLabels(labels);
        } catch (err) {
          /* no printed page labels: PDF page numbers only */
        }

        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(String(err && err.message ? err.message : err));
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Current page: the page under a line 30% down the pane. Pages are in order,
  // so a binary search keeps this cheap even for 900-page books.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || status !== 'ready') return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const pages = sc.querySelectorAll('[data-page]');
      if (!pages.length) return;
      const probe = sc.getBoundingClientRect().top + sc.clientHeight * 0.3;
      let lo = 0;
      let hi = pages.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (pages[mid].getBoundingClientRect().top <= probe) lo = mid;
        else hi = mid - 1;
      }
      const n = lo + 1;
      if (n !== currentPageRef.current) {
        currentPageRef.current = n;
        setCurrentPage(n);
      }
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    sc.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      sc.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [status, numPages]);

  // Resume where this book was left, once, then start remembering.
  useEffect(() => {
    if (status !== 'ready' || allowSave.current) return undefined;
    let saved = 0;
    try { saved = parseInt(window.localStorage.getItem(posKey), 10) || 0; } catch (e) { /* storage blocked */ }
    if (saved > 1 && saved <= numPages) {
      const id = requestAnimationFrame(() => {
        scrollToPage(saved, false);
        setResumedAt(saved);
        allowSave.current = true;
      });
      return () => cancelAnimationFrame(id);
    }
    allowSave.current = true;
    return undefined;
  }, [status, numPages, posKey]);

  useEffect(() => {
    if (!allowSave.current) return;
    try { window.localStorage.setItem(posKey, String(currentPage)); } catch (e) { /* storage blocked */ }
  }, [currentPage, posKey]);

  useEffect(() => {
    if (!resumedAt) return undefined;
    const id = setTimeout(() => setResumedAt(null), 8000);
    return () => clearTimeout(id);
  }, [resumedAt]);

  // Re-fit when the pane changes width (rotating a phone, opening the contents).
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || status !== 'ready' || !fitMode || typeof ResizeObserver === 'undefined') return undefined;
    let lastW = sc.clientWidth;
    let lastH = sc.clientHeight;
    const ro = new ResizeObserver(() => {
      const w = sc.clientWidth;
      const h = sc.clientHeight;
      const changed = Math.abs(w - lastW) > 8 || (fitMode === 'page' && Math.abs(h - lastH) > 8);
      if (!changed) return;
      lastW = w;
      lastH = h;
      const next = fitMode === 'auto' ? autoScale() : fitScale(fitMode);
      if (Math.abs(next - scale) > 0.01) changeScale(next, fitMode);
    });
    ro.observe(sc);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, fitMode, scale]);

  // Track fullscreen state.
  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen && document.exitFullscreen();
    } else if (rootRef.current && rootRef.current.requestFullscreen) {
      rootRef.current.requestFullscreen();
    }
  };

  const handlePageJump = (e) => {
    e.preventDefault();
    const pageNum = parseInt(jumpPage, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
      scrollToPage(pageNum, true);
      setResumedAt(null);
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
  };

  const handleOutlineClick = async (dest) => {
    if (!dest || !pdf) return;
    try {
      let destArray = dest;
      if (typeof dest === 'string') {
        destArray = await pdf.getDestination(dest);
      }
      if (Array.isArray(destArray) && destArray[0]) {
        const pageIndex = await pdf.getPageIndex(destArray[0]);
        const pageNum = pageIndex + 1; // 1-based
        scrollToPage(pageNum, true);
        setResumedAt(null);
      }
    } catch (e) {
      console.error('Could not jump to destination', e);
    }
  };

  if (status === 'error') {
    return (
      <div className={styles.center}>
        <p>Couldn't open this book in the reader.</p>
        <p className={styles.dim}>{errorMsg}</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            className="button button--primary"
            onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
          >
            Try again
          </button>
          <a className="button button--secondary" href="/books">← Back to the Library</a>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.reader} ref={rootRef}>
      <div className={styles.controls}>
        {outline && outline.length > 0 && (
          <button
            type="button"
            className={styles.sidebarToggle}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Table of Contents"
            aria-label="Table of contents"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>
        )}
        <span className={styles.pages}>
          {status === 'ready' ? (
            <form onSubmit={handlePageJump} className={styles.pageJumpForm}>
              {/* Shows the page you're on; focus it to type a page to jump to. */}
              <input
                type="number"
                min="1"
                max={numPages}
                value={pageFocus ? jumpPage : String(currentPage)}
                onFocus={(e) => {
                  setPageFocus(true);
                  setJumpPage(String(currentPageRef.current));
                  const input = e.target;
                  requestAnimationFrame(() => input.select());
                }}
                onBlur={() => setPageFocus(false)}
                onChange={(e) => setJumpPage(e.target.value)}
                placeholder="Page"
                aria-label={`Page ${currentPage} of ${numPages}. Type a page number to jump to it.`}
                className={styles.pageInput}
              />
              <span className={styles.pageCount}>/ {numPages}</span>
              {pageLabels && pageLabels[currentPage - 1] && pageLabels[currentPage - 1] !== String(currentPage) && (
                <span className={styles.printedLabel} title="The page number printed in the book">
                  printed p. {pageLabels[currentPage - 1]}
                </span>
              )}
            </form>
          ) : (
            'Loading…'
          )}
        </span>

        <span className={styles.group}>
          <button onClick={() => changeScale(fitScale('width'), 'width')} disabled={status !== 'ready'}>
            Fit width
          </button>
          <button onClick={() => changeScale(fitScale('page'), 'page')} disabled={status !== 'ready'}>
            Fit page
          </button>
        </span>

        <span className={styles.zoom}>
          <button onClick={() => changeScale(clampScale(scale - 0.2))} aria-label="Zoom out">−</button>
          <span className={styles.zoomVal}>{Math.round(scale * 100)}%</span>
          <button onClick={() => changeScale(clampScale(scale + 0.2))} aria-label="Zoom in">+</button>
        </span>

        {resumedAt && (
          <span className={styles.resumeNote} role="status">
            Resumed at page {resumedAt} ·{' '}
            <button type="button" className={styles.resumeBtn} onClick={() => { scrollToPage(1, true); setResumedAt(null); }}>
              start from the beginning
            </button>
          </span>
        )}

        <button className={styles.fsBtn} onClick={toggleFullscreen}>
          {isFullscreen ? '✕ Exit full screen' : '⛶ Full screen'}
        </button>
      </div>

      <div className={styles.mainArea}>
        {sidebarOpen && outline && outline.length > 0 && (
          <nav className={styles.sidebar} aria-label="Table of contents">
            <div className={styles.sidebarHeader}>Table of Contents</div>
            <div className={styles.outlineTree}>
              {outline.map((item, i) => (
                <OutlineNode key={i} item={item} onNavigate={handleOutlineClick} />
              ))}
            </div>
          </nav>
        )}

        <div className={styles.scroll} ref={scrollRef}>
          {status === 'loading' && (
            <div className={styles.center}>
              <div className={styles.spinner} />
              <p>Loading “{title}”…</p>
              {progress > 0 && (
                <div className={styles.progressWrap}>
                  <div className={styles.progressBar} style={{ width: `${progress}%` }} />
                </div>
              )}
              {progress > 0 && <p className={styles.dim}>{progress}%</p>}
            </div>
          )}
          {status === 'ready' &&
            pdf &&
            Array.from({ length: numPages }, (_, i) => (
              <PdfPage
                key={`${i}-${scale}`}
                pdf={pdf}
                pageNumber={i + 1}
                scale={scale}
                size={baseSize.current ? { w: baseSize.current.w * scale, h: baseSize.current.h * scale } : null}
                registerObserver={registerObserver}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
