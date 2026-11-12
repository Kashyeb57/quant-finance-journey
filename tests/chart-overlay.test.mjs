import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lastClosedTime, withZero, robustRange, partitionMarks, triangleColors } from '../src/components/Terminal/chartOverlay.mjs';

test('signal marks with a bar price become triangles; dots stay with the library', () => {
  const a = { time: 1, shape: 'arrowUp', color: '#0f0', text: '20', price: 9 };
  const b = { time: 2, shape: 'arrowUp', color: '#0f0', text: '30', split: ['#0f0', '#b8f'], price: 10 };
  const c = { time: 3, shape: 'circle', color: '#777', text: 'FLAT' };
  const { plain, triangles } = partitionMarks([a, b, c]);
  assert.deepEqual(plain, [c]);
  assert.deepEqual(triangles, [a, b]);
  assert.deepEqual(triangleColors(a), ['#0f0', '#0f0']);
  assert.deepEqual(triangleColors(b), ['#0f0', '#b8f']);
  assert.deepEqual(partitionMarks(undefined), { plain: [], triangles: [] });
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
