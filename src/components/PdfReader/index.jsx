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
function PdfPage({ pdf, pageNumber, scale, registerObserver }) {
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
      setRendered(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  return (
    <div ref={holderRef} className={styles.page} data-page={pageNumber}>
      <div className={styles.pagePlaceholder}>Page {pageNumber}</div>
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
  const baseSize = useRef(null); // { w, h } of page 1 at scale 1
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const observerRef = useRef(null);
  const jobsRef = useRef(new Map());

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

  if (status === 'error') {
    return (
      <div className={styles.center}>
        <p>Couldn't open this book in the reader.</p>
        <p className={styles.dim}>{errorMsg}</p>
        <a className="button button--primary" href={url} target="_blank" rel="noreferrer">
          Open the PDF directly ↗
        </a>
      </div>
    );
  }

  return (
    <div className={styles.reader} ref={rootRef}>
      <div className={styles.controls}>
        <span className={styles.pages}>{status === 'ready' ? `${numPages} pages` : 'Loading…'}</span>

        <span className={styles.group}>
          <button onClick={() => setScale(fitScale('width'))} disabled={status !== 'ready'}>
            Fit width
          </button>
          <button onClick={() => setScale(fitScale('page'))} disabled={status !== 'ready'}>
            Fit page
          </button>
        </span>

        <span className={styles.zoom}>
          <button onClick={() => setScale((s) => clampScale(s - 0.2))} aria-label="Zoom out">−</button>
          <span className={styles.zoomVal}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => clampScale(s + 0.2))} aria-label="Zoom in">+</button>
        </span>

        <button className={styles.fsBtn} onClick={toggleFullscreen}>
          {isFullscreen ? '✕ Exit full screen' : '⛶ Full screen'}
        </button>
      </div>

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
              registerObserver={registerObserver}
            />
          ))}
      </div>
    </div>
  );
}
