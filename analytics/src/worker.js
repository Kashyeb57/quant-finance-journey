/**
 * Owner-only visitor analytics for joyebkashyeb.com.np
 * ----------------------------------------------------
 * Runs as a Cloudflare Worker on the route  joyebkashyeb.com.np/_a/*
 * (everything else on the domain passes straight through to GitHub Pages).
 *
 *   POST /_a/collect      → records one visit (called by the site beacon)
 *   GET  /_a/collect      → same, pixel/no-JS fallback (returns 1x1 gif)
 *   GET  /_a/logs?token=  → private HTML dashboard (owner only)
 *   GET  /_a/logs.json?token=  → same data as JSON
 *
 * The dashboard is protected by a secret token stored as a Worker secret
 * (VIEW_TOKEN). Only someone who knows the token can read the log.
 *
 * Data is stored in a Cloudflare D1 database bound as `env.DB` (see schema.sql).
 */

const COLLECT_PATH = '/_a/collect';
const LOGS_PATH = '/_a/logs';
const LOGS_JSON_PATH = '/_a/logs.json';

// 1x1 transparent GIF for the no-JS pixel fallback.
const PIXEL = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === COLLECT_PATH) {
      return handleCollect(request, env, ctx, url);
    }
    if (path === LOGS_PATH) {
      return handleDashboard(request, env, url);
    }
    if (path === LOGS_JSON_PATH) {
      return handleJson(request, env, url);
    }

    // Not one of ours — shouldn't normally happen given the route, but be safe.
    return new Response('Not found', { status: 404 });
  },
};

/* ----------------------------- collection ------------------------------ */

