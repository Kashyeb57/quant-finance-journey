import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lastClosedTime, withZero, robustRange, partitionMarks } from '../src/components/Terminal/chartOverlay.mjs';

test('two-color marks are drawn separately; every other mark stays with the library', () => {
  const a = { time: 1, shape: 'arrowUp', color: '#0f0', text: 'BUY 20' };
  const b = { time: 2, shape: 'arrowUp', color: '#0f0', text: 'BUY 30', split: ['#0f0', '#b8f'], price: 10 };
  const c = { time: 3, shape: 'circle', color: '#777', split: ['#0f0', '#b8f'] }; // no price: left as is
  const { plain, split } = partitionMarks([a, b, c]);
  assert.deepEqual(plain, [a, c]);
  assert.deepEqual(split, [b]);
  assert.deepEqual(partitionMarks(undefined), { plain: [], split: [] });
});

test('one spike at the open does not flatten the lower line', () => {
  const values = Array.from({ length: 200 }, (_, i) => Math.sin(i / 5) * 2);
  values[100] = 25; values[101] = 18; values[102] = 12;
  const { minValue, maxValue } = robustRange(values).priceRange;
  assert.ok(maxValue < 4 && maxValue > 2, `top ${maxValue}`);
  assert.ok(minValue < -2 && minValue > -4, `bottom ${minValue}`);
  assert.equal(robustRange([1]), null);
  const pos = robustRange(Array.from({ length: 50 }, (_, i) => 1 + i / 10)).priceRange;
  assert.equal(pos.minValue, 0);
});

test('the lower pane scale always includes zero', () => {
  const r = (minValue, maxValue) => ({ priceRange: { minValue, maxValue } });
  assert.deepEqual(withZero(r(-3, -1)).priceRange, { minValue: -3, maxValue: 0 });
  assert.deepEqual(withZero(r(1, 2)).priceRange, { minValue: 0, maxValue: 2 });
  assert.deepEqual(withZero(r(-1, 2)).priceRange, { minValue: -1, maxValue: 2 });
  assert.equal(withZero(null), null);
});

test('the newest finished candle', () => {
  const bars = [{ time: 0 }, { time: 180 }, { time: 360 }];
  assert.equal(lastClosedTime(bars, 180, 400), 180);
  assert.equal(lastClosedTime(bars, 180, 540), 360);
  assert.equal(lastClosedTime([], 180, 400), 0);
});
