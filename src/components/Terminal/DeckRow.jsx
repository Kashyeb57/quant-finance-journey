import React, { useEffect, useRef, useState } from 'react';
import styles from './styles.module.css';

/*
 * Two panels side by side in one deck, built like the chart + news deck: each
 * side collapses to a slim rail and the other fills the width (at least one
 * stays open), and the divider between them drags to resize. On narrow
 * screens the two stack and a collapsed side is just its header.
 *
 *   left / right: { title: node, rail: 'short label', body: node }
 */
export default function DeckRow({ left, right, initialSplit = 0.6, height = 460 }) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [split, setSplit] = useState(initialSplit);
  const deckRef = useRef(null);
  const draggingRef = useRef(false);

  const toggleLeft = () => { if (leftOpen && !rightOpen) return; setLeftOpen(!leftOpen); };
  const toggleRight = () => { if (rightOpen && !leftOpen) return; setRightOpen(!rightOpen); };

  const startResize = (e) => {
    draggingRef.current = true;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    if (e.cancelable) e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current || !deckRef.current) return;
      if (e.cancelable) e.preventDefault();
      const rect = deckRef.current.getBoundingClientRect();
      const cx = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
      setSplit(Math.max(0.2, Math.min(0.82, (cx - rect.left) / rect.width)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  const side = (s, open, toggle, cls, chevron) => (
    <section className={`${styles.deckSection} ${cls} ${open ? '' : styles.collapsed}`}>
      <button type="button" className={styles.deckHead} onClick={toggle} aria-expanded={open} title={open ? `Collapse ${s.rail}` : `Expand ${s.rail}`}>
        <span className={styles.deckTitle}>{s.title}</span>
        <span className={styles.collapseIcon} aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <div className={styles.deckBody}>{s.body}</div>
      <button type="button" className={styles.rail} onClick={toggle} aria-label={`Expand ${s.rail}`}>
        <span className={styles.railChevron} aria-hidden="true">{chevron}</span>
        <span className={styles.railTitle}>{s.rail}</span>
      </button>
    </section>
  );

  const both = leftOpen && rightOpen;
  return (
    <div
      className={`${styles.deck} ${styles.rowDeck}`}
      ref={deckRef}
      style={{ '--row-h': `${height}px`, ...(both ? { '--left-flex': split, '--right-flex': 1 - split } : null) }}
    >
      {side(left, leftOpen, toggleLeft, styles.leftSection, '›')}
      {both && (
        <div
          className={styles.resizer}
          onMouseDown={startResize}
          onTouchStart={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize"
        />
      )}
      {side(right, rightOpen, toggleRight, styles.rightSection, '‹')}
    </div>
  );
}
