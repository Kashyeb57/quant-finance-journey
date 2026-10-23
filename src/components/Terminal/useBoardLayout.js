import { useCallback, useEffect, useState } from 'react';

/*
 * Layout of the Terminal board: rows of tiles, and which tiles are collapsed.
 * Kept in this browser's localStorage so the page opens the way it was left
 * (guarded: storage can be unavailable, and the defaults still work).
 *
 * A "full" row holds one wide block (the chart + news deck, the portfolio);
 * it moves up and down as a whole. Any other tile moves left/right within its
 * row, or up/down into the neighbouring row of tiles; next to a full row (or
 * at an edge) it starts a row of its own.
 */

const KEY = 'terminal.board.v1';

export const FULL_ROWS = ['chart', 'portfolio'];
export const DEFAULT_ROWS = [
  ['chart'],
  ['chain', 'moves'],
  ['surface', 'depth', 'pnl'],
  ['sats', 'regime', 'breadth'],
  ['equity', 'sharpe', 'vol', 'positions'],
  ['portfolio'],
];
const ALL = DEFAULT_ROWS.flat();
const isFull = (row) => row.length === 1 && FULL_ROWS.includes(row[0]);
const tidy = (rows) => rows.filter((r) => r.length);

// A saved layout, cleaned up: unknown tiles dropped, duplicates removed, full
// blocks kept on their own row, and tiles added since appended at the end.
function sanitize(saved) {
  if (!Array.isArray(saved)) return null;
  const seen = new Set();
  const rows = [];
  for (const row of saved) {
    if (!Array.isArray(row)) continue;
    const ids = row.filter((id) => ALL.includes(id) && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    for (const id of ids.filter((x) => FULL_ROWS.includes(x))) rows.push([id]);
    const tiles = ids.filter((x) => !FULL_ROWS.includes(x));
    if (tiles.length) rows.push(tiles);
  }
  const missing = ALL.filter((id) => !seen.has(id));
  if (missing.length) rows.push(...missing.map((id) => [id]));
  return rows.length ? rows : null;
}

export function moveTile(rows, id, dir) {
  const r = rows.findIndex((row) => row.includes(id));
  if (r < 0) return rows;
  const next = rows.map((row) => [...row]);
  const i = next[r].indexOf(id);

  if (dir === 'left' || dir === 'right') {
    const j = i + (dir === 'left' ? -1 : 1);
    if (j < 0 || j >= next[r].length) return rows;
    [next[r][i], next[r][j]] = [next[r][j], next[r][i]];
    return next;
  }

  const t = r + (dir === 'up' ? -1 : 1);
  // A full block, or a tile alone in its row, swaps places with the neighbour row.
  if (isFull(next[r]) || next[r].length === 1) {
    if (t < 0 || t >= next.length) return rows;
    if (!isFull(next[r]) && !isFull(next[t])) {
      next[t].push(id);
      next[r] = [];
      return tidy(next);
    }
    [next[r], next[t]] = [next[t], next[r]];
    return next;
  }
  next[r].splice(i, 1);
  if (t >= 0 && t < next.length && !isFull(next[t])) next[t].push(id);
  else next.splice(dir === 'up' ? r : r + 1, 0, [id]);
  return tidy(next);
}

export default function useBoardLayout() {
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [closed, setClosed] = useState({});
  const [loaded, setLoaded] = useState(false);

  // Read after mount, not during render, so server and browser HTML match.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      const clean = saved && sanitize(saved.rows);
      if (clean) setRows(clean);
      if (saved && saved.closed && typeof saved.closed === 'object') setClosed(saved.closed);
    } catch (_) { /* defaults */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ rows, closed }));
    } catch (_) { /* not remembered, still works */ }
  }, [rows, closed, loaded]);

  const move = useCallback((id, dir) => setRows((rs) => moveTile(rs, id, dir)), []);
  const toggle = useCallback((id) => setClosed((c) => ({ ...c, [id]: !c[id] })), []);
  const reset = useCallback(() => {
    setRows(DEFAULT_ROWS);
    setClosed({});
  }, []);

  return { rows, isOpen: (id) => !closed[id], move, toggle, reset };
}
