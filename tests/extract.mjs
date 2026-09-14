// Pulls plain functions out of a site source file so Node can test them without
// a bundler (the files also import React, CSS modules or @site aliases). The
// slice runs from `start` up to `end`; if either marker has moved, the test fails
// with a message saying which one, rather than testing stale code.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function extract(file, start, end, names) {
  const src = readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf(start);
  if (a < 0) throw new Error(`${file}: start marker not found: ${start}`);
  const b = src.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`${file}: end marker not found: ${end}`);
  const body = src.slice(a, b).replace(/^export /gm, '');
  return new Function(`${body}\nreturn { ${names.join(', ')} };`)();
}

export const root = ROOT;
