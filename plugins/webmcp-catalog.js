/**
 * Build-time catalog for the WebMCP tools (src/lib/webmcp/): one public JSON file
 * at /webmcp/index.json with metadata only, never note bodies.
 *
 *   notes    — published docs: title, url, section, description, h2 headings.
 *              Left out: <ComingSoon> placeholders (same test as content-stats),
 *              drafts, unlisted docs, and anything under /admin.
 *   projects — from the PROJECTS array in src/components/Projects/index.jsx
 *   events   — from the EVENTS array in src/pages/events/index.js
 *
 * Everything in it is public: it only repeats what the site already shows.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 3).trimEnd()}...` : t;
};

// Reads a plain data array (`const NAME = [ ... ];`) out of a page source file
// without bundling React. Fails the build loudly if the array moved or stopped
// being plain data, rather than shipping a stale or empty catalog.
function readArrayLiteral(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf(`const ${name} = [`);
  if (start < 0) throw new Error(`webmcp-catalog: "const ${name} = [" not found in ${file}`);
  const end = src.indexOf('\n];', start);
  if (end < 0) throw new Error(`webmcp-catalog: end of ${name} not found in ${file}`);
  const literal = src.slice(src.indexOf('[', start), end + 2);
  // JSON round trip: plain data in this realm, not objects from the vm sandbox.
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 })));
}

// "Probability_Theory" -> "Probability Theory"
const label = (seg) => decodeURIComponent(seg).replace(/_/g, ' ');

function plainHeading(line) {
  return line
    .replace(/^##\s+/, '')
    .replace(/\{#[^}]*\}\s*$/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_$\\]/g, '')
    .trim();
}

function isPublished(doc, src) {
  const fm = doc.frontMatter || {};
  if (doc.draft || fm.draft || doc.unlisted || fm.unlisted) return false;
  if (/<ComingSoon\b/.test(src)) return false;
  if (!doc.permalink.startsWith('/docs/') || /(^|\/)admin(\/|$)/i.test(doc.permalink)) return false;
  return true;
}

function buildNotes(siteDir, docs) {
  const notes = [];
  // Source paths keep the number prefixes (01-, 02-...) that set sidebar order.
  const ordered = [...docs].sort((a, b) => String(a.source).localeCompare(String(b.source), 'en', { numeric: true }));
  for (const doc of ordered) {
    const file = path.join(siteDir, String(doc.source).replace(/^@site[\\/]/, ''));
    let src = '';
    try { src = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
    if (!isPublished(doc, src)) continue;
    // Section and path come from the folders (docs/Finance/02-Intro/...), not the
    // permalink, because a custom slug can lift a note out of its folder's URL.
    const parts = String(doc.source).replace(/^@site[\\/]/, '').split(/[\\/]/).slice(0, -1)
      .map((seg) => seg.replace(/^\d+-/, '')); // ['docs', 'Finance', 'Intro']
    if (parts.length < 2) continue;
    const body = src.replace(/^---[\s\S]*?\n---/, '').replace(/```[\s\S]*?```/g, '');
    const headings = body
      .split('\n')
      .filter((l) => /^##\s+\S/.test(l))
      .map(plainHeading)
      .filter(Boolean)
      .slice(0, 8)
      .map((h) => clip(h, 80));
    notes.push({
      title: clip(doc.title, 120),
      url: doc.permalink,
      section: label(parts[1]),
      path: parts.slice(1).map(label).join(' / '),
      description: clip(doc.description, 220),
      headings,
    });
  }
  return notes;
}

function buildProjects(siteDir) {
  const list = readArrayLiteral(path.join(siteDir, 'src/components/Projects/index.jsx'), 'PROJECTS');
  return list.map((p) => ({
    title: clip(p.title, 120),
    status: p.status || null,
    summary: clip(Array.isArray(p.overview) ? p.overview[0] : p.overview, 300),
    tags: Array.isArray(p.tags) ? p.tags.slice(0, 12) : [],
    links: Array.isArray(p.links)
      ? p.links.filter((l) => l && /^https?:\/\//.test(l.url)).map((l) => ({ label: clip(l.label, 60), url: l.url }))
      : [],
  }));
}

function buildEvents(siteDir) {
  const list = readArrayLiteral(path.join(siteDir, 'src/pages/events/index.js'), 'EVENTS');
  return list.map((e) => ({
    slug: e.slug,
    title: clip(e.title, 120),
    date: e.date || null,
    tag: e.tag || null,
    summary: clip(e.blurb, 280),
    url: `/events/${e.slug}`,
  }));
}

function buildCatalog(siteDir, docs, site) {
  return {
    version: 1,
    site: String(site || '').replace(/\/$/, ''),
    builtAt: new Date().toISOString(),
    notes: buildNotes(siteDir, docs),
    projects: buildProjects(siteDir),
    events: buildEvents(siteDir),
  };
}

function webmcpCatalogPlugin(context) {
  let docs = [];
  return {
    name: 'webmcp-catalog',
    async allContentLoaded({ allContent }) {
      const docsPlugin = allContent['docusaurus-plugin-content-docs'];
      const version = docsPlugin && docsPlugin.default && docsPlugin.default.loadedVersions && docsPlugin.default.loadedVersions[0];
      docs = version ? version.docs : [];
    },
    async postBuild({ outDir }) {
      const catalog = buildCatalog(context.siteDir, docs, context.siteConfig.url);
      const dir = path.join(outDir, 'webmcp');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(catalog));
    },
  };
}

module.exports = webmcpCatalogPlugin;
module.exports.buildCatalog = buildCatalog;
module.exports.readArrayLiteral = readArrayLiteral;
module.exports.isPublished = isPublished;
