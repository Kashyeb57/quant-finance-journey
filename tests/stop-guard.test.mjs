// Stop Guard rules (Terminal): the 1-minute stop that tested best on the
// owner's MU option trades. Alerts only; these functions never place orders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stopLevel, completedBefore, isHit, firstHitBar, trapState, ctTimeToday, signalStops, tradeStatus } from '../src/components/Terminal/stopRules.mjs';

// Tue Nov 24 2026, 8:30 CT = 14:30 UTC.
const OPEN = Date.UTC(2026, 10, 24, 14, 30) / 1000;
const bar = (i, o, h, l, c) => ({ time: OPEN + i * 60, open: o, high: h, low: l, close: c });
const BARS = [
  bar(0, 650, 652, 648, 651),   // 8:30
  bar(1, 651, 655, 650, 654),   // 8:31
  bar(2, 654, 656, 653, 655),   // 8:32
  bar(3, 655, 655.5, 651.2, 652), // 8:33
  bar(4, 652, 653, 649.9, 650),   // 8:34 (touches a call stop at 650.5)
];

test('only fully closed candles before the entry count, from the same CT day', () => {
  const entry = OPEN + 2 * 60 + 40; // 8:32:40 -> 8:30 and 8:31 are complete, 8:32 is not
  assert.deepEqual(completedBefore(BARS, entry).map((b) => b.time), [OPEN, OPEN + 60]);
  const yesterday = { ...bar(0, 1, 1, 1, 1), time: OPEN - 86400 + 6 * 3600 };
  assert.deepEqual(completedBefore([yesterday], OPEN + 20), [], 'no carry-over from yesterday');
});

test('call and put stop levels use the last 2 completed candles and the buffer', () => {
  const entry = OPEN + 3 * 60 + 5; // 8:33:05 -> basis 8:31 and 8:32
  assert.equal(stopLevel(BARS, entry, 'call', 0.5).level, 649.5);   // min low 650 - 0.50
  assert.equal(stopLevel(BARS, entry, 'put', 0.5).level, 656.5);    // max high 656 + 0.50
  assert.equal(stopLevel(BARS, entry, 'call', 0.25).level, 649.75);
  assert.equal(stopLevel(BARS, entry, 'put', 1).level, 657);
  assert.equal(stopLevel(BARS, OPEN + 20, 'call'), null, 'no completed candle at 8:30:20');
});

test('a hit is a touch at or through the stop, in the right direction', () => {
  assert.ok(isHit('call', 650, 650));
  assert.ok(!isHit('call', 650, 650.01));
  assert.ok(isHit('put', 656.5, 640, 656.5));
  assert.ok(!isHit('put', 656.5, 640, 656.49));
  assert.ok(!isHit('call', null, 1));
});

test('the first hit candle is after the entry minute', () => {
  const entry = OPEN + 3 * 60 + 5; // the 8:34 low is 649.90
  assert.equal(firstHitBar(BARS, entry, 'call', 650)?.time, OPEN + 4 * 60);
  assert.equal(firstHitBar(BARS, entry, 'call', 649.0), null);
  assert.equal(firstHitBar(BARS, OPEN + 4 * 60 + 10, 'call', 649.95), null, 'the entry minute itself is not scanned');
});

test('trapped = still losing after the limit; a winning trade is never trapped', () => {
  const base = { entrySec: 1000, side: 'call', entrySpot: 100 };
  assert.deepEqual(trapState({ ...base, nowSec: 1000 + 4 * 60, price: 99 }), { elapsedMin: 4, against: true, trapped: false });
  assert.equal(trapState({ ...base, nowSec: 1000 + 5 * 60, price: 99 }).trapped, true);
  assert.equal(trapState({ ...base, nowSec: 1000 + 30 * 60, price: 101 }).trapped, false);
  assert.equal(trapState({ ...base, side: 'put', nowSec: 1000 + 6 * 60, price: 101 }).trapped, true);
  assert.equal(trapState({ ...base, nowSec: 1000 + 6 * 60, price: 99, minutes: 10 }).trapped, false);
});

test('CT clock times convert with daylight saving', () => {
  const nov = Date.UTC(2026, 10, 24, 15, 0); // CST
  assert.equal(ctTimeToday('9:05', nov), Date.UTC(2026, 10, 24, 15, 5) / 1000);
  assert.equal(ctTimeToday('08:30:15', nov), Date.UTC(2026, 10, 24, 14, 30, 15) / 1000);
  const jul = Date.UTC(2026, 6, 15, 15, 0); // CDT
  assert.equal(ctTimeToday('9:05', jul), Date.UTC(2026, 6, 15, 14, 5) / 1000);
  for (const bad of ['', '25:00', '9:60', 'nine', '9']) assert.equal(ctTimeToday(bad, nov), null, bad);
});

