// The Terminal board's layout rules: how tiles move between and within rows,
// and how a saved layout from an older version of the page is cleaned up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './extract.mjs';

const { moveTile, sanitize, DEFAULT_ROWS, withLive, withoutLive, moveShown } = extract(
  'src/components/Terminal/useBoardLayout.js',
  "const KEY = 'terminal.board.v1';",
  'export default function useBoardLayout',
  ['moveTile', 'sanitize', 'DEFAULT_ROWS', 'withLive', 'withoutLive', 'moveShown'],
);

const ROWS = [['chart'], ['chain', 'moves'], ['surface', 'depth'], ['portfolio']];

test('left and right swap neighbours in a row, and stop at the ends', () => {
  assert.deepEqual(moveTile(ROWS, 'moves', 'left')[1], ['moves', 'chain']);
  assert.deepEqual(moveTile(ROWS, 'chain', 'right')[1], ['moves', 'chain']);
  assert.equal(moveTile(ROWS, 'chain', 'left'), ROWS, 'already leftmost: unchanged');
});

test('down moves a tile into the next row of tiles', () => {
  const r = moveTile(ROWS, 'moves', 'down');
  assert.deepEqual(r, [['chart'], ['chain'], ['surface', 'depth', 'moves'], ['portfolio']]);
});

test('next to a full row a tile starts a row of its own', () => {
  const r = moveTile(ROWS, 'chain', 'up');
  assert.deepEqual(r, [['chart'], ['chain'], ['moves'], ['surface', 'depth'], ['portfolio']]);
});

test('a tile alone in its row joins the neighbouring row, or swaps past a full row', () => {
  const alone = [['chart'], ['chain'], ['surface', 'depth'], ['portfolio']];
  assert.deepEqual(moveTile(alone, 'chain', 'down'), [['chart'], ['surface', 'depth', 'chain'], ['portfolio']]);
  assert.deepEqual(moveTile(alone, 'chain', 'up'), [['chain'], ['chart'], ['surface', 'depth'], ['portfolio']]);
});

test('full rows move as a whole and the chart can go below the tiles', () => {
  const r = moveTile(ROWS, 'chart', 'down');
  assert.deepEqual(r.map((x) => x[0]), ['chain', 'chart', 'surface', 'portfolio']);
  assert.equal(moveTile(ROWS, 'chart', 'up'), ROWS, 'already on top: unchanged');
  assert.equal(moveTile(ROWS, 'portfolio', 'down'), ROWS, 'already last: unchanged');
});

test('the live tile is never added for visitors and appears under the chart for the owner', () => {
  assert.equal(DEFAULT_ROWS.flat().includes('live'), false);
  assert.equal(sanitize([['chart']]).flat().includes('live'), false, 'an old saved layout does not gain it');
  assert.deepEqual(withLive(ROWS).slice(0, 2), [['chart'], ['live']]);
  const moved = [['chart'], ['chain', 'live'], ['portfolio']];
  assert.deepEqual(withLive(moved), moved, 'a moved tile stays where it was put');
  assert.deepEqual(sanitize(moved).flat().filter((id) => id === 'live'), ['live'], 'and a saved position survives');
  assert.deepEqual(withoutLive([['chart'], ['live'], ['chain']]), [['chart'], ['chain']]);
});

test('while the live tile is hidden, arrows act on what is shown and its place is kept', () => {
  const saved = [['chart'], ['live'], ['chain'], ['surface', 'depth'], ['portfolio']];
  const r = moveShown(saved, 'chain', 'up', false);
  assert.deepEqual(withoutLive(r), [['chain'], ['chart'], ['surface', 'depth'], ['portfolio']], 'chain really moved past the chart');
  assert.equal(r[1][0], 'live');
  assert.deepEqual(moveShown(ROWS, 'chain', 'up', false), moveTile(ROWS, 'chain', 'up'), 'a visitor is unaffected');
  assert.deepEqual(moveShown(ROWS, 'live', 'down', true)[1], ['chain', 'moves', 'live'], 'shown: it moves like any tile');
});

test('a saved layout drops unknown tiles and duplicates and adds new tiles at the end', () => {
  const clean = sanitize([['chart', 'chain'], ['gone', 'moves', 'chain'], 'junk']);
  assert.deepEqual(clean.slice(0, 3), [['chart'], ['chain'], ['moves']], 'chart split onto its own row');
  const all = clean.flat().sort();
  assert.deepEqual(all, DEFAULT_ROWS.flat().sort(), 'every tile exactly once');
  assert.equal(sanitize('nope'), null);
});
