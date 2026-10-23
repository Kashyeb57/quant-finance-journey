// The Terminal board's layout rules: how tiles move between and within rows,
// and how a saved layout from an older version of the page is cleaned up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './extract.mjs';

const { moveTile, sanitize, DEFAULT_ROWS } = extract(
  'src/components/Terminal/useBoardLayout.js',
  "const KEY = 'terminal.board.v1';",
  'export default function useBoardLayout',
  ['moveTile', 'sanitize', 'DEFAULT_ROWS'],
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

test('a saved layout drops unknown tiles and duplicates and adds new tiles at the end', () => {
  const clean = sanitize([['chart', 'chain'], ['gone', 'moves', 'chain'], 'junk']);
  assert.deepEqual(clean.slice(0, 3), [['chart'], ['chain'], ['moves']], 'chart split onto its own row');
  const all = clean.flat().sort();
  assert.deepEqual(all, DEFAULT_ROWS.flat().sort(), 'every tile exactly once');
  assert.equal(sanitize('nope'), null);
});
