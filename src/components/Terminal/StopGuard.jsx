import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchBars, sharedSnapshot, fmtPrice } from './marketData';
import {
  BUFFERS, DEFAULT_BUFFER, TRAPPED_MINUTES, stopLevel, isHit, firstHitBar, trapState, ctTimeToday, signalStops,
} from './stopRules.mjs';
import styles from './StopGuard.module.css';

/*
 * Stop Guard — a stop-loss ALARM for an option trade on the charted stock.
 * It never places, changes or cancels an order: when the underlying touches the
 * stop it chimes, notifies and flashes, and the owner exits in their broker.
 *
 * Rule (from the owner's own MU backtest, Nov 2026): stop = low (call) or high
 * (put) of the last 2 completed 1-minute candles before entry, -/+ a buffer.
 * Every entry triangle on the chart gets that stop the moment its candle closes,
 * drawn as a red line from the triangle, so the stop is known before entering.
 * "Arm" takes the newest triangle's stop and starts the alarm; a manual entry
 * (side + time) is still possible. A "trapped" warning fires when the trade is
 * still losing after 5 minutes: winners in that data worked within ~2 minutes,
 * losers were held 18+. The armed trade and the mute choice stay in this browser.
 */
const KEY = 'terminal.stopGuard.v1';
const MUTE_KEY = 'terminal.stopGuard.mute';
const LIVE_MS = 1000;     // live price check
const BARS_MS = 15000;    // 1-minute bars refresh (signal stops + touches between samples)
const REALARM_MS = 30000; // chime again until acknowledged
const RED = '#ef4444';

const load = (k) => { try { return JSON.parse(window.localStorage.getItem(k)); } catch { return null; } };
const store = (k, v) => { try { if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
const ctClock = (sec) => new Date(sec * 1000).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const sameCtDay = (a, b) => new Date(a * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) === new Date(b * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

/* Soft chime: sine notes with a quick rise and a long, gentle fade. */
function chime(ctx, notes) {
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime + 0.02;
    for (const freq of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.95);
      t += 0.16;
    }
  } catch (_) { /* audio unavailable */ }
}
const HIT_NOTES = [784, 988, 1175];   // G5 B5 D6, rising
const TRAP_NOTES = [659, 523];        // E5 C5, a gentle nudge

function notify(title, body) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'stop-guard', requireInteraction: true });
    }
  } catch (_) { /* notifications unavailable */ }
}

/* Red stop segments from each triangle, drawn on the candle series. */
function stopLayer() {
  let segs = [];
  let ctx = null;
  const renderer = {
    draw(target) {
      if (!ctx) return;
      target.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
        const ts = ctx.chart.timeScale(), series = ctx.series;
        c.save();
        for (const s of segs) {
          const y = series.priceToCoordinate(s.level);
          let x1 = ts.timeToCoordinate(s.x1), x2 = s.x2 != null ? ts.timeToCoordinate(s.x2) : null;
          if (y == null || x1 == null) continue;
          if (x2 == null) x2 = mediaSize.width;
          c.strokeStyle = RED; c.lineWidth = 2; c.globalAlpha = s.live ? 1 : 0.55;
          c.setLineDash(s.live ? [] : [5, 4]);
          c.beginPath(); c.moveTo(x1, Math.round(y) + 0.5); c.lineTo(x2, Math.round(y) + 0.5); c.stroke();
          if (s.hit) { // small x where the stop was touched
            c.setLineDash([]); c.lineWidth = 1.5;
            c.beginPath(); c.moveTo(x2 - 4, y - 4); c.lineTo(x2 + 4, y + 4); c.moveTo(x2 - 4, y + 4); c.lineTo(x2 + 4, y - 4); c.stroke();
          }
        }
        c.restore();
      });
    },
  };
  const view = { zOrder: () => 'top', renderer: () => renderer };
  const layer = {
    attached(p) { ctx = p; }, detached() { ctx = null; }, updateAllViews() {}, paneViews: () => [view],
  };
  return { layer, set(list) { segs = list; if (ctx) ctx.requestUpdate(); } };
}

