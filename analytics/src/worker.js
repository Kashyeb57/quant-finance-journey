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
  };

  // Write in the background so the beacon returns instantly.
  const write = env.DB.prepare(
    `INSERT INTO hits
      (ts, ip, country, city, region, timezone, asn, path, referer, ua, device, browser, os, screen)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      row.ts, row.ip, row.country, row.city, row.region, row.timezone, row.asn,
      row.path, row.referer, row.ua, row.device, row.browser, row.os, row.screen
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
    `SELECT ts, ip, country, city, region, timezone, asn, path, referer, device, browser, os, screen, ua
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

  const token = url.searchParams.get('token');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 2000);

  const [recent, totals, topPages, topCountries, topDevices, topBrowsers] = await Promise.all([
    env.DB.prepare(
      `SELECT ts, ip, country, city, region, asn, path, device, browser, os, screen, ua
         FROM hits ORDER BY id DESC LIMIT ?`
    ).bind(limit).all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS visits, COUNT(DISTINCT ip) AS uniques FROM hits`
    ).all(),
    env.DB.prepare(
      `SELECT path, COUNT(*) AS n FROM hits GROUP BY path ORDER BY n DESC LIMIT 10`
    ).all(),
    env.DB.prepare(
      `SELECT country, COUNT(*) AS n FROM hits GROUP BY country ORDER BY n DESC LIMIT 10`
    ).all(),
    env.DB.prepare(
      `SELECT device, COUNT(*) AS n FROM hits GROUP BY device ORDER BY n DESC LIMIT 10`
    ).all(),
    env.DB.prepare(
      `SELECT browser, COUNT(*) AS n FROM hits GROUP BY browser ORDER BY n DESC LIMIT 10`
    ).all(),
  ]);

  const t = totals.results[0] || { visits: 0, uniques: 0 };
  const html = renderDashboard({
    token,
    visits: t.visits,
    uniques: t.uniques,
    recent: recent.results || [],
    topPages: topPages.results || [],
    topCountries: topCountries.results || [],
    topDevices: topDevices.results || [],
    topBrowsers: topBrowsers.results || [],
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
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

function renderDashboard(d) {
  const rows = d.recent
    .map((r) => {
      const loc = [r.city, r.region, r.country].filter(Boolean).join(', ');
      return `<tr>
        <td class="mono nowrap">${esc(fmtCT(r.ts))}</td>
        <td class="mono">${esc(r.ip)}</td>
        <td>${esc(loc || '—')}</td>
        <td class="mono">${esc(r.path)}</td>
        <td>${esc(r.device)}</td>
        <td>${esc(r.browser)} · ${esc(r.os)}</td>
        <td class="mono small" title="${esc(r.ua)}">${esc((r.asn || '').slice(0, 28))}</td>
      </tr>`;
    })
    .join('');

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
  .sub { color: #8b929c; margin: 0 0 24px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 14px; margin-bottom: 26px; }
  .card { background: #1c1f26; border: 1px solid #262b34; border-radius: 12px; padding: 16px 18px; }
  .card .k { color: #8b929c; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .card .v { font-size: 28px; font-weight: 700; margin-top: 4px; }
  .accent { color: #25c2a0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 16px; margin-bottom: 26px; }
  .panel { background: #1c1f26; border: 1px solid #262b34; border-radius: 12px; padding: 14px 16px; }
  .panel h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #8b929c; margin: 0 0 10px; }
  .panel ul { list-style: none; margin: 0; padding: 0; }
  .panel li { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border-bottom: 1px solid #23272f; }
  .panel li:last-child { border-bottom: 0; }
  .panel li b { color: #25c2a0; }
  .muted { color: #6b727c; }
  table { width: 100%; border-collapse: collapse; background: #1c1f26; border: 1px solid #262b34; border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #23272f; vertical-align: top; }
  th { background: #191c22; color: #8b929c; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; position: sticky; top: 0; }
  tr:hover td { background: #20242c; }
  .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
  .small { font-size: 12px; }
  .nowrap { white-space: nowrap; }
  .tablewrap { overflow-x: auto; border-radius: 12px; }
  .foot { margin-top: 18px; color: #6b727c; font-size: 12px; }
  a { color: #25c2a0; }
</style></head>
<body><div class="wrap">
  <h1>Visitor log <span class="accent">·</span> joyebkashyeb.com.np</h1>
  <p class="sub">Private owner view. Auto-recorded on every page view. Times are Central (Alabama).</p>

  <div class="cards">
    <div class="card"><div class="k">Total visits</div><div class="v">${d.visits}</div></div>
    <div class="card"><div class="k">Unique IPs</div><div class="v accent">${d.uniques}</div></div>
    <div class="card"><div class="k">Showing</div><div class="v">${d.recent.length}</div><div class="k">most recent</div></div>
  </div>

  <div class="grid">
    <div class="panel"><h2>Top pages</h2><ul>${statList(d.topPages, 'path')}</ul></div>
    <div class="panel"><h2>Countries</h2><ul>${statList(d.topCountries, 'country')}</ul></div>
    <div class="panel"><h2>Devices</h2><ul>${statList(d.topDevices, 'device')}</ul></div>
    <div class="panel"><h2>Browsers</h2><ul>${statList(d.topBrowsers, 'browser')}</ul></div>
  </div>

  <div class="tablewrap"><table>
    <thead><tr>
      <th>Time (CT)</th><th>IP</th><th>Location</th><th>Page</th><th>Device</th><th>Browser · OS</th><th>Network (ASN)</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="muted" style="padding:20px">No visits recorded yet.</td></tr>'}</tbody>
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
