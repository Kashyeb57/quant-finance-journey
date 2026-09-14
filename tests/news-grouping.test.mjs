// Terminal news: repeated coverage of one story is grouped, different stories are not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './extract.mjs';

const { groupHeadlines } = extract(
  'src/components/Terminal/News.jsx',
  'const GROUP_STOP',
  'function mergeHeadlines',
  ['groupHeadlines'],
);

const now = Date.now();
const at = (minsAgo) => new Date(now - minsAgo * 60000).toUTCString();
const items = [
  { title: 'Nvidia shares jump after record data center revenue beats estimates', source: 'CNBC', pubDate: at(5) },
  { title: 'Nvidia Shares Jump After Record Data-Center Revenue Beats Estimates', source: 'MARKETWATCH', pubDate: at(12) },
  { title: "Nvidia's record data center revenue beats estimates; shares jump", source: 'INVESTING', pubDate: at(20) },
  { title: 'Fed holds rates steady as inflation cools', source: 'CNBC', pubDate: at(30) },
  { title: 'Fed cuts rates by a quarter point', source: 'MARKETWATCH', pubDate: at(35) },
  { title: 'Oil prices rise on Middle East supply worries', source: 'OILPRICE', pubDate: at(40) },
  { title: 'Oil prices rise on Middle East supply worries', source: 'OILPRICE', pubDate: at(41) },
  { title: 'Bitcoin slides below $60,000 as ETF outflows grow', source: 'COINDESK', pubDate: at(50) },
  { title: 'Nvidia shares jump after record data center revenue beats estimates', source: 'BBC BIZ', pubDate: at(60 * 48) },
  { title: 'Apple unveils new iPhone at September event', source: 'TECHCRUNCH', pubDate: at(70) },
  { title: 'Apple stock falls after iPhone event disappoints', source: 'CNBC', pubDate: at(75) },
];
const groups = groupHeadlines(items);
const nvidia = groups.find((g) => g.lead.title.startsWith('Nvidia shares jump') && g.lead.source !== 'BBC BIZ');

test('three outlets on the same story become one group, rewording included', () => {
  assert.ok(nvidia, 'Nvidia group missing');
  assert.deepEqual(nvidia.dupes.map((d) => d.source).sort(), ['INVESTING', 'MARKETWATCH']);
});

test('"Fed holds rates" and "Fed cuts rates" stay separate', () => {
  assert.equal(groups.filter((g) => g.lead.title.startsWith('Fed')).length, 2);
});

test('one source repeating itself is not grouped', () => {
  assert.equal(groups.filter((g) => g.lead.source === 'OILPRICE').length, 2);
});

test('the same headline two days later is a separate story', () => {
  assert.ok(groups.some((g) => g.lead.source === 'BBC BIZ' && g.dupes.length === 0));
});

test('related but different stories stay separate', () => {
  assert.equal(groups.filter((g) => /Apple|iPhone/.test(g.lead.title)).length, 2);
});

test('unrelated stories are untouched', () => {
  assert.ok(groups.some((g) => g.lead.source === 'COINDESK' && g.dupes.length === 0));
});
