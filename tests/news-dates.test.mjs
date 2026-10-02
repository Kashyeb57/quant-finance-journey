// Terminal news: zone-less feed dates, future-stamped items, same-source repeats,
// and WhatsApp channel posts (no URL) from the channel-feed Worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './extract.mjs';

const { normalizeFeedDate, isFutureDate, mergeHeadlines, channelPostItem } = extract(
  'src/components/Terminal/News.jsx',
  '// ── Feed dates',
  '// Map tickers',
  ['normalizeFeedDate', 'isFutureDate', 'mergeHeadlines', 'channelPostItem'],
);

const { stampCT } = extract(
  'src/components/Terminal/News.jsx',
  '// The stamp on each headline',
  '// Tooltip:',
  ['stampCT'],
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

const CHANNEL = { source: 'CAKTUSJXCK', cat: 'MKT', credit: 'From the public WhatsApp channel CaktusJxck' };
const post = (id, text, iso) => ({ id, text, ts: Date.parse(iso) / 1000, media_type: '' });

test('a channel post becomes a credited, link-less headline at its posting time', () => {
  const it = channelPostItem(post('3EB0A1', '  Micron expects capex above $50 billion  ', '2026-09-30T21:40:18Z'), CHANNEL);
  assert.deepEqual(it, {
    title: 'Micron expects capex above $50 billion', link: '', key: 'wa:CAKTUSJXCK:3EB0A1',
    pubDate: '2026-09-30T21:40:18.000Z', source: 'CAKTUSJXCK', cat: 'MKT',
    credit: 'From the public WhatsApp channel CaktusJxck',
  });
});

test('a channel post without text, id or a usable time is dropped', () => {
  assert.equal(channelPostItem(post('1', '   ', '2026-09-30T21:40:18Z'), CHANNEL), null);
  assert.equal(channelPostItem({ text: 'No id', ts: 1790800000 }, CHANNEL), null);
  assert.equal(channelPostItem({ id: '2', text: 'No time' }, CHANNEL), null);
  assert.equal(channelPostItem({ id: '3', text: 'Bad time', ts: 'soon' }, CHANNEL), null);
  assert.equal(channelPostItem(null, CHANNEL), null);
});

test('link-less channel posts merge by id: an edited post replaces its old text', () => {
  const a = channelPostItem(post('A', 'Treasuries post their worst month in four yeras', '2026-10-01T02:06:28Z'), CHANNEL);
  const edited = channelPostItem(post('A', 'Treasuries post their worst month in four years', '2026-10-01T02:06:28Z'), CHANNEL);
  const b = channelPostItem(post('B', 'Rocket Lab signs a 20-launch Electron deal', '2026-09-30T23:02:51Z'), CHANNEL);
  const merged = mergeHeadlines([a, b], [edited, b], NOW + 24 * 3600 * 1000);
  assert.deepEqual(merged.map((m) => m.key), ['wa:CAKTUSJXCK:A', 'wa:CAKTUSJXCK:B']);
  assert.equal(merged[0].title, 'Treasuries post their worst month in four years');
});

const NBSP = '\u00a0';
const OCT_2 = Date.parse('2026-10-02T15:00:00Z');

test('a headline stamp is the clock time and date in CT, not UTC', () => {
  assert.deepEqual(stampCT('2026-10-02T14:14:00Z', OCT_2), { time: `9:14${NBSP}AM`, date: 'Oct 2' }); // CDT, UTC-5
  assert.deepEqual(stampCT('2026-10-02T04:30:00Z', OCT_2), { time: `11:30${NBSP}PM`, date: 'Oct 1' }); // still Oct 1 in Chicago
  assert.deepEqual(stampCT('Fri, 02 Oct 2026 17:05:09 GMT', OCT_2), { time: `12:05${NBSP}PM`, date: 'Oct 2' });
});

test('the stamp follows the CST/CDT switch', () => {
  assert.deepEqual(stampCT('2026-12-01T15:05:00Z', OCT_2), { time: `9:05${NBSP}AM`, date: 'Dec 1' }); // CST, UTC-6
});

test('a stamp from another year carries the year; an unreadable date has none', () => {
  assert.deepEqual(stampCT('2025-12-31T18:00:00Z', OCT_2), { time: `12:00${NBSP}PM`, date: "Dec 31 '25" });
  assert.equal(stampCT('not a date', OCT_2), null);
  assert.equal(stampCT('', OCT_2), null);
});
