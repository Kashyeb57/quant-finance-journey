// Notebook export/import: "# %%" scripts and .ipynb files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './extract.mjs';

const { cellsToScript, scriptToSources, notebookToSources } = extract(
  'src/components/Interactive/Notebook.jsx',
  "const CELL_MARK = '# %%';",
  '/**',
  ['cellsToScript', 'scriptToSources', 'notebookToSources'],
);

const cells = [
  { source: 'import numpy as np\nx = np.arange(3)\n\n' },
  { source: 'def f(a):\n    return a * 2\n\nprint(f(21))' },
  { source: '# a comment line\ny = 1' },
];
const script = cellsToScript(cells);
const back = scriptToSources(script);

test('export writes one # %% marker per cell', () => {
  assert.equal(script.split('\n').filter((l) => l === '# %%').length, 3);
});

test('export then import keeps every cell (trailing blank lines trimmed)', () => {
  assert.deepEqual(back, cells.map((c) => c.source.replace(/\s+$/, '')));
});

test('blank lines inside a cell and ordinary comments survive', () => {
  assert.equal(back[1], 'def f(a):\n    return a * 2\n\nprint(f(21))');
  assert.ok(back[2].startsWith('# a comment line'));
});

test('Windows line endings import the same', () => {
  assert.deepEqual(scriptToSources(script.replace(/\n/g, '\r\n')), back);
});

test('plain scripts, leading text and titled markers', () => {
  assert.deepEqual(scriptToSources('a = 1\nprint(a)\n'), ['a = 1\nprint(a)']);
  assert.deepEqual(scriptToSources('import os\n# %%\nprint(1)\n'), ['import os', 'print(1)']);
  assert.deepEqual(scriptToSources('# %% Setup\nx = 1\n# %% Plot\ny = 2\n'), ['x = 1', 'y = 2']);
});

test('.ipynb imports only non-empty code cells', () => {
  const nb = JSON.stringify({ nbformat: 4, cells: [
    { cell_type: 'markdown', source: ['# Title\n'] },
    { cell_type: 'code', source: ['import pandas as pd\n', 'df = pd.DataFrame()\n'] },
    { cell_type: 'code', source: 'print("single string source")' },
    { cell_type: 'code', source: [] },
  ] });
  assert.deepEqual(notebookToSources(nb), ['import pandas as pd\ndf = pd.DataFrame()', 'print("single string source")']);
});

test('files that are not notebooks are rejected with a message', () => {
  assert.throws(() => notebookToSources('{"not": "a notebook"}'), /not a Jupyter notebook/);
  assert.throws(() => notebookToSources('{broken'));
});
