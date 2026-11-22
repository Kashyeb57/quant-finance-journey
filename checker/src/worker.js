/**
 * Checker: Joyeb's private job dashboard at joyebkashyeb.com.np/checker
 *
 * What it does
 *   - Shows every job the hunter pipelines found (after the hunter's own rules),
 *     with score, category, deadline, work-authorization flags and an Apply link.
 *   - Tracks what Joyeb applied to: status, date applied, resume used, notes.
 *   - "Apply queue": walk through selected jobs one by one (open posting,
 *     mark applied / skip). Joyeb still submits every application himself.
 *
 * Who can see it
 *   - Page and /checker/api/* need a login session (password -> signed cookie).
 *   - /checker/api/ingest needs the hunter's INGEST_TOKEN instead.
 *   - Every response is no-store and noindex; nothing here is linked from the site.
 *
 * Secrets (wrangler secret put): CHECKER_PASSWORD, SESSION_SECRET, INGEST_TOKEN.
 * If any is missing the Worker refuses everything rather than running open.
 */

const BASE = '/checker';
const COOKIE = 'chk_s';
const SESSION_DAYS = 7;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const STATUSES = ['new', 'saved', 'preparing', 'applied', 'oa', 'interview', 'offer', 'rejected', 'skipped', 'closed'];
const AUTH_FLAGS = ['excluded', 'risk', 'ok', 'unknown'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- small helpers ----------

const enc = new TextEncoder();

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Compare two strings without leaking where they differ (hash both first so
// the lengths are equal too).
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha256hex('cmp:' + a), sha256hex('cmp:' + b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function hmac(keyStr, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(keyStr), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function configured(env) {
  return Boolean(env.CHECKER_PASSWORD && env.SESSION_SECRET && env.INGEST_TOKEN &&
    env.SESSION_SECRET.length >= 24 && env.INGEST_TOKEN.length >= 24);
}

// The signing key includes the password, so changing the password logs out every browser.
function sessionKey(env) {
  return env.SESSION_SECRET + '|' + env.CHECKER_PASSWORD;
}

function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

async function makeSession(env) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  return exp + '.' + await hmac(sessionKey(env), 'session:' + exp);
}

async function validSession(request, env) {
  const v = getCookie(request, COOKIE);
  const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(v);
  if (!m || Number(m[1]) < Date.now()) return false;
  return safeEqual(m[2], await hmac(sessionKey(env), 'session:' + m[1]));
}

function cookieHeader(value, maxAge) {
  return `${COOKIE}=${value}; Path=${BASE}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

function text(body, status) {
  return new Response(body, { status, headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
}

// Mutating browser calls must come from this site (Origin check) and carry a
// custom header, which a cross-site form cannot send.
function sameOrigin(request, url) {
  const origin = request.headers.get('Origin');
  return origin === url.origin;
}

function chicagoDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function cleanUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    u.hash = '';
    return u.href.slice(0, 2000);
  } catch { return null; }
}

const str = (v, n) => (v === null || v === undefined) ? null : (String(v).trim().slice(0, n) || null);

// ---------- login ----------

// Every attempt is recorded BEFORE the password is checked, in the same transaction
// as the count, so parallel requests cannot all slip under the limit.
async function reserveAttempt(env, ip) {
  const now = Date.now();
  const [, count] = await env.DB.batch([
    env.DB.prepare('INSERT INTO login_fail (ip, at) VALUES (?, ?)').bind(ip, now),
    env.DB.prepare('SELECT COUNT(*) AS n FROM login_fail WHERE ip = ? AND at > ?').bind(ip, now - FAIL_WINDOW_MS),
  ]);
  return (count.results[0]?.n || 0) <= MAX_FAILS;
}

async function handleLogin(request, env, url) {
  if (request.method !== 'POST') return text('Method not allowed', 405);
  if (!sameOrigin(request, url)) return text('Forbidden', 403);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await reserveAttempt(env, ip))) return loginPage('Too many tries. Wait 15 minutes.', 429);
  let password = '';
  try { password = String((await request.formData()).get('password') || ''); } catch { /* empty */ }
  if (!password || !(await safeEqual(password, env.CHECKER_PASSWORD))) {
    await env.DB.prepare('DELETE FROM login_fail WHERE at < ?').bind(Date.now() - 86400000).run();
    return loginPage('Wrong password.', 401);
  }
  await env.DB.prepare('DELETE FROM login_fail WHERE ip = ?').bind(ip).run();
  return new Response(null, {
    status: 303,
    headers: { ...BASE_HEADERS, Location: BASE, 'Set-Cookie': cookieHeader(await makeSession(env), SESSION_DAYS * 86400) },
  });
}

function handleLogout(request, url) {
  if (request.method !== 'POST' || !sameOrigin(request, url)) return text('Forbidden', 403);
  return new Response(null, { status: 303, headers: { ...BASE_HEADERS, Location: BASE, 'Set-Cookie': cookieHeader('', 0) } });
}

// ---------- ingest (hunter -> D1) ----------

function normCategory(type) {
  const t = String(type || '').toLowerCase();
  if (t.startsWith('quant')) return 'quant';
  if (t.startsWith('software')) return 'software';
  if (t.startsWith('data')) return 'data';
  return t.slice(0, 30) || 'other';
}

// found_at is always stored as a full UTC ISO timestamp so time filters compare exactly.
function isoOrNow(v, now) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v)) return now;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? now : d.toISOString();
}

function normDeadline(v) {
  const s = String(v || '').trim();
  if (/^rolling$/i.test(s)) return 'rolling';
  return DAY_RE.test(s.slice(0, 10)) ? s.slice(0, 10) : null;
}

async function handleIngest(request, env) {
  if (request.method !== 'POST') return text('Method not allowed', 405);
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !(await safeEqual(token, env.INGEST_TOKEN))) return text('Forbidden', 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const list = Array.isArray(body?.jobs) ? body.jobs : null;
  if (!list || list.length > 500) return json({ error: 'send 1 to 500 jobs per request' }, 400);

  const now = new Date().toISOString();
  const stmts = [];
  let skipped = 0;
  for (const j of list) {
    const url = cleanUrl(j.url);
    const company = str(j.company, 200), title = str(j.title, 300);
    if (!url || !company || !title) { skipped++; continue; }
    const score = Number.isFinite(Number(j.score)) && j.score !== '' && j.score !== null ? Math.round(Number(j.score)) : null;
    const cpt = AUTH_FLAGS.includes(j.cpt) ? j.cpt : 'unknown';
    const opt = AUTH_FLAGS.includes(j.opt) ? j.opt : 'unknown';
    stmts.push(env.DB.prepare(
      `INSERT INTO jobs (id, url, company, title, location, category, deadline, pay, intl, score, source,
                         found_at, last_seen, cpt, opt, auth_quote)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
       ON CONFLICT(url) DO UPDATE SET
         company = excluded.company, title = excluded.title, location = excluded.location,
         category = excluded.category, deadline = COALESCE(excluded.deadline, jobs.deadline),
         pay = COALESCE(excluded.pay, jobs.pay), intl = excluded.intl, score = excluded.score,
         source = excluded.source, last_seen = excluded.last_seen,
         found_at = COALESCE(jobs.found_at, excluded.found_at),
         cpt = CASE WHEN excluded.cpt <> 'unknown' THEN excluded.cpt ELSE jobs.cpt END,
         opt = CASE WHEN excluded.opt <> 'unknown' THEN excluded.opt ELSE jobs.opt END,
         auth_quote = COALESCE(excluded.auth_quote, jobs.auth_quote)`
    ).bind(
      (await sha256hex(url)).slice(0, 16), url, company, title, str(j.location, 200), normCategory(j.type || j.category),
      normDeadline(j.deadline), str(j.pay, 100), str(j.intl, 60), score, str(j.source, 80),
      isoOrNow(j.found, now), now, cpt, opt, str(j.auth_quote, 600),
    ));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, upserted: stmts.length, skipped });
}

// ---------- private documents (resumes, scorecards, base resumes) ----------

const DOC_KINDS = ['resume', 'scorecard', 'base', 'other'];
const BASES = ['DataAnalytics', 'DataScience', 'Software', 'Risk', 'Quant'];
const MAX_DOC = 1024 * 1024; // 1 MB; a one-page resume PDF is ~60-150 KB
const DOC_TYPES = { pdf: 'application/pdf', md: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8', tex: 'text/plain; charset=utf-8' };

function randomId() {
  const b = new Uint8Array(8); crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function docName(raw) {
  const name = String(raw || '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120);
  const ext = (/\.([a-z0-9]+)$/i.exec(name) || [])[1]?.toLowerCase();
  return DOC_TYPES[ext] ? { name, mime: DOC_TYPES[ext] } : null;
}

// Upload: multipart form with file, kind, and job (16-hex id) or url (posting URL) or base (one of BASES).
// Used by the page (session) and by the PC uploader script (ingest token).
async function apiDocUpload(request, env) {
  let form; try { form = await request.formData(); } catch { return json({ error: 'send multipart form data' }, 400); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'no file' }, 400);
  const meta = docName(file.name);
  if (!meta) return json({ error: 'only .pdf, .md, .txt, .tex files' }, 400);
  if (file.size > MAX_DOC) return json({ error: 'file is over 1 MB' }, 400);
  const kind = String(form.get('kind') || '');
  if (!DOC_KINDS.includes(kind)) return json({ error: 'kind must be ' + DOC_KINDS.join(', ') }, 400);
  let jobId = null;
  if (kind === 'base') {
    const base = String(form.get('base') || '');
    if (!BASES.includes(base)) return json({ error: 'base must be ' + BASES.join(', ') }, 400);
    meta.name = base + (meta.mime === 'application/pdf' ? '.pdf' : '.' + meta.name.split('.').pop());
  } else {
    jobId = String(form.get('job') || '');
    if (!/^[0-9a-f]{16}$/.test(jobId)) {
      const url = cleanUrl(form.get('url'));
      if (!url) return json({ error: 'give job (id) or url' }, 400);
      jobId = (await sha256hex(url)).slice(0, 16);
    }
    if (!(await env.DB.prepare('SELECT 1 FROM jobs WHERE id = ?').bind(jobId).first())) return json({ error: 'no such job in Checker' }, 404);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (meta.mime === 'application/pdf' && !(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return json({ error: 'not a real PDF' }, 400);
  }
  const id = randomId();
  // Same job + kind + name replaces the old copy (re-uploading a fixed resume).
  await env.DB.batch([
    env.DB.prepare("DELETE FROM docs WHERE COALESCE(job_id, '') = ? AND kind = ? AND name = ?").bind(jobId || '', kind, meta.name),
    env.DB.prepare('INSERT INTO docs (id, job_id, kind, name, mime, size, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, jobId, kind, meta.name, meta.mime, bytes.length, bytes, new Date().toISOString()),
  ]);
  return json({ ok: true, id, job: jobId, kind, name: meta.name, size: bytes.length });
}

async function apiDocList(env, url) {
  const job = url.searchParams.get('job');
  const q = job && /^[0-9a-f]{16}$/.test(job)
    ? env.DB.prepare('SELECT id, job_id, kind, name, size, created_at FROM docs WHERE job_id = ? ORDER BY kind, name').bind(job)
    : env.DB.prepare("SELECT id, job_id, kind, name, size, created_at FROM docs WHERE kind = 'base' ORDER BY name");
  return json({ docs: (await q.all()).results });
}

async function apiDocGet(env, id) {
  const row = await env.DB.prepare('SELECT name, mime, body FROM docs WHERE id = ?').bind(id).first();
  if (!row) return text('Not found', 404);
  const body = row.body instanceof ArrayBuffer ? row.body : new Uint8Array(row.body);
  const headers = { ...BASE_HEADERS, 'Content-Type': row.mime, 'Content-Disposition': `inline; filename="${row.name}"` };
  // Text files open sandboxed (no scripts, no access to the Checker page). PDFs skip the
  // sandbox because Chrome's PDF viewer refuses sandboxed documents; uploads are checked
  // to start with %PDF and are served with nosniff.
  if (row.mime !== 'application/pdf') headers['Content-Security-Policy'] = "sandbox; default-src 'none'";
  return new Response(body, { headers });
}

async function apiDocDelete(env, id) {
  const res = await env.DB.prepare('DELETE FROM docs WHERE id = ?').bind(id).run();
  return res.meta.changes ? json({ ok: true }) : json({ error: 'not found' }, 404);
}

// ---------- owner API ----------

const ACTIVE_EXCLUDE = ['rejected', 'skipped', 'closed'];

function buildWhere(params) {
  const where = [], args = [];
  const status = params.get('status') || 'active';
  if (status === 'active') { where.push(`status NOT IN (${ACTIVE_EXCLUDE.map(() => '?').join(',')})`); args.push(...ACTIVE_EXCLUDE); }
  else if (status === 'tracked') { where.push("status <> 'new'"); }
  else if (status !== 'all') {
    const list = [...new Set(status.split(',').filter(s => STATUSES.includes(s)))];
    if (list.length) { where.push(`status IN (${list.map(() => '?').join(',')})`); args.push(...list); }
  }
  const cat = params.get('category');
  if (cat && cat !== 'all') { where.push('category = ?'); args.push(cat); }
  const q = (params.get('q') || '').trim().slice(0, 80);
  if (q) {
    where.push("(instr(lower(company), ?1q) > 0 OR instr(lower(title), ?1q) > 0 OR instr(lower(COALESCE(location, '')), ?1q) > 0)".replaceAll('?1q', '?'));
    const p = q.toLowerCase(); args.push(p, p, p);
  }
  const f1 = params.get('f1');
  // 'hide-no' hides jobs that clearly exclude F-1 / sponsorship; never hides unknowns.
  if (f1 === 'hide-no') where.push("COALESCE(intl,'') <> 'no-sponsorship' AND cpt <> 'excluded'");
  if (f1 === 'ok') where.push("cpt = 'ok'");
  const minScore = Number(params.get('min'));
  if (Number.isFinite(minScore) && minScore > 0) { where.push('score >= ?'); args.push(minScore); }
  const due = Number(params.get('due'));
  if (Number.isFinite(due) && due > 0) {
    const today = chicagoDay(), until = chicagoDay(new Date(Date.now() + due * 86400000));
    where.push(`COALESCE(my_deadline, deadline) BETWEEN ? AND ?`); args.push(today, until);
  }
  const days = Number(params.get('found'));
  if (Number.isFinite(days) && days > 0) { where.push('found_at >= ?'); args.push(new Date(Date.now() - days * 86400000).toISOString()); }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', args };
}

const SORTS = {
  score: 'score DESC, found_at DESC',
  found: 'found_at DESC, score DESC',
  deadline: "CASE WHEN COALESCE(my_deadline, deadline) GLOB '[0-9]*' THEN 0 ELSE 1 END, COALESCE(my_deadline, deadline), score DESC",
  company: 'company COLLATE NOCASE, title COLLATE NOCASE',
  updated: "COALESCE(updated_at, '') DESC, score DESC",
};

async function apiJobs(env, url) {
  const p = url.searchParams;
  const { sql, args } = buildWhere(p);
  const order = SORTS[p.get('sort')] || SORTS.score;
  const limit = Math.min(Math.max(Number(p.get('limit')) || 100, 1), 500);
  const offset = Math.max(Number(p.get('offset')) || 0, 0);
  const [rows, total, counts, week] = await env.DB.batch([
    env.DB.prepare(`SELECT id, url, company, title, location, category, deadline, pay, intl, score, source, found_at,
                           cpt, opt, auth_quote, status, applied_on, resume, my_deadline, notes, updated_at,
                           (SELECT json_group_array(json_object('id', d.id, 'kind', d.kind, 'name', d.name))
                              FROM docs d WHERE d.job_id = jobs.id) AS docs
                    FROM jobs ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...args, limit, offset),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM jobs ${sql}`).bind(...args),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status'),
    env.DB.prepare('SELECT COUNT(*) AS n FROM jobs WHERE applied_on >= ?').bind(chicagoDay(new Date(Date.now() - 6 * 86400000))),
  ]);
  const byStatus = Object.fromEntries((counts.results || []).map(r => [r.status, r.n]));
  return json({ total: total.results[0].n, rows: rows.results, counts: byStatus, appliedThisWeek: week.results[0].n });
}

function readPatch(body) {
  const set = {};
  if ('status' in body) { if (!STATUSES.includes(body.status)) return null; set.status = body.status; }
  for (const k of ['applied_on', 'my_deadline']) {
    if (k in body) { if (body[k] !== null && body[k] !== '' && !DAY_RE.test(body[k])) return null; set[k] = body[k] || null; }
  }
  if ('resume' in body) set.resume = str(body.resume, 160);
  if ('notes' in body) set.notes = str(body.notes, 2000);
  return Object.keys(set).length ? set : null;
}

async function apiPatch(request, env, id) {
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const set = readPatch(body || {});
  if (!set) return json({ error: 'nothing valid to change' }, 400);
  // Marking applied without a date keeps the first application date (or uses today).
  const keepDate = set.status === 'applied' && !set.applied_on;
  if (keepDate) delete set.applied_on;
  const keys = Object.keys(set);
  const parts = keys.map(k => `${k} = ?`);
  const args = keys.map(k => set[k]);
  if (keepDate) { parts.push('applied_on = COALESCE(applied_on, ?)'); args.push(chicagoDay()); }
  const res = await env.DB.prepare(
    `UPDATE jobs SET ${parts.join(', ')}, updated_at = ? WHERE id = ?`
  ).bind(...args, new Date().toISOString(), id).run();
  if (!res.meta.changes) return json({ error: 'not found' }, 404);
  const row = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first();
  return json({ ok: true, row });
}

async function apiBulk(request, env) {
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const raw = Array.isArray(body?.ids) ? body.ids : [];
  if (raw.length > 200) return json({ error: 'send at most 200 ids per request' }, 400);
  const ids = [...new Set(raw.filter(x => /^[0-9a-f]{16}$/.test(x)))];
  if (!ids.length || !STATUSES.includes(body.status)) return json({ error: 'need ids and a valid status' }, 400);
  const now = new Date().toISOString(), today = chicagoDay();
  const stmts = ids.map(id => body.status === 'applied'
    ? env.DB.prepare('UPDATE jobs SET status = ?, applied_on = COALESCE(applied_on, ?), updated_at = ? WHERE id = ?').bind(body.status, today, now, id)
    : env.DB.prepare('UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?').bind(body.status, now, id));
  const res = await env.DB.batch(stmts);
  return json({ ok: true, changed: res.reduce((n, r) => n + (r.meta.changes || 0), 0) });
}

// CSV of every job Joyeb has touched, so the tracker can be updated from it when he asks.
async function apiExport(env) {
  const { results } = await env.DB.prepare(
    "SELECT company, title, url, status, applied_on, resume, my_deadline, notes, updated_at FROM jobs WHERE status <> 'new' ORDER BY updated_at DESC"
  ).all();
  const cols = ['company', 'title', 'url', 'status', 'applied_on', 'resume', 'my_deadline', 'notes', 'updated_at'];
  const cell = v => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // no spreadsheet formulas
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.join(','), ...results.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n') + '\r\n';
  return new Response(body, { headers: { ...BASE_HEADERS, 'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="checker-${chicagoDay()}.csv"` } });
}

