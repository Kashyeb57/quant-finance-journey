// Post-build guardrails for the site's hard rules. Runs in CI after
// `npm run build` and fails the deploy if any rule is broken:
//
//   1. No Alpaca credentials in the repo or the published site. The Alpaca
//      request headers only belong in the Worker, so seeing them in the bundle
//      means data calls moved client-side.
//   2. Private working notes are never committed or published.
//   3. Library books are read in the browser only: no download attributes and
//      no links straight to a /library/ PDF.
//
// Usage: node tests/check-build.mjs [buildDir]   (default: build)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { root } from './extract.mjs';

const buildDir = path.resolve(root, process.argv[2] || 'build');
const problems = [];
const fail = (rule, where, detail) => problems.push(`${rule}: ${where}${detail ? ` (${detail})` : ''}`);

const PRIVATE = [/(^|\/)CLAUDE\.md$/i, /(^|\/)AGENTS\.md$/i, /(^|\/)HANDOFF[^/]*\.md$/i, /(^|\/)DESIGN_HANDOFF\.md$/i,
  /(^|\/)MS444_STATS_GAP_REPORT\.md$/i, /(^|\/)\.handoff\//, /(^|\/)\.dev\.vars$/];
// Alpaca key ids are 20 characters, PK (paper) or AK (live) then 18 capitals/digits.
const KEY_ID = /(?<![A-Za-z0-9+/])[PA]K[A-Z0-9]{18}(?![A-Za-z0-9+/])/;
const SERVER_ONLY = /APCA-API-(SECRET-KEY|KEY-ID)/;
const TEXT = /\.(js|mjs|cjs|jsx|ts|tsx|json|html|htm|css|md|mdx|txt|toml|yml|yaml|xml|map)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p, base) => path.relative(base, p).split(path.sep).join('/');

// ── Repository (tracked files) ──────────────────────────────────────────────
let tracked = [];
try {
  tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
} catch (e) {
  fail('setup', 'git ls-files failed', e.message);
}
for (const f of tracked) {
  if (PRIVATE.some((re) => re.test(f))) fail('private notes committed', f);
  if (!TEXT.test(f) || f.startsWith('tests/')) continue;
  const full = path.join(root, f);
  if (!existsSync(full) || statSync(full).size > 5 * 1024 * 1024) continue;
  const text = readFileSync(full, 'utf8');
  const m = text.match(KEY_ID);
  if (m) fail('possible Alpaca key id committed', f, `${m[0].slice(0, 4)}…`);
  if (/(^|\/)wrangler\.toml$/.test(f) && /^\s*ALPACA_[A-Z_]*\s*=/m.test(text)) fail('Alpaca value in wrangler.toml (use wrangler secret put)', f);
}

// ── Book reader sources ─────────────────────────────────────────────────────
const READER_SOURCES = ['src/pages/books.js', 'src/pages/read.js', 'src/components/PdfReader', 'src/components/BookShelf'];
for (const entry of READER_SOURCES) {
  const full = path.join(root, entry);
  if (!existsSync(full)) continue;
  const files = statSync(full).isDirectory() ? walk(full) : [full];
  for (const f of files.filter((p) => /\.(js|jsx)$/.test(p))) {
    const text = readFileSync(f, 'utf8');
    if (/<a\b[^>]*\sdownload\b/.test(text)) fail('download link on a library book', rel(f, root));
    if (/\.download\s*=/.test(text)) fail('scripted download on a library book', rel(f, root));
  }
}

// ── Published site ──────────────────────────────────────────────────────────
if (!existsSync(buildDir)) {
  fail('setup', `build directory not found: ${buildDir}`);
} else {
  const files = walk(buildDir);
  let htmlCount = 0;
  for (const f of files) {
    const r = rel(f, buildDir);
    if (PRIVATE.some((re) => re.test(r))) fail('private notes published', r);
    if (!/\.(js|html|json|txt|map)$/i.test(f) || statSync(f).size > 20 * 1024 * 1024) continue;
    const text = readFileSync(f, 'utf8');
    if (SERVER_ONLY.test(text)) fail('Alpaca auth header in the published bundle', r);
    const m = text.match(KEY_ID);
    if (m) fail('possible Alpaca key id in the published bundle', r, `${m[0].slice(0, 4)}…`);
    if (/\.html$/i.test(f)) {
      htmlCount += 1;
      if (/<a\b[^>]*\sdownload\b/i.test(text)) fail('download link in published page', r);
      const raw = text.match(/<a\b[^>]*\shref="[^"]*\/library\/[^"]*\.pdf[^"]*"/i);
      if (raw) fail('link straight to a library PDF', r, raw[0].slice(0, 80));
    }
  }
  if (htmlCount < 20) fail('setup', `only ${htmlCount} HTML pages in ${buildDir}; is this a real build?`);
  console.log(`checked ${tracked.length} tracked files and ${files.length} built files (${htmlCount} pages)`);
}

if (problems.length) {
  console.error(`\n${problems.length} guardrail problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('guardrails ok');