async function handleCollect(request, env, ctx, url) {
  // Pull whatever the beacon sent (path + referrer + screen size).
  let body = {};
  if (request.method === 'POST') {
    try {
      body = JSON.parse(await request.text());
    } catch (_) {
      body = {};
    }
  } else {
    // GET pixel fallback: read from query string.
    body = {
      p: url.searchParams.get('p') || '',
      r: url.searchParams.get('r') || '',
      w: url.searchParams.get('w') || '',
      h: url.searchParams.get('h') || '',
    };
  }

  // Duration ping: when a visitor leaves a page, the beacon reports how long
  // that view lasted. Update the existing row rather than inserting a new one.
  if (body.t === 'end' && body.v) {
    const secs = Math.max(0, Math.min(parseInt(body.s, 10) || 0, 86400));
    ctx.waitUntil(
      env.DB.prepare(`UPDATE hits SET duration = MAX(COALESCE(duration,0), ?) WHERE view_id = ?`)
        .bind(secs, String(body.v).slice(0, 40))
        .run()
        .catch(() => {})
    );
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  const cf = request.cf || {};
  const ua = request.headers.get('User-Agent') || '';
  const parsed = parseUA(ua);

  const row = {
    ts: new Date().toISOString(),
    ip: request.headers.get('CF-Connecting-IP') || '',
    country: cf.country || '',
    city: cf.city || '',
    region: cf.region || '',
    timezone: cf.timezone || '',
    asn: cf.asOrganization || (cf.asn ? 'AS' + cf.asn : ''),
    path: String(body.p || url.searchParams.get('p') || '').slice(0, 512),
    referer: String(body.r || request.headers.get('Referer') || '').slice(0, 512),
    ua: ua.slice(0, 512),
    device: parsed.device,
    browser: parsed.browser,
    os: parsed.os,
    screen: [body.w, body.h].filter(Boolean).join('x').slice(0, 16),
    lang: (request.headers.get('Accept-Language') || '').split(',')[0].trim().slice(0, 35),
    view_id: String(body.v || '').slice(0, 40),
  };

  // Write in the background so the beacon returns instantly.
  const write = env.DB.prepare(
    `INSERT INTO hits
      (ts, ip, country, city, region, timezone, asn, path, referer, ua, device, browser, os, screen, lang, view_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      row.ts, row.ip, row.country, row.city, row.region, row.timezone, row.asn,
      row.path, row.referer, row.ua, row.device, row.browser, row.os, row.screen,
      row.lang, row.view_id
    )
    .run()
    .catch(() => {});
  ctx.waitUntil(write);

  if (request.method === 'GET') {
    return new Response(PIXEL, {
      headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

/* ------------------------------ auth ----------------------------------- */

function authorized(env, url) {
  const expected = env.VIEW_TOKEN || '';
  const got = url.searchParams.get('token') || '';
  if (!expected) return false;
  // length-safe constant-ish comparison
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function denied() {
  return new Response('Forbidden — valid ?token= required.', {
    status: 403,
    headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
  });
}

/* --------------------------- JSON export ------------------------------- */

async function handleJson(request, env, url) {
  if (!authorized(env, url)) return denied();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 5000);
  const { results } = await env.DB.prepare(
    `SELECT ts, ip, country, city, region, timezone, asn, path, referer, device, browser, os, screen, lang, duration, ua
       FROM hits ORDER BY id DESC LIMIT ?`
  )
    .bind(limit)
    .all();
  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/* --------------------------- dashboard --------------------------------- */

async function handleDashboard(request, env, url) {
  if (!authorized(env, url)) return denied();
  try {
    return await renderDashboardResponse(request, env, url);
  } catch (e) {
    // Fail readable instead of Cloudflare's generic 1101.
    const msg = esc(String((e && e.message) || e));
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="background:#14161a;color:#e6e8eb;font-family:system-ui,sans-serif;padding:40px;max-width:760px;margin:auto">
        <h2>Dashboard error</h2>
        <p>A query failed while building the log. If you just added a feature, the database migration may not have run yet. From the <code>analytics</code> folder:</p>
        <pre style="background:#1c1f26;padding:12px;border-radius:8px;white-space:pre-wrap">wrangler d1 execute site_analytics --file=./migrations/001_lang_duration.sql --remote</pre>
        <p style="color:#8b929c">Details:</p>
        <pre style="background:#1c1f26;padding:12px;border-radius:8px;white-space:pre-wrap;color:#e06c75">${msg}</pre>
      </body>`,
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }
}

async function renderDashboardResponse(request, env, url) {
  const token = url.searchParams.get('token');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 2000);
  const ownerIp = request.headers.get('CF-Connecting-IP') || '';

  // Optional filters: ?hide=<ip>[,<ip>]  and  ?humans=1  (exclude bots)
  const f = buildFilter(url);
  const where = f.clauses.length ? 'WHERE ' + f.clauses.join(' AND ') : '';
  const andTail = f.clauses.length ? ' AND ' + f.clauses.join(' AND ') : '';
  const run = (sql, p = []) => {
    const st = env.DB.prepare(sql);
    return (p.length ? st.bind(...p) : st).all();
  };

  const langWhere = f.clauses.length
    ? `WHERE ${f.clauses.join(' AND ')} AND lang IS NOT NULL AND lang != ''`
    : `WHERE lang IS NOT NULL AND lang != ''`;

  const [recent, totals, last15, series, topPages, topCountries, topDevices, topBrowsers, refs, visitors, languages] =
    await Promise.all([
      run(`SELECT ts, ip, country, city, region, asn, path, referer, device, browser, os, ua, duration
             FROM hits ${where} ORDER BY id DESC LIMIT ?`, [...f.params, limit]),
      run(`SELECT COUNT(*) AS visits, COUNT(DISTINCT ip) AS uniques,
                  SUM(CASE WHEN device='Bot' THEN 1 ELSE 0 END) AS bots,
                  AVG(CASE WHEN duration > 0 THEN duration END) AS avgdur
             FROM hits ${where}`, f.params),
      run(`SELECT COUNT(*) AS n FROM hits WHERE ts >= datetime('now','-15 minutes')${andTail}`, f.params),
      run(`SELECT ts FROM hits WHERE ts >= datetime('now','-14 days')${andTail}`, f.params),
      run(`SELECT path, COUNT(*) AS n FROM hits ${where} GROUP BY path ORDER BY n DESC LIMIT 10`, f.params),
      run(`SELECT country, COUNT(*) AS n FROM hits ${where} GROUP BY country ORDER BY n DESC LIMIT 12`, f.params),
      run(`SELECT device, COUNT(*) AS n FROM hits ${where} GROUP BY device ORDER BY n DESC LIMIT 10`, f.params),
      run(`SELECT browser, COUNT(*) AS n FROM hits ${where} GROUP BY browser ORDER BY n DESC LIMIT 10`, f.params),
      run(`SELECT referer, COUNT(*) AS n FROM hits ${where} GROUP BY referer ORDER BY n DESC LIMIT 100`, f.params),
      run(`SELECT ip, COUNT(*) AS n, MAX(ts) AS last_ts, country, city, region
             FROM hits ${where} GROUP BY ip ORDER BY n DESC LIMIT 15`, f.params),
      run(`SELECT lang, COUNT(*) AS n FROM hits ${langWhere} GROUP BY lang ORDER BY n DESC LIMIT 10`, f.params),
    ]);

  const t = totals.results[0] || { visits: 0, uniques: 0, bots: 0, avgdur: 0 };
  const html = renderDashboard({
    token, ownerIp, hide: f.hide, humans: f.humans,
    visits: t.visits || 0,
    uniques: t.uniques || 0,
    bots: t.bots || 0,
    avgdur: t.avgdur || 0,
    last15: (last15.results[0] || {}).n || 0,
    series: series.results || [],
    recent: recent.results || [],
    topPages: topPages.results || [],
    topCountries: topCountries.results || [],
    topDevices: topDevices.results || [],
    topBrowsers: topBrowsers.results || [],
    refs: refs.results || [],
    visitors: visitors.results || [],
    languages: languages.results || [],
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

// Parse ?hide= / ?humans= into SQL clauses (values are bound, never concatenated).
function buildFilter(url) {
  const clauses = [];
  const params = [];
  const hide = (url.searchParams.get('hide') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (hide.length) {
    clauses.push(`ip NOT IN (${hide.map(() => '?').join(',')})`);
    params.push(...hide);
  }
  const humans = url.searchParams.get('humans') === '1';
  if (humans) clauses.push(`device != 'Bot'`);
  return { clauses, params, hide, humans };
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Format a stored UTC ISO timestamp in Central Time (Alabama), e.g.
// "2026-07-20 14:56:24 CDT". Storage stays UTC; this is display only.
function fmtCT(iso) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23', timeZoneName: 'short',
    }).formatToParts(new Date(iso));
    const g = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')} ${g('timeZoneName')}`;
  } catch (_) {
    return String(iso);
  }
}

function statList(rows, keyName) {
  if (!rows.length) return '<li class="muted">no data yet</li>';
  return rows
    .map((r) => `<li><span>${esc(r[keyName] || '—')}</span><b>${r.n}</b></li>`)
    .join('');
}

function pairList(rows) {
  if (!rows.length) return '<li class="muted">no data yet</li>';
  return rows.map((r) => `<li><span>${esc(r.name || '—')}</span><b>${r.n}</b></li>`).join('');
}

// Classify a referrer URL into a source bucket + clean hostname.
const SITE_HOST = 'joyebkashyeb.com.np';
function refInfo(ref) {
  if (!ref) return { host: '(direct)', cat: 'Direct' };
  let host;
  try { host = new URL(ref).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return { host: String(ref).slice(0, 40), cat: 'Other' }; }
  if (host === SITE_HOST || host.endsWith('.' + SITE_HOST)) return { host: '(internal)', cat: 'Internal' };
  const search = ['google.', 'bing.', 'duckduckgo.', 'yahoo.', 'yandex.', 'baidu.', 'ecosia.'];
  const social = ['t.co', 'twitter.', 'x.com', 'linkedin.', 'lnkd.in', 'facebook.', 'fb.com',
    'instagram.', 'reddit.', 'youtube.', 'youtu.be', 'github.', 'pinterest.', 'quora.',
    'medium.', 'substack.', 'ycombinator.'];
  if (search.some((s) => host.includes(s))) return { host, cat: 'Search' };
  if (social.some((s) => host.includes(s))) return { host, cat: 'Social' };
  return { host, cat: 'Other' };
}

// YYYY-MM-DD for an ISO timestamp, in Central time.
function ctDate(iso) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const g = (t) => (p.find((x) => x.type === t) || {}).value || '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function filterLink(token, obj) {
  const p = new URLSearchParams();
  p.set('token', token);
  if (obj.hide && obj.hide.length) p.set('hide', obj.hide.join(','));
  if (obj.humans) p.set('humans', '1');
  return `${LOGS_PATH}?${p.toString()}`;
}