test('every entry triangle gets its stop the moment its candle closes, ending at the hit or the next triangle', () => {
  const now = OPEN + 10 * 60;
  // Buy triangle on the 8:31 candle (1-min chart): confirmed 8:32, basis 8:30 + 8:31 -> stop 648 - 0.50.
  // Sell triangle on the 8:33 candle: confirmed 8:34, basis 8:32 + 8:33 -> stop 656 + 0.50.
  const sig = [
    { time: OPEN + 60, side: 'call', tfSec: 60 },
    { time: OPEN + 3 * 60, side: 'put', tfSec: 60 },
    { time: OPEN + 9 * 60, side: 'call', tfSec: 60 },        // 8:39 candle still forming at 8:40? confirmed at 8:40 = now
    { time: OPEN - 86400, side: 'call', tfSec: 60 },         // yesterday: ignored
  ];
  const s = signalStops(BARS, sig, 0.5, now);
  assert.equal(s[0].startSec, OPEN + 2 * 60);
  assert.equal(s[0].level, 647.5);
  assert.equal(s[0].hitSec, null, '8:33/8:34 lows stay above 647.50');
  assert.equal(s[0].endSec, OPEN + 4 * 60, 'ends where the next triangle starts');
  assert.equal(s[1].side, 'put');
  assert.equal(s[1].level, 656.5);
  assert.ok(s.every((x) => x.time >= OPEN), 'yesterday dropped');
  // A 3-minute chart: the triangle's candle closes 3 minutes after its start.
  const s3 = signalStops(BARS, [{ time: OPEN, side: 'call', tfSec: 180 }], 0.5, now);
  assert.equal(s3[0].startSec, OPEN + 180);
  assert.equal(s3[0].level, 647.5, 'beyond the whole 8:30-8:32 triangle candle (low 648) - 0.50');
  assert.equal(s3[0].hitSec, null, 'the 8:34 low 649.90 stays above 649.50');
});

test('on a bigger chart a triangle stop is never inside the triangle candle (the Nov 24 12:36 MU case)', () => {
  // 3-minute sell triangle on the 12:36 candle; 1-min highs 635.80, 634.68, 634.66; confirmed 12:39.
  const T = Date.UTC(2026, 10, 24, 18, 36) / 1000;
  const b = (i, h, l) => ({ time: T + i * 60, open: l, high: h, low: l, close: l });
  const bars = [b(0, 635.8, 633.77), b(1, 634.68, 634.11), b(2, 634.66, 633.75), b(3, 635.84, 633.9), b(4, 637.03, 635.36)];
  const [s] = signalStops(bars, [{ time: T, side: 'put', tfSec: 180 }], 0.5, T + 10 * 60);
  assert.equal(s.level, 636.3, 'above the triangle candle high 635.80 + 0.50, not 634.68 + 0.50');
  assert.equal(s.hitSec, T + 4 * 60, 'the 12:40 spike to 637.03 still touches it');
  // On a 1-minute chart the rule is unchanged (the triangle candle is one of the last two).
  const [s1] = signalStops(bars, [{ time: T + 2 * 60, side: 'put', tfSec: 60 }], 0.5, T + 10 * 60);
  assert.equal(s1.level, 635.18);
});

test('trade status: our 1-min stop for the indicator trade, TPs counted only before that stop', () => {
  const now = OPEN + 10 * 60;
  // Buy triangle on the 8:31 candle (1-min chart): our SL = min low of 8:30-8:31 (648) - 0.50.
  const trade = { time: OPEN + 60, side: 'buy', entry: 654, tp: [655.2, 656, 660] };
  const st = tradeStatus(BARS, trade, 60, 0.5, now);
  assert.equal(st.sl, 647.5);
  assert.equal(st.slHit, false);
  assert.deepEqual(st.hit, [true, true, false], '8:32 high 656 reaches TP1 and TP2, never 660');
  // A stop of 0.0 buffer on a later buy triangle is hit at 8:34 before any TP.
  const t2 = { time: OPEN + 2 * 60, side: 'buy', entry: 655, tp: [656.5, 658, 660] };
  const s2 = tradeStatus(BARS, t2, 60, 0, now);
  assert.equal(s2.slHit, true);
  assert.equal(s2.hitSec, OPEN + 4 * 60, 'the 8:34 candle hit it');
  assert.deepEqual(s2.hit, [false, false, false]);
});
