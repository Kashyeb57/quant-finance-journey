import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closedBars } from '../src/components/Terminal/localOverlay.mjs';

test('only finished candles are sent', () => {
  const bars = [{ time: 0 }, { time: 180 }, { time: 360 }];
  assert.deepEqual(closedBars(bars, 180, 400).map((b) => b.time), [0, 180]);
  assert.deepEqual(closedBars(bars, 180, 540).map((b) => b.time), [0, 180, 360]);
  assert.deepEqual(closedBars([], 180, 400), []);
});