// Human-friendly duration: 8s, 1m 12s, 3m.
function fmtDur(secs) {
  const s = parseInt(secs, 10);
  if (!s || s <= 0) return '—';
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function renderDashboard(d) {
  // visits over the last 14 days, bucketed by Central date
  const counts = {};
  for (const r of d.series) { const day = ctDate(r.ts); counts[day] = (counts[day] || 0) + 1; }
  const now = new Date();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = ctDate(new Date(now.getTime() - i * 86400000).toISOString());
    days.push({ key, n: counts[key] || 0 });
  }
  const maxN = Math.max(1, ...days.map((x) => x.n));
  const chart = days.map((x) => {
    const pct = x.n ? Math.max(Math.round((x.n / maxN) * 100), 8) : 0;
    return `<div class="bar" title="${x.key}: ${x.n} visit(s)">
      <div class="barTrack"><div class="barFill" style="height:${pct}%"></div></div>
      <div class="barLbl">${x.key.slice(5)}</div></div>`;
  }).join('');

  // traffic sources + top external referrers, derived from stored referrers
  const catTally = {}; const hostTally = {};
  for (const r of d.refs) {
    const info = refInfo(r.referer);
    catTally[info.cat] = (catTally[info.cat] || 0) + r.n;
    if (info.cat !== 'Direct' && info.cat !== 'Internal') {
      hostTally[info.host] = (hostTally[info.host] || 0) + r.n;
    }
  }
  const catRows = Object.entries(catTally).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  const hostRows = Object.entries(hostTally).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => ({ name, n }));

  // top visitors by IP
  const visitorRows = d.visitors.map((v) => {
    const shortLoc = [v.city, v.country].filter(Boolean).join(', ');
    const fullLoc = [v.city, v.region, v.country].filter(Boolean).join(', ');
    const you = d.ownerIp && v.ip === d.ownerIp ? ' <span class="you">you</span>' : '';
    return `<tr>
      <td class="mono small">${esc(v.ip)}${you}</td>
      <td><b class="accent">${v.n}</b></td>
      <td class="small" title="${esc(fullLoc)}">${esc(shortLoc || '—')}</td>
      <td class="mono small">${esc(fmtCT(v.last_ts))}</td></tr>`;
  }).join('');

  // recent visits
  const rows = d.recent.map((r) => {
    const shortLoc = [r.city, r.country].filter(Boolean).join(', ');
    const fullLoc = [r.city, r.region, r.country].filter(Boolean).join(', ');
    const src = refInfo(r.referer).host;
    return `<tr>
      <td class="mono small">${esc(fmtCT(r.ts))}</td>
      <td class="mono small">${esc(r.ip)}</td>
      <td class="small" title="${esc(fullLoc)}">${esc(shortLoc || '—')}</td>
      <td class="small">${esc(src)}</td>
      <td class="mono small trunc" title="${esc(r.path)}">${esc(r.path)}</td>
      <td class="mono small">${fmtDur(r.duration)}</td>
      <td class="small">${esc(r.device)}</td>
      <td class="small">${esc(r.browser)} · ${esc(r.os)}</td>
      <td class="mono small" title="${esc(r.ua)}">${esc((r.asn || '').slice(0, 22))}</td></tr>`;
  }).join('');

  // filter-bar links
  const hidingSelf = d.ownerIp && d.hide.includes(d.ownerIp);
  const selfLink = d.ownerIp
    ? (hidingSelf
        ? `<a href="${esc(filterLink(d.token, { hide: d.hide.filter((x) => x !== d.ownerIp), humans: d.humans }))}">Show my visits</a>`
        : `<a href="${esc(filterLink(d.token, { hide: [...d.hide, d.ownerIp], humans: d.humans }))}">Exclude my visits</a>`)
    : '';
  const humansLink = d.humans
    ? `<a href="${esc(filterLink(d.token, { hide: d.hide, humans: false }))}">Include bots</a>`
    : `<a href="${esc(filterLink(d.token, { hide: d.hide, humans: true }))}">Humans only</a>`;
  const allLink = `<a href="${esc(LOGS_PATH + '?token=' + encodeURIComponent(d.token))}">Show all</a>`;
  const activeNote = (d.hide.length || d.humans)
    ? `<span class="fnote">active: ${[d.hide.length ? `hiding ${d.hide.length} IP` : '', d.humans ? 'humans only' : ''].filter(Boolean).join(' · ')}</span>`
    : `<span class="fnote">showing everything</span>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Visitor log · joyebkashyeb.com.np</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #14161a; color: #e6e8eb;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 1200px; margin: 0 auto; padding: 28px 20px 80px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #8b929c; margin: 0 0 18px; }
  .fbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 0 0 22px; font-size: 13px; }
  .fbar a { text-decoration: none; background: #1c1f26; border: 1px solid #262b34; padding: 5px 11px; border-radius: 8px; }
  .fbar a:hover { border-color: #25c2a0; }
  .fnote { color: #6b727c; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); gap: 14px; margin-bottom: 22px; }
  .card { background: #1c1f26; border: 1px solid #262b34; border-radius: 12px; padding: 14px 16px; }
  .card .k { color: #8b929c; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .card .v { font-size: 26px; font-weight: 700; margin-top: 4px; }
  .accent { color: #25c2a0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 16px; margin-bottom: 26px; }
  .panel { background: #1c1f26; border: 1px solid #262b34; border-radius: 12px; padding: 14px 16px; }
  .panel.wide { margin-bottom: 24px; }
  .panel h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #8b929c; margin: 0 0 10px; }
  .panel ul { list-style: none; margin: 0; padding: 0; }
  .panel li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-bottom: 1px solid #23272f; }
  .panel li:last-child { border-bottom: 0; }
  .panel li b { color: #25c2a0; }
  .panel li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chart { display: flex; gap: 6px; align-items: flex-end; }
  .bar { flex: 1; text-align: center; }
  .barTrack { height: 92px; display: flex; align-items: flex-end; }
  .barFill { width: 58%; margin: 0 auto; background: #25c2a0; border-radius: 3px 3px 0 0; }
  .barLbl { font-size: 9px; color: #6b727c; margin-top: 6px; white-space: nowrap; }
  h2.sec { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #8b929c; margin: 26px 0 10px; }
  .muted { color: #6b727c; }
  .you { color: #14161a; background: #25c2a0; font-size: 10px; padding: 1px 5px; border-radius: 6px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; background: #1c1f26; border: 1px solid #262b34; border-radius: 12px; overflow: hidden; font-size: 12.5px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #23272f; vertical-align: middle; white-space: nowrap; }
  th { background: #191c22; color: #8b929c; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; position: sticky; top: 0; }
  tbody tr:nth-child(2n) td { background: #191b21; }
  tr:hover td { background: #22262e; }
  .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
  .small { font-size: 11.5px; }
  .nowrap { white-space: nowrap; }
  .trunc { max-width: 230px; overflow: hidden; text-overflow: ellipsis; }
  .tablewrap { overflow-x: auto; border-radius: 12px; }
  .foot { margin-top: 18px; color: #6b727c; font-size: 12px; }
  a { color: #25c2a0; }
</style></head>
<body><div class="wrap">
  <h1>Visitor log <span class="accent">·</span> joyebkashyeb.com.np</h1>
  <p class="sub">Private owner view. Auto-recorded on every page view. Times are Central (Alabama).</p>

  <div class="fbar">${selfLink}${humansLink}${allLink}${activeNote}</div>

  <div class="cards">
    <div class="card"><div class="k">Total visits</div><div class="v">${d.visits}</div></div>
    <div class="card"><div class="k">Unique IPs</div><div class="v accent">${d.uniques}</div></div>
    <div class="card"><div class="k">Human visits</div><div class="v">${Math.max(d.visits - d.bots, 0)}</div></div>
    <div class="card"><div class="k">Bot hits</div><div class="v">${d.bots}</div></div>
    <div class="card"><div class="k">Avg. time on page</div><div class="v">${fmtDur(Math.round(d.avgdur))}</div></div>
    <div class="card"><div class="k">Last 15 min</div><div class="v accent">${d.last15}</div><div class="k">live</div></div>
  </div>

  <div class="panel wide"><h2>Visits · last 14 days</h2><div class="chart">${chart}</div></div>

  <div class="grid">
    <div class="panel"><h2>Top pages</h2><ul>${statList(d.topPages, 'path')}</ul></div>
    <div class="panel"><h2>Traffic sources</h2><ul>${pairList(catRows)}</ul></div>
    <div class="panel"><h2>Top referrers</h2><ul>${pairList(hostRows)}</ul></div>
    <div class="panel"><h2>Countries</h2><ul>${statList(d.topCountries, 'country')}</ul></div>
    <div class="panel"><h2>Devices</h2><ul>${statList(d.topDevices, 'device')}</ul></div>
    <div class="panel"><h2>Browsers</h2><ul>${statList(d.topBrowsers, 'browser')}</ul></div>
    <div class="panel"><h2>Languages</h2><ul>${statList(d.languages, 'lang')}</ul></div>
  </div>

  <h2 class="sec">Top visitors (by IP)</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>IP</th><th>Visits</th><th>Location</th><th>Last seen (CT)</th></tr></thead>
    <tbody>${visitorRows || '<tr><td colspan="4" class="muted" style="padding:20px">none</td></tr>'}</tbody>
  </table></div>

  <h2 class="sec">Recent visits</h2>
  <div class="tablewrap"><table>
    <thead><tr>
      <th>Time (CT)</th><th>IP</th><th>Location</th><th>Source</th><th>Page</th><th>On page</th><th>Device</th><th>Browser · OS</th><th>Network (ASN)</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="muted" style="padding:20px">No visits recorded yet.</td></tr>'}</tbody>
  </table></div>

  <p class="foot">
    Raw JSON: <a href="${LOGS_JSON_PATH}?token=${esc(d.token)}&amp;limit=1000">${LOGS_JSON_PATH}?token=…</a>
    &nbsp;·&nbsp; Keep this URL private — anyone with the token can read the log.
  </p>
</div></body></html>`;
}

/* --------------------- tiny user-agent parser -------------------------- */

function parseUA(ua) {
  const u = ua.toLowerCase();
  let device = 'Desktop';
  if (/bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|headless/.test(u)) device = 'Bot';
  else if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(u)) device = 'Tablet';
  else if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(u)) device = 'Mobile';

  let browser = 'Other';
  if (/edg\//.test(u)) browser = 'Edge';
  else if (/opr\/|opera/.test(u)) browser = 'Opera';
  else if (/samsungbrowser/.test(u)) browser = 'Samsung';
  else if (/chrome|crios/.test(u) && !/edg\//.test(u)) browser = 'Chrome';
  else if (/firefox|fxios/.test(u)) browser = 'Firefox';
  else if (/safari/.test(u) && !/chrome|crios|android/.test(u)) browser = 'Safari';

  let os = 'Other';
  if (/windows nt/.test(u)) os = 'Windows';
  else if (/iphone|ipad|ipod/.test(u)) os = 'iOS';
  else if (/mac os x/.test(u)) os = 'macOS';
  else if (/android/.test(u)) os = 'Android';
  else if (/linux/.test(u)) os = 'Linux';

  return { device, browser, os };
}
