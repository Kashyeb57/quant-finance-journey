// Terminal news: zone-less feed dates, future-stamped items, same-source repeats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './extract.mjs';

const { normalizeFeedDate, isFutureDate, mergeHeadlines } = extract(
  'src/components/Terminal/News.jsx',
  '// ── Feed dates',
  '// Map tickers',
  ['normalizeFeedDate', 'isFutureDate', 'mergeHeadlines'],
);

const NOW = Date.parse('2026-09-15T01:40:00Z'); // 8:40 pm CT on Sep 14, as in the review
const UTC_FEED = { source: 'INVESTING', tz: 'UTC' };
const item = (source, title, pubDate, link) => ({ source, title, pubDate, link: link || `${source}-${title}-${pubDate}` });

test('a UTC feed\'s zone-less time is read as UTC, whatever the visitor\'s zone', () => {
  assert.equal(normalizeFeedDate('2026-09-15 01:19:46', UTC_FEED), '2026-09-15T01:19:46Z');
  assert.equal(Date.parse(normalizeFeedDate('2026-09-15 01:19:46', UTC_FEED)), Date.parse('2026-09-15T01:19:46Z'));
  assert.equal(normalizeFeedDate('2026-09-15 01:19', UTC_FEED), '2026-09-15T01:19Z');
});

test('dates that already carry a zone, or feeds not marked UTC, are left alone', () => {
  assert.equal(normalizeFeedDate('Tue, 15 Sep 2026 01:23:00 +0000', UTC_FEED), 'Tue, 15 Sep 2026 01:23:00 +0000');
  assert.equal(normalizeFeedDate('2026-09-15T01:52:41Z', UTC_FEED), '2026-09-15T01:52:41Z');
  assert.equal(normalizeFeedDate('2026-09-15 01:19:46', { source: 'OTHER' }), '2026-09-15 01:19:46');
  assert.equal(normalizeFeedDate('  Mon, 14 Sep 2026 21:15:56 GMT ', { source: 'CNBC' }), 'Mon, 14 Sep 2026 21:15:56 GMT');
});

test('only timestamps beyond a few minutes of skew count as future', () => {
  assert.equal(isFutureDate('2026-09-15T06:19:46Z', NOW), true); // the reviewed case: 4h39m ahead
  assert.equal(isFutureDate('2026-09-15T01:43:00Z', NOW), false); // 3 min of clock skew
  assert.equal(isFutureDate('2026-09-15T01:30:00Z', NOW), false);
  assert.equal(isFutureDate('not a date', NOW), false);
});

test('future-stamped items sort after every dated headline', () => {
  const merged = mergeHeadlines([], [
    item('INVESTING', 'Ahead of the clock', '2026-09-15T06:19:46Z'),
    item('CNBC', 'An hour old', '2026-09-15T00:40:00Z'),
    item('BBC BIZ', 'Two minutes old', '2026-09-15T01:38:00Z'),
  ], NOW);
  assert.deepEqual(merged.map((m) => m.title), ['Two minutes old', 'An hour old', 'Ahead of the clock']);
});

test('the same headline twice from one publisher (different URLs) is shown once, newest kept', () => {
  const merged = mergeHeadlines([], [
    item('PR NEWSWIRE', 'Peak3 Launches Next-Gen Insurance Platform', '2026-09-15T01:23:00Z', 'https://prn/a'),
    item('PR NEWSWIRE', 'Peak3 launches next-gen insurance platform!', '2026-09-15T01:20:00Z', 'https://prn/b'),
  ], NOW);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].link, 'https://prn/a');
});

test('a reworded update, a repeat days later, or another publisher is kept', () => {
  const merged = mergeHeadlines([], [
    item('PR NEWSWIRE', 'Peak3 launches insurance platform', '2026-09-15T01:23:00Z'),
    item('PR NEWSWIRE', 'Peak3 launches insurance platform in Japan', '2026-09-15T01:25:00Z'),
    item('PR NEWSWIRE', 'Peak3 launches insurance platform', '2026-09-13T01:23:00Z'),
    item('BENZINGA', 'Peak3 launches insurance platform', '2026-09-15T01:24:00Z'),
  ], NOW);
  assert.equal(merged.length, 4);
});

test('a repeated link keeps the freshly fetched copy', () => {
  const old = { ...item('CNBC', 'Old title', '2026-09-15T01:00:00Z', 'https://cnbc/x') };
  const fresh = { ...item('CNBC', 'Corrected title', '2026-09-15T01:00:00Z', 'https://cnbc/x') };
  const merged = mergeHeadlines([old], [fresh], NOW);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'Corrected title');
});
