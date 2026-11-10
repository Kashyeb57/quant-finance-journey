import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lastClosedTime } from '../src/components/Terminal/chartOverlay.mjs';

test('the newest finished candle', () => {
  const bars = [{ time: 0 }, { time: 180 }, { time: 360 }];
  assert.equal(lastClosedTime(bars, 180, 400), 180);
  assert.equal(lastClosedTime(bars, 180, 540), 360);
  assert.equal(lastClosedTime([], 180, 400), 0);
});
