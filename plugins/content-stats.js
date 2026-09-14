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

/**
 * Readiness of every doc, from the docs plugin's own list (so permalinks are the
 * real routes, slugs and number prefixes included):
 *   drafts   — permalinks of docs that are still a <ComingSoon> placeholder
 *   sections — for each ancestor route that is not itself a doc (a category):
 *              [notes, drafts] counted over the docs beneath it
 * Kept compact on purpose: global data ships with every page.
 */
function docReadiness(siteDir, docs) {
  const drafts = [];
  const sections = {};
  const permalinks = new Set(docs.map((d) => d.permalink));
  for (const doc of docs) {
    const file = path.join(siteDir, String(doc.source).replace(/^@site[\\/]/, ''));
    let isDraft = false;
    try { isDraft = /<ComingSoon\b/.test(fs.readFileSync(file, 'utf8')); } catch (e) { /* unreadable: treat as published */ }
    if (isDraft) drafts.push(doc.permalink);
    const parts = doc.permalink.split('/').filter(Boolean);
    for (let i = 2; i < parts.length; i++) {
      const prefix = '/' + parts.slice(0, i).join('/');
      if (permalinks.has(prefix)) continue;
      const s = sections[prefix] || (sections[prefix] = [0, 0]);
      if (isDraft) s[1] += 1;
      else s[0] += 1;
    }
  }
  return { drafts: drafts.sort(), sections };
}

function contentStatsPlugin(context) {
  return {
    name: 'content-stats',
    async loadContent() {
      return countContent(context.siteDir);
    },
    // notes / labs, exactly as before — independent of the readiness step below.
    async contentLoaded({ content, actions }) {
      actions.setGlobalData(content);
    },
    // Docusaurus merges this plugin's global data from both hooks (Object.assign),
    // so readiness adds drafts/sections without touching notes/labs.
    async allContentLoaded({ allContent, actions }) {
      const docsPlugin = allContent['docusaurus-plugin-content-docs'];
      const version = docsPlugin && docsPlugin.default && docsPlugin.default.loadedVersions && docsPlugin.default.loadedVersions[0];
      if (!version) return;
      actions.setGlobalData(docReadiness(context.siteDir, version.docs));
    },
  };
}

module.exports = contentStatsPlugin;
module.exports.countContent = countContent;
module.exports.docReadiness = docReadiness;
