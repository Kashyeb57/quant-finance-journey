/**
 * Build-time content counts for the homepage stat rail.
 *
 * The rail used to show hand-typed numbers ("914 Symbols", "20 Flows") that
 * were actually code-index statistics for this repo — meaningless to visitors.
 * These are counted from the content at build time, so they stay true as notes
 * and labs are added. Read on the page with useGlobalData()['content-stats'].
 *
 *   notes — doc pages that are not a <ComingSoon> placeholder
 *   labs  — distinct interactive components (Interactive/ + CalcLab/) that at
 *           least one doc actually embeds, minus the ones that aren't labs
 */
const fs = require('fs');
const path = require('path');

// Embedded components that are not interactive labs.
const NOT_LABS = new Set(['ComingSoon', 'Quiz', 'Flashcards', 'HandPlot', 'PySandbox', 'Notebook']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function countContent(siteDir) {
  const docs = walk(path.join(siteDir, 'docs')).map((f) => fs.readFileSync(f, 'utf8'));
  const notes = docs.filter((src) => !/<ComingSoon\b/.test(src)).length;

  const componentNames = ['src/components/Interactive', 'src/components/CalcLab']
    .map((d) => path.join(siteDir, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d))
    .filter((f) => f.endsWith('.jsx'))
    .map((f) => f.replace(/\.jsx$/, ''))
    .filter((name) => !NOT_LABS.has(name));

  const labs = componentNames.filter((name) =>
    docs.some((src) => new RegExp('<' + name + '(?![A-Za-z0-9_])').test(src)),
  ).length;

  return { notes, labs };
}

function contentStatsPlugin(context) {
  return {
    name: 'content-stats',
    async loadContent() {
      return countContent(context.siteDir);
    },
    async contentLoaded({ content, actions }) {
      actions.setGlobalData(content);
    },
  };
}

module.exports = contentStatsPlugin;
module.exports.countContent = countContent;