// ---------- pages ----------

function nonce() {
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}

function htmlResponse(html, n, status = 200, extra = {}) {
  return new Response(html, {
    status,
    headers: {
      ...BASE_HEADERS, ...extra,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${n}'; style-src 'nonce-${n}'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    },
  });
}

function loginPage(message = '', status = 200) {
  const n = nonce();
  const msg = message ? `<p class="err">${message}</p>` : '';
  return htmlResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Checker</title><style nonce="${n}">
body{font:15px system-ui,sans-serif;background:#0f1115;color:#e6e6e6;display:grid;place-items:center;height:100vh;margin:0}
form{background:#171a21;padding:28px;border-radius:10px;width:300px;border:1px solid #2a2f3a}
h1{font-size:18px;margin:0 0 16px}input{width:100%;box-sizing:border-box;padding:10px;border-radius:6px;border:1px solid #333;background:#0f1115;color:#fff}
button{margin-top:12px;width:100%;padding:10px;border:0;border-radius:6px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer}
.err{color:#f87171;margin:0 0 10px}</style></head><body>
<form method="post" action="${BASE}/login"><h1>Checker</h1>${msg}
<input type="password" name="password" placeholder="Password" autocomplete="current-password" required autofocus>
<button type="submit">Sign in</button></form></body></html>`, n, status);
}

function appPage() {
  const n = nonce();
  return htmlResponse(APP_HTML.replaceAll('__NONCE__', n), n);
}

// ---------- router ----------

export default {
  async fetch(request, rawEnv) {
    let env = rawEnv;
    // Secrets set by piping on Windows can carry a trailing CR/LF; strip it.
    env = { ...rawEnv, CHECKER_PASSWORD: (env.CHECKER_PASSWORD || '').trim(),
      SESSION_SECRET: (env.SESSION_SECRET || '').trim(), INGEST_TOKEN: (env.INGEST_TOKEN || '').trim() };
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path !== BASE && !path.startsWith(BASE + '/')) return text('Not found', 404);
    if (!configured(env) || !env.DB) return text('Checker is not set up yet.', 503);

    try {
      if (path === BASE + '/api/ingest') return await handleIngest(request, env);
      if (path === BASE + '/api/ingest/docs') {
        if (request.method !== 'POST') return text('Method not allowed', 405);
        const auth = request.headers.get('Authorization') || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!token || !(await safeEqual(token, env.INGEST_TOKEN))) return text('Forbidden', 403);
        return await apiDocUpload(request, env);
      }
      if (path === BASE + '/login') return await handleLogin(request, env, url);
      if (path === BASE + '/logout') return handleLogout(request, url);

      const authed = await validSession(request, env);
      if (path === BASE) return authed ? appPage() : loginPage();
      if (!authed) return json({ error: 'sign in' }, 401);

      if (path.startsWith(BASE + '/api/')) {
        const route = path.slice((BASE + '/api/').length);
        if (request.method === 'GET') {
          if (route === 'jobs') return await apiJobs(env, url);
          if (route === 'export.csv') return await apiExport(env);
          if (route === 'docs') return await apiDocList(env, url);
          const d = /^docs\/([0-9a-f]{16})$/.exec(route);
          if (d) return await apiDocGet(env, d[1]);
        } else {
          if (!sameOrigin(request, url) || request.headers.get('X-Checker') !== '1') return text('Forbidden', 403);
          const m = /^jobs\/([0-9a-f]{16})$/.exec(route);
          if (m && request.method === 'PATCH') return await apiPatch(request, env, m[1]);
          if (route === 'bulk' && request.method === 'POST') return await apiBulk(request, env);
          if (route === 'docs' && request.method === 'POST') return await apiDocUpload(request, env);
          const d = /^docs\/([0-9a-f]{16})$/.exec(route);
          if (d && request.method === 'DELETE') return await apiDocDelete(env, d[1]);
        }
      }
      return text('Not found', 404);
    } catch (err) {
      console.error('checker error', err && err.stack || err);
      return json({ error: 'server error' }, 500);
    }
  },
};

// ---------- the dashboard page (all data drawn with textContent, never innerHTML) ----------

const APP_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Checker</title>
<style nonce="__NONCE__">
:root{--bg:#0f1115;--panel:#171a21;--line:#2a2f3a;--txt:#e6e6e6;--mut:#9aa3b2;--blue:#3b82f6;--green:#22c55e;--red:#f87171;--amber:#f59e0b}
*{box-sizing:border-box}body{margin:0;font:14px system-ui,sans-serif;background:var(--bg);color:var(--txt)}
header{display:flex;align-items:center;gap:16px;padding:12px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}
h1{font-size:18px;margin:0}.stats{display:flex;gap:10px;flex-wrap:wrap}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer}
.stat b{font-size:16px;margin-right:4px}.grow{flex:1}
.bar{display:flex;gap:8px;padding:10px 18px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line)}
input,select,textarea,button{font:inherit;color:var(--txt);background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:6px 8px}
button{cursor:pointer}button.primary{background:var(--blue);border-color:var(--blue);color:#fff;font-weight:600}
button:disabled{opacity:.45;cursor:default}
table{width:100%;border-collapse:collapse}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{position:sticky;top:0;background:var(--bg);color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase}
tr:hover td{background:#141821}.co{font-weight:600}.mut{color:var(--mut);font-size:12px}
.pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:12px;border:1px solid var(--line)}
.p-ok{color:var(--green);border-color:var(--green)}.p-no{color:var(--red);border-color:var(--red)}.p-risk{color:var(--amber);border-color:var(--amber)}
.soon{color:var(--amber);font-weight:600}.late{color:var(--red)}
a{color:#8ab4ff}td select{padding:3px}
.pager{display:flex;gap:10px;align-items:center;padding:10px 18px}
#queue{position:fixed;right:18px;bottom:18px;width:380px;background:var(--panel);border:1px solid var(--blue);border-radius:10px;padding:16px;display:none;box-shadow:0 8px 30px #000a}
#queue h2{margin:0 0 6px;font-size:16px}#queue .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
#detail{position:fixed;inset:0;background:#000a;display:none;align-items:center;justify-content:center}
#detail .box{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px;width:min(560px,94vw)}
#detail label{display:block;margin-top:10px;color:var(--mut);font-size:12px}#detail input,#detail textarea,#detail select{width:100%}

.w96{width:96px}.docs a{margin-right:8px;font-size:12px}#ddocs a{margin-right:6px}#ddocs button{padding:1px 6px;margin-right:12px;font-size:12px}.mt6{margin-top:6px}.mt8{margin-top:8px}.dh{margin:0;font-size:16px}.drow{display:flex;gap:8px;margin-top:12px}
#toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#111;border:1px solid var(--line);padding:8px 14px;border-radius:8px;display:none}
</style></head><body>
<header><h1>Checker</h1><div class="stats" id="stats"></div><div class="grow"></div>
<span class="mut" id="bases"></span>
<a href="/checker/api/export.csv">Export CSV</a>
<form method="post" action="/checker/logout"><button type="submit">Sign out</button></form></header>
<div class="bar">
  <input id="q" placeholder="Search company, title, place" size="26">
  <select id="status"><option value="active">Active (hide rejected/skipped/closed)</option><option value="tracked">Everything I touched</option><option value="all">All</option></select>
  <select id="category"><option value="all">All roles</option><option value="data">Data</option><option value="software">Software</option><option value="quant">Quant</option></select>
  <select id="f1"><option value="">F-1: show all</option><option value="hide-no">F-1: hide clear no</option><option value="ok">F-1: OK only</option></select>
  <select id="found"><option value="">Found any time</option><option value="1">Last 24 hours</option><option value="3">Last 3 days</option><option value="7">Last 7 days</option></select>
  <select id="due"><option value="">Any deadline</option><option value="7">Due in 7 days</option><option value="14">Due in 14 days</option></select>
  <input id="min" type="number" placeholder="Min score" min="0" max="100" class="w96">
  <select id="sort"><option value="score">Sort: score</option><option value="found">Sort: newest</option><option value="deadline">Sort: deadline</option><option value="company">Sort: company</option><option value="updated">Sort: recently changed</option></select>
  <div class="grow"></div>
  <span class="mut" id="selcount">0 selected</span>
  <button id="startQueue" class="primary" disabled>Apply queue</button>
  <select id="bulkStatus"><option value="">Set status...</option></select>
  <button id="copyPrep" disabled>Copy prep list</button>
</div>
<table><thead><tr><th><input type="checkbox" id="all"></th><th>Score</th><th>Company / role</th><th>Type</th><th>Found</th><th>Deadline</th><th>F-1</th><th>Status</th><th>Applied</th><th></th></tr></thead>
<tbody id="rows"></tbody></table>
<div class="pager"><button id="prev">Prev</button><span id="pageinfo" class="mut"></span><button id="next">Next</button></div>

<div id="queue"><div class="mut" id="qpos"></div><h2 id="qtitle"></h2><div id="qmeta" class="mut"></div>
<div class="mut mt6">Base resume: <b id="qresume"></b></div>
<div class="row"><button class="primary" id="qopen">Open posting</button><button id="qapplied">Mark applied</button><button id="qskip">Skip job</button></div>
<div class="row"><button id="qprev">Back</button><button id="qnext">Next</button><button id="qclose">Close queue</button></div></div>

<div id="detail"><div class="box"><h2 id="dtitle" class="dh"></h2><div id="dmeta" class="mut"></div>
<div id="dquote" class="mut mt8"></div>
<label>Status<select id="dstatus"></select></label><label>Date applied<input id="dapplied" type="date"></label>
<label>Resume sent (file or version)<input id="dresume" maxlength="160"></label><label>My deadline<input id="ddeadline" type="date"></label>
<label>Notes<textarea id="dnotes" rows="4" maxlength="2000"></textarea></label>
<label>Files for this job (tailored resume, scorecard)</label><div id="ddocs" class="mut"></div>
<div class="drow"><select id="dkind"><option value="resume">Resume</option><option value="scorecard">Scorecard</option><option value="other">Other</option></select>
<input type="file" id="dfile" accept=".pdf,.md,.txt,.tex"><button id="dupload">Upload</button></div>
<div class="drow"><button class="primary" id="dsave">Save</button><button id="dcancel">Cancel</button></div></div></div>
<div id="toast"></div>

<script nonce="__NONCE__">
(() => {
const STATUSES = ${JSON.stringify(STATUSES)};
const PAGE = 100;
const $ = id => document.getElementById(id);
const state = { rows: [], total: 0, offset: 0, selected: new Map(), queue: [], qi: 0, editing: null, bases: {} };
const docUrl = id => '/checker/api/docs/' + id;
function docsOf(r) { try { return JSON.parse(r.docs || '[]'); } catch { return []; } }
const KIND_LABEL = { resume: 'Resume', scorecard: 'Scorecard', other: 'File' };
function docLinks(r) {
  const box = el('div', { class: 'docs' });
  for (const d of docsOf(r)) box.append(el('a', { href: docUrl(d.id), target: '_blank', rel: 'noopener', text: KIND_LABEL[d.kind] || d.kind, title: d.name }));
  const b = state.bases[baseResume(r)];
  if (b) box.append(el('a', { href: docUrl(b), target: '_blank', rel: 'noopener', text: 'Base PDF', title: baseResume(r) + ' base resume' }));
  return box;
}
async function loadBases() {
  try {
    const d = await api('docs', { method: 'GET', headers: {} });
    state.bases = {}; const box = $('bases'); box.replaceChildren(d.docs.length ? 'Bases: ' : '');
    for (const doc of d.docs) {
      const name = doc.name.replace(/\\.[a-z]+$/, ''); state.bases[name] = doc.id;
      box.append(el('a', { href: docUrl(doc.id), target: '_blank', rel: 'noopener', text: name }), ' ');
    }
  } catch { /* bases optional */ }
}

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const k of kids) if (k !== null && k !== undefined) e.append(k);
  return e;
}
function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = 'none', 2200); }
function safeHref(u) { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; } }
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); }

// Which of the 5 base resumes fits this job (same mapping as intern-resume-style).
function baseResume(r) {
  const t = (r.title || '').toLowerCase();
  if (/risk|credit|fraud|compliance|model validation/.test(t)) return 'Risk';
  if (r.category === 'quant' || /quant|trading|trader|strats/.test(t)) return 'Quant';
  if (/data scien|machine learning|\\bml\\b|\\bai\\b|research/.test(t)) return 'DataScience';
  if (r.category === 'data' || /data|analyt|business intel/.test(t)) return 'DataAnalytics';
  return 'Software';
}

function f1Pill(r) {
  if (r.cpt === 'excluded' || r.intl === 'no-sponsorship') return el('span', { class: 'pill p-no', text: r.cpt === 'excluded' ? 'CPT no' : 'no sponsor' });
  if (r.cpt === 'risk' || r.opt === 'excluded' || r.opt === 'risk') return el('span', { class: 'pill p-risk', text: r.opt === 'excluded' ? 'OPT no' : 'check' });
  if (r.cpt === 'ok') return el('span', { class: 'pill p-ok', text: 'OK' });
  if (/H-1B likely/i.test(r.intl || '')) return el('span', { class: 'pill p-ok', text: 'sponsors' });
  return el('span', { class: 'mut', text: r.intl && r.intl !== 'unknown' ? r.intl : '?' });
}

function deadlineCell(r) {
  const d = r.my_deadline || r.deadline;
  if (!d) return el('span', { class: 'mut', text: '-' });
  if (d === 'rolling') return el('span', { class: 'mut', text: 'rolling' });
  const days = Math.round((new Date(d + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 86400000);
  return el('span', { class: days < 0 ? 'late' : days <= 7 ? 'soon' : '', text: d + (days >= 0 && days <= 14 ? ' (' + days + 'd)' : '') });
}

async function api(path, opts = {}) {
  const res = await fetch('/checker/api/' + path, { credentials: 'same-origin', ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Checker': '1', ...(opts.headers || {}) } });
  if (res.status === 401) { location.reload(); throw new Error('signed out'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.status);
  return data;
}

function query() {
  const p = new URLSearchParams();
  for (const k of ['q', 'status', 'category', 'f1', 'found', 'due', 'min', 'sort']) { const v = $(k).value.trim(); if (v) p.set(k, v); }
  p.set('limit', PAGE); p.set('offset', state.offset);
  return p.toString();
}

async function load() {
  try {
    const d = await api('jobs?' + query(), { method: 'GET', headers: {} });
    state.rows = d.rows; state.total = d.total;
    renderStats(d); renderRows();
  } catch (e) { if (e.message !== 'signed out') toast('Load failed: ' + e.message); }
}

function renderStats(d) {
  const s = $('stats'); s.replaceChildren();
  const c = d.counts || {}, total = Object.values(c).reduce((a, b) => a + b, 0);
  const items = [['Jobs', total, 'all'], ['New', c.new || 0, 'new'], ['Applied', c.applied || 0, 'applied'],
    ['This week', d.appliedThisWeek || 0, 'applied'], ['OA', c.oa || 0, 'oa'], ['Interview', c.interview || 0, 'interview'],
    ['Offer', c.offer || 0, 'offer'], ['Rejected', c.rejected || 0, 'rejected']];
  for (const [label, n, st] of items) s.append(el('span', { class: 'stat', onclick: () => {
    if (st === 'all') $('status').value = 'all';
    else { let o = [...$('status').options].find(x => x.value === st); if (!o) $('status').append(o = el('option', { value: st, text: 'Status: ' + st })); $('status').value = st; }
    state.offset = 0; load(); } }, el('b', { text: String(n) }), label));
}

function renderRows() {
  const tb = $('rows'); tb.replaceChildren();
  for (const r of state.rows) {
    const href = safeHref(r.url);
    const cb = el('input', { type: 'checkbox' }); cb.checked = state.selected.has(r.id);
    cb.addEventListener('change', () => { cb.checked ? state.selected.set(r.id, r) : state.selected.delete(r.id); updateSel(); });
    const sel = el('select'); for (const s of STATUSES) sel.append(el('option', { value: s, text: s })); sel.value = r.status;
    sel.addEventListener('change', () => patch(r, { status: sel.value }));
    tb.append(el('tr', {},
      el('td', {}, cb),
      el('td', { text: r.score === null ? '-' : String(r.score) }),
      el('td', {}, el('div', { class: 'co', text: r.company }), el('div', { text: r.title }),
        el('div', { class: 'mut', text: [r.location, r.pay, r.source].filter(Boolean).join(' | ') }), docLinks(r)),
      el('td', { class: 'mut', text: r.category + ' / ' + baseResume(r) }),
      el('td', { class: 'mut', text: (r.found_at || '').slice(0, 10) }),
      el('td', {}, deadlineCell(r)),
      el('td', {}, f1Pill(r)),
      el('td', {}, sel),
      el('td', { class: 'mut', text: r.applied_on || '' }),
      el('td', {}, href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: 'Apply' }) : null, ' ',
        el('button', { text: 'Edit', onclick: () => openDetail(r) }))));
  }
  const from = state.total ? state.offset + 1 : 0, to = state.offset + state.rows.length;
  $('pageinfo').textContent = from + '-' + to + ' of ' + state.total;
  $('prev').disabled = state.offset === 0; $('next').disabled = to >= state.total;
  $('all').checked = state.rows.length > 0 && state.rows.every(r => state.selected.has(r.id));
}

function updateSel() {
  const n = state.selected.size;
  $('selcount').textContent = n + ' selected';
  $('startQueue').disabled = $('copyPrep').disabled = n === 0;
}

async function patch(r, change) {
  try { const d = await api('jobs/' + r.id, { method: 'PATCH', body: JSON.stringify(change) }); Object.assign(r, d.row);
    if (state.selected.has(r.id)) state.selected.set(r.id, r); toast(r.company + ': ' + r.status); renderRows(); return true; }
  catch (e) { toast('Save failed: ' + e.message); return false; }
}

function openDetail(r) {
  state.editing = r;
  $('dtitle').textContent = r.company + ' - ' + r.title;
  $('dmeta').textContent = [r.location, 'score ' + r.score, 'found ' + (r.found_at || '').slice(0, 10), 'CPT ' + r.cpt, 'OPT ' + r.opt].join(' | ');
  $('dquote').textContent = r.auth_quote ? 'Posting says: "' + r.auth_quote + '"' : '';
  $('dstatus').value = r.status; $('dapplied').value = r.applied_on || ''; $('dresume').value = r.resume || baseResume(r);
  $('ddeadline').value = r.my_deadline || ''; $('dnotes').value = r.notes || '';
  renderDocs(r); $('dfile').value = '';
  $('detail').style.display = 'flex';
}
function renderDocs(r) {
  const box = $('ddocs'); box.replaceChildren();
  const list = docsOf(r);
  if (!list.length) box.append('No files yet.');
  for (const d of list) box.append(el('a', { href: docUrl(d.id), target: '_blank', rel: 'noopener', text: (KIND_LABEL[d.kind] || d.kind) + ': ' + d.name }),
    el('button', { text: 'x', title: 'Delete this file', onclick: async () => {
      if (!confirm('Delete ' + d.name + ' from Checker?')) return;
      try { await api('docs/' + d.id, { method: 'DELETE' }); r.docs = JSON.stringify(docsOf(r).filter(x => x.id !== d.id)); renderDocs(r); renderRows(); }
      catch (e) { toast('Delete failed: ' + e.message); } } }));
}
async function uploadDoc() {
  const r = state.editing, f = $('dfile').files[0];
  if (!f) return toast('Choose a file first');
  const fd = new FormData(); fd.append('file', f); fd.append('kind', $('dkind').value); fd.append('job', r.id);
  const res = await fetch('/checker/api/docs', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Checker': '1' } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) return toast('Upload failed: ' + (d.error || res.status));
  r.docs = JSON.stringify([...docsOf(r).filter(x => !(x.kind === d.kind && x.name === d.name)), { id: d.id, kind: d.kind, name: d.name }]);
  $('dfile').value = ''; renderDocs(r); renderRows(); toast('Uploaded ' + d.name);
}

function startQueue() {
  state.queue = [...state.selected.values()]; state.qi = 0;
  if (state.queue.length) { $('queue').style.display = 'block'; showQueue(); }
}
function showQueue() {
  const r = state.queue[state.qi];
  $('qpos').textContent = 'Job ' + (state.qi + 1) + ' of ' + state.queue.length;
  $('qtitle').textContent = r.company + ' - ' + r.title;
  $('qmeta').textContent = [r.location, 'status: ' + r.status, r.cpt !== 'unknown' ? 'CPT ' + r.cpt : ''].filter(Boolean).join(' | ');
  $('qresume').textContent = r.resume || baseResume(r);
  $('qprev').disabled = state.qi === 0; $('qnext').disabled = state.qi >= state.queue.length - 1;
}
async function queueMark(status) {
  const r = state.queue[state.qi];
  const change = { status }; if (status === 'applied' && !r.resume) change.resume = baseResume(r);
  if (await patch(r, change) && state.qi < state.queue.length - 1) { state.qi++; showQueue(); } else showQueue();
}

function prepList() {
  return [...state.selected.values()].map(r => '- ' + r.company + ' | ' + r.title + ' | base: ' + baseResume(r) + ' | ' + r.url).join('\\n');
}

// wiring
for (const s of STATUSES) { $('bulkStatus').append(el('option', { value: s, text: s })); $('dstatus').append(el('option', { value: s, text: s })); }
let deb; $('q').addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { state.offset = 0; load(); }, 300); });
for (const id of ['status', 'category', 'f1', 'found', 'due', 'min', 'sort']) $(id).addEventListener('change', () => { state.offset = 0; load(); });
$('prev').onclick = () => { state.offset = Math.max(0, state.offset - PAGE); load(); };
$('next').onclick = () => { state.offset += PAGE; load(); };
$('all').onchange = () => { for (const r of state.rows) $('all').checked ? state.selected.set(r.id, r) : state.selected.delete(r.id); renderRows(); updateSel(); };
$('startQueue').onclick = startQueue;
$('copyPrep').onclick = async () => { try { await navigator.clipboard.writeText(prepList()); toast('Copied ' + state.selected.size + ' jobs'); } catch { toast('Copy blocked by the browser'); } };
$('bulkStatus').onchange = async () => {
  const status = $('bulkStatus').value; $('bulkStatus').value = '';
  if (!status || !state.selected.size) return;
  if (!confirm('Set ' + state.selected.size + ' jobs to "' + status + '"?')) return;
  const ids = [...state.selected.keys()];
  let changed = 0;
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const d = await api('bulk', { method: 'POST', body: JSON.stringify({ ids: ids.slice(i, i + 200), status }) });
      changed += d.changed;
      for (const id of ids.slice(i, i + 200)) state.selected.delete(id);
    }
    toast(changed + ' updated');
  } catch (e) { toast('Stopped after ' + changed + ': ' + e.message + ' (unsent jobs stay selected)'); }
  updateSel(); load();
};
$('qopen').onclick = () => { const h = safeHref(state.queue[state.qi].url); if (h) window.open(h, '_blank', 'noopener,noreferrer'); };
$('qapplied').onclick = () => queueMark('applied');
$('qskip').onclick = () => queueMark('skipped');
$('qprev').onclick = () => { state.qi--; showQueue(); };
$('qnext').onclick = () => { state.qi++; showQueue(); };
$('qclose').onclick = () => { $('queue').style.display = 'none'; };
$('dcancel').onclick = () => { $('detail').style.display = 'none'; };
$('dupload').onclick = uploadDoc;
$('dsave').onclick = async () => {
  const r = state.editing;
  const ok = await patch(r, { status: $('dstatus').value, applied_on: $('dapplied').value || null, resume: $('dresume').value,
    my_deadline: $('ddeadline').value || null, notes: $('dnotes').value });
  if (ok) $('detail').style.display = 'none';
};
loadBases().then(load);
})();
</script></body></html>`;