export default function StopGuard({ ticker, seriesRef, lastBarRef, signals, open, onClose }) {
  const [side, setSide] = useState('call');
  const [buffer, setBuffer] = useState(DEFAULT_BUFFER);
  const [entryText, setEntryText] = useState('');
  const [manual, setManual] = useState(false);
  const [trade, setTrade] = useState(null);   // { ticker, side, buffer, entrySec, entrySpot, level, fromSignal }
  const [live, setLive] = useState(null);     // { price, nowSec }
  const [alarm, setAlarm] = useState(null);   // { kind: 'hit'|'trap', text, acked }
  const [muted, setMuted] = useState(false);
  const [bars1m, setBars1m] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const audioRef = useRef(null);
  const mutedRef = useRef(false);
  const lineRef = useRef({ series: null, line: null });
  const segRef = useRef({ series: null, layer: null });
  const trapDoneRef = useRef(false);
  const titleRef = useRef(null);

  useEffect(() => {
    const t = load(KEY);
    if (t && t.level != null && sameCtDay(t.entrySec, Date.now() / 1000)) setTrade(t);
    else store(KEY, null);
    const m = load(MUTE_KEY) === true; setMuted(m); mutedRef.current = m;
  }, []);
  const toggleMute = () => setMuted((m) => { mutedRef.current = !m; store(MUTE_KEY, !m); return !m; });

  // 1-minute candles of the charted stock, for the triangle stops (refreshed while there are triangles).
  const mySignals = useMemo(() => (signals || []).filter((s) => s.ticker === ticker), [signals, ticker]);
  useEffect(() => {
    if (!mySignals.length) { setBars1m(null); return undefined; }
    let alive = true;
    const get = () => fetchBars(ticker, '1Min').then(({ bars }) => { if (alive) setBars1m(bars); }).catch(() => {});
    get();
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') get(); }, BARS_MS);
    return () => { alive = false; clearInterval(id); };
  }, [ticker, mySignals]);
  const sigStops = useMemo(() => (bars1m ? signalStops(bars1m, mySignals, buffer) : []), [bars1m, mySignals, buffer]);
  const latest = sigStops.length ? sigStops[sigStops.length - 1] : null;
  const latestOpen = latest && latest.hitSec == null ? latest : null;

  // Draw the triangle stop lines on the current candle series.
  useEffect(() => {
    const series = seriesRef.current;
    if (segRef.current.series !== series) {
      const old = segRef.current;
      if (old.series && old.layer) { try { old.series.detachPrimitive(old.layer.layer); } catch (_) {} }
      segRef.current = { series, layer: null };
      if (series) {
        const l = stopLayer();
        try { series.attachPrimitive(l.layer); segRef.current.layer = l; } catch (_) {}
      }
    }
    const l = segRef.current.layer;
    if (l) {
      const tf = (s) => s.tfSec || 60;
      const snap = (sec, s) => Math.floor(sec / tf(s)) * tf(s); // chart candle that holds this time
      l.set(sigStops.map((s) => ({
        level: s.level, x1: s.time, hit: s.hitSec != null,
        x2: s.hitSec != null ? snap(s.hitSec, s) : (s.endSec >= Date.now() / 1000 - 1 ? null : snap(s.endSec, s)),
        live: s === latestOpen,
      })));
    }
  }, [sigStops, latestOpen, seriesRef, ticker]);
  useEffect(() => () => {
    const { series, layer } = segRef.current;
    if (series && layer) { try { series.detachPrimitive(layer.layer); } catch (_) {} }
  }, []);

  const ensureAudio = () => {
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioRef.current.state === 'suspended') audioRef.current.resume();
    } catch (_) { audioRef.current = null; }
  };

  const raise = useCallback((kind, text) => {
    setAlarm((a) => (a && a.kind === 'hit' ? a : { kind, text, acked: false }));
    if (!mutedRef.current) chime(audioRef.current, kind === 'hit' ? HIT_NOTES : TRAP_NOTES);
    notify(kind === 'hit' ? 'STOP HIT — get out' : 'Trapped — still losing', text);
  }, []);

  const disarm = () => {
    setTrade(null); setAlarm(null); setLive(null); store(KEY, null); trapDoneRef.current = false;
    const { series, line } = lineRef.current;
    if (series && line) { try { series.removePriceLine(line); } catch (_) {} }
    lineRef.current = { series: null, line: null };
  };

  const begin = (t) => {
    setTrade(t); store(KEY, t); setAlarm(null); trapDoneRef.current = false;
    if (t.entrySpot != null && isHit(t.side, t.level, t.entrySpot)) {
      raise('hit', `${t.ticker} ${fmtPrice(t.entrySpot)} is already past the stop ${fmtPrice(t.level)}.`);
    }
  };
  const askNotify = () => {
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission(); } catch (_) {}
  };

  // Arm on the newest triangle's stop: side and level are already known.
  function armSignal() {
    if (!latestOpen) return;
    setErr(''); ensureAudio(); askNotify();
    const nowSec = Math.floor(Date.now() / 1000);
    begin({ ticker, side: latestOpen.side, buffer, entrySec: nowSec, entrySpot: lastBarRef.current ? lastBarRef.current.close : null, level: latestOpen.level, fromSignal: latestOpen.time });
  }

  async function armManual() {
    setErr(''); ensureAudio(); askNotify();
    const nowSec = Math.floor(Date.now() / 1000);
    const entrySec = entryText.trim() ? ctTimeToday(entryText) : nowSec;
    if (entrySec == null) { setErr('Entry time: type it like 9:05 or 09:05:30 (CT), or leave it empty for now.'); return; }
    if (entrySec > nowSec + 5) { setErr('That entry time is in the future.'); return; }
    setBusy(true);
    try {
      const { bars } = await fetchBars(ticker, '1Min');
      const s = stopLevel(bars, entrySec, side, buffer);
      if (!s) { setErr('No 1-minute candle has closed yet today, so there is no stop to set. Try again after 8:31 CT.'); return; }
      const inMinute = bars.find((b) => b.time === Math.floor(entrySec / 60) * 60);
      const nowPrice = lastBarRef.current ? lastBarRef.current.close : null;
      const entrySpot = entrySec >= nowSec - 60 && nowPrice != null ? nowPrice : (inMinute ? inMinute.open : nowPrice);
      begin({ ticker, side, buffer, entrySec, entrySpot, level: s.level });
    } catch (_) {
      setErr('Could not load 1-minute candles. Check the connection and try again.');
    } finally { setBusy(false); }
  }

  // Live watch of the armed trade: price every second, 1-minute bars every 15 s,
  // and its stop as a labelled line on whichever chart series is current.
  useEffect(() => {
    if (!trade) return undefined;
    let alive = true;
    const check = async () => {
      const nowSec = Date.now() / 1000;
      let price = null;
      if (ticker === trade.ticker && lastBarRef.current) price = lastBarRef.current.close;
      else {
        const snap = await sharedSnapshot(trade.ticker).catch(() => null);
        price = snap && snap.last != null ? +snap.last : null;
      }
      if (!alive) return;
      setLive({ price, nowSec });
      const series = ticker === trade.ticker ? seriesRef.current : null;
      if (lineRef.current.series !== series) {
        const old = lineRef.current;
        if (old.series && old.line) { try { old.series.removePriceLine(old.line); } catch (_) {} }
        let line = null;
        if (series) {
          try { line = series.createPriceLine({ price: trade.level, color: RED, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: `STOP ${trade.side.toUpperCase()}` }); } catch (_) { line = null; }
        }
        lineRef.current = { series, line };
      }
      if (price != null && isHit(trade.side, trade.level, price)) {
        raise('hit', `${trade.ticker} ${fmtPrice(price)} touched your ${trade.side} stop ${fmtPrice(trade.level)} at ${ctClock(nowSec)} CT. Exit in Robinhood.`);
        return;
      }
      const tr = trapState({ entrySec: trade.entrySec, nowSec, side: trade.side, entrySpot: trade.entrySpot, price });
      if (tr.trapped && !trapDoneRef.current) {
        trapDoneRef.current = true;
        raise('trap', `${Math.floor(tr.elapsedMin)} min in and ${trade.ticker} is still against your ${trade.side}. Your winners usually work within 2-5 minutes.`);
      }
    };
    const checkBars = async () => {
      if (ticker !== trade.ticker && document.visibilityState === 'hidden') return;
      try {
        const { bars } = await fetchBars(trade.ticker, '1Min');
        const b = firstHitBar(bars, trade.entrySec, trade.side, trade.level);
        if (alive && b) raise('hit', `${trade.ticker} touched your ${trade.side} stop ${fmtPrice(trade.level)} in the ${ctClock(b.time)} CT candle. Exit in Robinhood.`);
      } catch (_) { /* next try */ }
    };
    check(); checkBars();
    const a = setInterval(check, LIVE_MS), b = setInterval(checkBars, BARS_MS);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, [trade, ticker, seriesRef, lastBarRef, raise]);

  // Chime again every 30 s until acknowledged; flash the tab title while a stop is hit.
  useEffect(() => {
    if (!alarm || alarm.acked) return undefined;
    const re = setInterval(() => { if (!mutedRef.current) chime(audioRef.current, alarm.kind === 'hit' ? HIT_NOTES : TRAP_NOTES); }, REALARM_MS);
    let flip = false;
    if (titleRef.current == null) titleRef.current = document.title;
    const fl = alarm.kind === 'hit' ? setInterval(() => { flip = !flip; document.title = flip ? '⛔ STOP HIT' : titleRef.current; }, 800) : null;
    return () => {
      clearInterval(re); if (fl) clearInterval(fl);
      if (titleRef.current != null) { document.title = titleRef.current; titleRef.current = null; }
    };
  }, [alarm]);

  useEffect(() => () => {
    const { series, line } = lineRef.current;
    if (series && line) { try { series.removePriceLine(line); } catch (_) {} }
  }, []);

  const tr = trade && live ? trapState({ entrySec: trade.entrySec, nowSec: live.nowSec, side: trade.side, entrySpot: trade.entrySpot, price: live.price }) : null;
  const dist = trade && live && live.price != null ? (trade.side === 'put' ? trade.level - live.price : live.price - trade.level) : null;
  const muteBtn = (
    <button type="button" className={styles.btn} onClick={toggleMute} aria-pressed={muted} title={muted ? 'Sound off' : 'Sound on'}>
      {muted ? '🔕' : '🔔'}
    </button>
  );

  if (!trade && !open) return null;
  return (
    <div className={`${styles.guard} ${alarm && !alarm.acked && alarm.kind === 'hit' ? styles.flash : ''}`} role="region" aria-label="Stop Guard">
      {alarm && !alarm.acked && (
        <div className={alarm.kind === 'hit' ? styles.hitBanner : styles.trapBanner} role="alert">
          <strong>{alarm.kind === 'hit' ? 'STOP HIT — get out' : 'TRAPPED — still losing'}</strong>
          <span>{alarm.text}</span>
          <button type="button" onClick={() => setAlarm((a) => a && { ...a, acked: true })}>Got it</button>
        </div>
      )}
      {trade ? (
        <div className={styles.row}>
          <span className={styles.tag}>STOP GUARD</span>
          <span>{trade.ticker} {trade.side.toUpperCase()} · in {ctClock(trade.entrySec)} CT{trade.fromSignal ? ' · from triangle' : ''}</span>
          <span className={styles.lvl}>stop {fmtPrice(trade.level)}</span>
          {dist != null && <span className={dist > 0 ? styles.ok : styles.bad}>{dist > 0 ? `${fmtPrice(dist)} away` : 'at/through stop'}</span>}
          {tr && (
            <span className={tr.trapped ? styles.bad : tr.against ? styles.warn : styles.ok}>
              {Math.floor(tr.elapsedMin)}:{String(Math.floor((tr.elapsedMin % 1) * 60)).padStart(2, '0')} in trade{tr.against ? ' · against you' : ''}
            </span>
          )}
          {muteBtn}
          <button type="button" className={styles.btn} onClick={disarm}>Disarm</button>
          {ticker !== trade.ticker && <span className={styles.note}>(watching {trade.ticker} — switch the chart to see the line)</span>}
        </div>
      ) : (
        <>
          <div className={styles.row}>
            <span className={styles.tag}>STOP GUARD</span>
            <span>{ticker}</span>
            <label className={styles.lab}>buffer
              <select value={buffer} onChange={(e) => setBuffer(+e.target.value)}>
                {BUFFERS.map((b) => <option key={b} value={b}>${b.toFixed(2)}</option>)}
              </select>
            </label>
            {latestOpen ? (
              <button type="button" className={styles.arm} onClick={armSignal} title="Start the alarm on the newest triangle's stop">
                I'm in: {latestOpen.side.toUpperCase()} · stop {fmtPrice(latestOpen.level)}
              </button>
            ) : (
              <span className={styles.note}>{mySignals.length ? (latest ? 'newest triangle’s stop already hit' : 'setting triangle stops…') : 'no triangle today (turn on SATS)'}</span>
            )}
            <button type="button" className={styles.btn} onClick={() => setManual((m) => !m)} aria-expanded={manual}>manual</button>
            {muteBtn}
            <button type="button" className={styles.btn} onClick={onClose} aria-label="Close Stop Guard">✕</button>
          </div>
          {manual && (
            <div className={styles.row}>
              <div className={styles.seg} role="group" aria-label="Trade side">
                {['call', 'put'].map((s) => (
                  <button key={s} type="button" className={side === s ? styles.segOn : ''} onClick={() => setSide(s)} aria-pressed={side === s}>{s.toUpperCase()}</button>
                ))}
              </div>
              <label className={styles.lab}>entry CT
                <input value={entryText} onChange={(e) => setEntryText(e.target.value)} placeholder="now" inputMode="numeric" aria-label="Entry time in CT, empty for now" />
              </label>
              <button type="button" className={styles.btn} onClick={armManual} disabled={busy}>{busy ? 'Setting…' : 'Arm manual stop'}</button>
            </div>
          )}
        </>
      )}
      {err && <div className={styles.err}>{err}</div>}
      {!trade && !err && (
        <div className={styles.hint}>
          Red lines = each triangle&apos;s stop, set when its candle closes: {'the low (buy) or high (sell) of the last 2 closed 1-minute candles'} ∓ ${buffer.toFixed(2)}.
          Alarm only: nothing is ordered; you exit in your broker. Trapped warning after {TRAPPED_MINUTES} min against you.
        </div>
      )}
    </div>
  );
}
