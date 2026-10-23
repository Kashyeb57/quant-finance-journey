import { useCallback, useEffect, useState } from 'react';

/*
 * The Terminal's section layout: their order and which are collapsed, kept in
 * this browser's localStorage so the page opens the way it was left. A section
 * added to the page later appears at the end of a saved order; one removed is
 * dropped from it. Storage can be unavailable (private window, blocked site
 * data), so every read and write is guarded and the defaults still work.
 */

const KEY = 'terminal.layout.v1';

export default function useTerminalLayout(ids) {
  const [order, setOrder] = useState(ids);
  const [closed, setClosed] = useState({});
  const [loaded, setLoaded] = useState(false);

  // Read after mount, not during render, so server and browser HTML match.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) || 'null');
      if (saved && Array.isArray(saved.order)) {
        const kept = saved.order.filter((id) => ids.includes(id));
        setOrder([...kept, ...ids.filter((id) => !kept.includes(id))]);
        setClosed(saved.closed && typeof saved.closed === 'object' ? saved.closed : {});
      }
    } catch (_) { /* defaults */ }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ order, closed }));
    } catch (_) { /* not remembered, still works */ }
  }, [order, closed, loaded]);

  const move = useCallback((id, step) => {
    setOrder((o) => {
      const i = o.indexOf(id), j = i + step;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);
  const toggle = useCallback((id) => setClosed((c) => ({ ...c, [id]: !c[id] })), []);
  const reset = useCallback(() => {
    setOrder(ids);
    setClosed({});
  }, [ids]);

  return { order, isOpen: (id) => !closed[id], move, toggle, reset };
}
