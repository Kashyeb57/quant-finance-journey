// NYSE session status: holidays, early closes, pre/after hours, weekends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './extract.mjs';

const { marketStatus } = extract(
  'src/components/Terminal/marketData.js',
  'const NYSE_HOLIDAYS',
  '/* fmtPrice / fmtVolume',
  ['marketStatus'],
);

// An instant from a New York wall-clock time, whichever of EST/EDT applies.
function ny(date, hhmm) {
  for (const off of ['-04:00', '-05:00']) {
    const guess = new Date(`${date}T${hhmm}:00${off}`);
    const back = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(guess);
    if (back.replace(/^24/, '00') === hhmm) return guess;
  }
  throw new Error(`bad time ${date} ${hhmm}`);
}

const cases = [
  ['2026-11-26', '11:00', 'closed', 'Thanksgiving'],
  ['2026-11-27', '10:00', 'open', 'closes 1:00 pm'],
  ['2026-11-27', '13:30', 'after', 'early close'],
  ['2026-11-27', '17:30', 'closed', ''],
  ['2026-12-24', '12:59', 'open', 'closes 1:00 pm'],
  ['2026-12-25', '10:00', 'closed', 'Christmas'],
  ['2026-07-03', '10:00', 'closed', 'Independence Day'],
  ['2026-07-02', '15:59', 'open', ''],
  ['2026-09-14', '09:29', 'pre', ''],
  ['2026-09-14', '09:30', 'open', ''],
  ['2026-09-14', '16:00', 'after', ''],
  ['2026-09-14', '19:59', 'after', ''],
  ['2026-09-14', '20:00', 'closed', ''],
  ['2026-09-14', '00:30', 'closed', ''],
  ['2026-09-13', '11:00', 'closed', 'weekend'],
  ['2027-06-18', '11:00', 'closed', 'Juneteenth'],
  ['2027-12-24', '11:00', 'closed', 'Christmas'],
  ['2028-01-03', '11:00', 'open', ''],
];

for (const [date, time, state, label] of cases) {
  test(`${date} ${time} ET is ${state}${label ? ` (${label})` : ''}`, () => {
    const s = marketStatus(ny(date, time));
    assert.equal(s.state, state, s.label);
    if (label) assert.ok(s.label.includes(label), `label "${s.label}" should mention "${label}"`);
  });
}
