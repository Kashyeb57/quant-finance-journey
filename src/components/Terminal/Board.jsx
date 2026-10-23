import React, { useEffect, useRef, useState } from 'react';
import { TILES } from './boardTiles';
import styles from './styles.module.css';

/*
 * The Terminal board: one bordered panel holding every block, joined by
 * dividers the way chart and news are. Full rows (the chart + news deck, the
 * portfolio) span the width and move up/down as a whole. Every other row is a
 * set of tiles side by side; a tile collapses to a slim rail so its neighbours
 * widen (a row whose tiles are all collapsed folds to their headers), moves
 * left/right or into the row above/below, and the divider between two open
 * tiles drags to resize them. Narrow screens stack the tiles.
 *
 *   layout: useBoardLayout()   ctx: data for the tiles   full: { id: { title, render } }
 */

function Tool({ label, disabled, onClick, children }) {
  return (
    <button type="button" className={styles.tileTool} onClick={onClick} disabled={disabled} aria-label={label} title={label}>
      {children}
    </button>
  );
}

export default function Board({ layout, ctx, full }) {
  const { rows, isOpen, move, toggle } = layout;
  const [weights, setWeights] = useState({});
  const els = useRef({});
  const drag = useRef(null);
  const weight = (id) => weights[id] ?? TILES[id].w;

  const startResize = (a, b) => (e) => {
    const ea = els.current[a], eb = els.current[b];
    if (!ea || !eb) return;
    drag.current = { a, b, left: ea.getBoundingClientRect().left, span: ea.offsetWidth + eb.offsetWidth, total: weight(a) + weight(b) };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    if (e.cancelable) e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      const d = drag.current;
      if (!d) return;
      if (e.cancelable) e.preventDefault();
      const cx = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
      const f = Math.max(0.15, Math.min(0.85, (cx - d.left) / d.span));
      setWeights((w) => ({ ...w, [d.a]: d.total * f, [d.b]: d.total * (1 - f) }));
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
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

  const lastRow = rows.length - 1;
  return (
    <div className={styles.board}>
      {rows.map((row, r) => {
        const fullBlock = row.length === 1 && full[row[0]];
        if (fullBlock) {
          const id = row[0];
          return (
            <div key={id} className={`${styles.boardRow} ${styles.fullRow}`} data-block={id}>
              <div className={styles.rowStrip}>
                <span className={styles.rowStripTitle}>{fullBlock.title}</span>
                <span className={styles.tileTools}>
                  <Tool label={`Move ${fullBlock.title} up`} disabled={r === 0} onClick={() => move(id, 'up')}>↑</Tool>
                  <Tool label={`Move ${fullBlock.title} down`} disabled={r === lastRow} onClick={() => move(id, 'down')}>↓</Tool>
                </span>
              </div>
              {fullBlock.render()}
            </div>
          );
        }

        const openIds = row.filter(isOpen);
        const rowH = openIds.length ? Math.max(...openIds.map((id) => TILES[id].h)) : null;
        return (
          <div
            key={row.join('|')}
            className={`${styles.boardRow} ${styles.tileRow} ${openIds.length ? '' : styles.rowFolded}`}
            style={rowH ? { '--row-h': `${rowH}px` } : undefined}
          >
            {row.map((id, i) => {
              const t = TILES[id];
              const open = isOpen(id);
              const next = row[i + 1];
              const label = t.rail;
              return (
                <React.Fragment key={id}>
                  <section
                    ref={(el) => { els.current[id] = el; }}
                    className={`${styles.tile} ${open ? '' : styles.tileClosed}`}
                    style={{ '--tile-h': `${t.h}px`, ...(open ? { flexGrow: weight(id) } : null) }}
                    data-tile={id}
                  >
                    <div className={styles.tileHead}>
                      <button type="button" className={styles.tileTitle} onClick={() => toggle(id)} aria-expanded={open} title={open ? `Collapse ${label}` : `Expand ${label}`}>
                        {t.title(ctx)}
                      </button>
                      <span className={styles.tileTools}>
                        <Tool label={`Move ${label} left`} disabled={i === 0} onClick={() => move(id, 'left')}>←</Tool>
                        <Tool label={`Move ${label} right`} disabled={i === row.length - 1} onClick={() => move(id, 'right')}>→</Tool>
                        <Tool label={`Move ${label} up`} disabled={r === 0 && row.length === 1} onClick={() => move(id, 'up')}>↑</Tool>
                        <Tool label={`Move ${label} down`} disabled={r === lastRow && row.length === 1} onClick={() => move(id, 'down')}>↓</Tool>
                        <button type="button" className={styles.collapseIcon} onClick={() => toggle(id)} aria-label={open ? `Collapse ${label}` : `Expand ${label}`}>
                          {open ? '−' : '+'}
                        </button>
                      </span>
                    </div>
                    <div className={styles.tileBody}>{t.render(ctx)}</div>
                    <button type="button" className={styles.rail} onClick={() => toggle(id)} aria-label={`Expand ${label}`}>
                      <span className={styles.railChevron} aria-hidden="true">›</span>
                      <span className={styles.railTitle}>{label}</span>
                    </button>
                  </section>
                  {open && next && isOpen(next) && (
                    <div
                      className={styles.resizer}
                      onMouseDown={startResize(id, next)}
                      onTouchStart={startResize(id, next)}
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Drag to resize ${label} and ${TILES[next].rail}`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
