// Experimental SPY runner bridge. All brokerage calls use the existing,
// hard-coded PAPER transport. No request can supply a brokerage URL or key.
const SYMBOL = 'SPY';
const MAX_NOTIONAL = 1000;
const MAX_DAILY_ENTRIES = 6;
// A signal is usable only once its bar has settled: bar start + 15 min + 60 s,
// so late IEX prints for that bar have arrived before anything is decided on it.
const MIN_SIGNAL_AGE_MS = 960000;
const TERMINAL = ['filled', 'canceled', 'expired', 'rejected'];
const CLIENT_ID_RE = /^joyeb-fly-SPY-\d+$/;
// Uncertain rows may be resolved by the owner only after the broker has had time to show them.
const RESOLVE_AFTER_MS = 300000;
const lookupPath = clientId => `/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientId)}`;

// Once per database per isolate, as the notes table does, instead of on every request.
const initialized = new WeakSet();

async function initialize(db) {
  if (initialized.has(db)) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS brain_control (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('INSERT OR IGNORE INTO brain_control (id, enabled) VALUES (1, 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS brain_report (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, seen_at TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS brain_orders (client_id TEXT PRIMARY KEY, bar_time TEXT UNIQUE NOT NULL, side TEXT NOT NULL, status TEXT NOT NULL, filled_qty REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS brain_orders_created ON brain_orders (created_at)'),
  ]);
  initialized.add(db);
}

async function readState(db) {
  const control = await db.prepare('SELECT enabled FROM brain_control WHERE id = 1').first();
  const row = await db.prepare('SELECT payload, seen_at FROM brain_report WHERE id = 1').first();
  const { results } = await db.prepare('SELECT client_id, side, status, filled_qty, created_at FROM brain_orders ORDER BY created_at DESC LIMIT 20').all();
  return { enabled: !!control?.enabled, report: row ? JSON.parse(row.payload) : null,
    seen_at: row?.seen_at || null, online: !!row && Date.now() >= Date.parse(row.seen_at) && Date.now() - Date.parse(row.seen_at) < 120000,
    orders: results || [], limits: { symbol: SYMBOL, max_shares: 1, max_buy_quote: MAX_NOTIONAL, max_daily_entries: MAX_DAILY_ENTRIES } };
}

async function historical(request, env, url, h) {
  const end = new Date(url.searchParams.get('end') || Date.now());
  const start = new Date(url.searchParams.get('start') || Date.now() - 60*86400000);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start ||
      end-start > 366*86400000 || +end > Date.now()+60000) {
    return h.json(request, { error: 'invalid_history_window' }, 400);
  }
  const cursor = url.searchParams.get('page_token');
  if (cursor && cursor.length > 2048) return h.json(request, { error: 'invalid_cursor' }, 400);
  const qs = new URLSearchParams({ timeframe: '15Min', start: start.toISOString(), end: end.toISOString(),
    limit: '10000', adjustment: 'raw', feed: 'iex', sort: 'asc' });
  if (cursor) qs.set('page_token', cursor);
  const out = await h.alpaca(`/${SYMBOL}/bars?${qs}`, env);
  if (!out.ok) return h.json(request, { error: out.error }, out.status);
  return h.json(request, { symbol: SYMBOL, timeframe: '15Min', source: 'alpaca-iex',
    next_page_token: out.data.next_page_token || null,
    bars: (out.data.bars || []).map(b => ({ time: Math.floor(Date.parse(b.t)/1000), open: b.o,
      high: b.h, low: b.l, close: b.c, volume: b.v })) });
}

async function reconcile(db, env, h) {
  const { results } = await db.prepare("SELECT client_id FROM brain_orders WHERE status NOT IN ('filled','canceled','expired','rejected')").all();
  for (const row of results || []) {
    const result = await h.alpacaTrade(lookupPath(row.client_id), env);
    // A missing order after a timeout is unresolved, not proof it is safe to
    // submit again. Retain the claim for explicit owner investigation.
    if (!result.ok) return { error: 'order_reconciliation_required' };
    const order = result.data;
    await db.prepare('UPDATE brain_orders SET status = ?, filled_qty = ? WHERE client_id = ?')
      .bind(order.status, Number(order.filled_qty || 0), row.client_id).run();
    if (!TERMINAL.includes(order.status)) return { error: 'order_pending' };
  }
  const totals = await db.prepare("SELECT COALESCE(SUM(CASE WHEN side = 'buy' THEN filled_qty ELSE -filled_qty END),0) AS qty FROM brain_orders").first();
  return { managed: Number(totals.qty) };
}

async function submit(request, env, body, h) {
  const db = env.NOTES_DB;
  const state = await readState(db);
  if (!state.enabled) return h.json(request, { error: 'automation_paused' }, 409);
  if (!state.online || state.report?.mode !== 'paper' ||
      (body.target_position === 1 && state.report?.evaluation?.paper_ready !== true)) {
    return h.json(request, { error: 'runner_or_evaluation_not_ready' }, 409);
  }
  const bar = Date.parse(body.bar_time);
  const age = Date.now() - bar;
  if (!Number.isFinite(bar) || bar % 900000 !== 0 || age < MIN_SIGNAL_AGE_MS || age > (body.target_position === 0 ? 1800000 : 1200000) ||
      ![0, 1].includes(body.target_position) || body.symbol !== SYMBOL ||
      !/^[a-f0-9]{16}$/.test(body.model_id || '')) {
    return h.json(request, { error: 'invalid_or_stale_signal' }, 400);
  }
  const sessionTime = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(bar));
  const minute = Number(sessionTime.find(p => p.type === 'hour').value)*60 + Number(sessionTime.find(p => p.type === 'minute').value);
  if (body.target_position === 1 && (minute < 795 || minute > 915)) return h.json(request, {error: 'outside_entry_window'}, 409);
  const signal = state.report?.signal;
  if (!signal || signal.bar_time !== body.bar_time || signal.model_id !== body.model_id ||
      signal.target_position !== body.target_position || (body.target_position === 1 && signal.distribution_ok !== true) ||
      body.model_id !== state.report.evaluation.model_id) {
    return h.json(request, { error: 'signal_report_mismatch' }, 409);
  }
  const clock = await h.alpacaTrade('/clock', env);
  if (!clock.ok || !clock.data.is_open) return h.json(request, { error: 'market_closed_or_unavailable' }, 409);
  if (body.target_position === 1 && clock.data.next_close && Date.parse(clock.data.next_close)-Date.now() < 1200000) {
    return h.json(request, {error: 'session_ending'}, 409);
  }
  const reconciled = await reconcile(db, env, h);
  if (reconciled.error) return h.json(request, reconciled, 409);
  const [account, positions, openOrders] = await Promise.all([
    h.alpacaTrade('/account', env), h.alpacaTrade('/positions', env),
    h.alpacaTrade('/orders?status=open&limit=500', env),
  ]);
  if (!account.ok || !positions.ok || !openOrders.ok) return h.json(request, { error: 'broker_unavailable' }, 503);
  if (!Array.isArray(positions.data) || !Array.isArray(openOrders.data)) return h.json(request, { error: 'invalid_broker_state' }, 503);
  const a = account.data;
  if (a.trading_blocked || a.account_blocked || a.status !== 'ACTIVE' ||
      !Number.isFinite(Number(a.equity)) || !Number.isFinite(Number(a.last_equity)) ||
      Number(a.last_equity) <= 0 || (body.target_position === 1 && Number(a.equity) < .98*Number(a.last_equity))) {
    return h.json(request, { error: 'account_blocked_or_daily_loss_limit' }, 409);
  }
  if (openOrders.data.some(o => o.symbol === SYMBOL)) return h.json(request, { error: 'symbol_has_open_order' }, 409);
  const position = positions.data.find(p => p.symbol === SYMBOL);
  const held = Number(position?.qty || 0);
  // Never adopt or sell a manually opened position. Halt on account drift.
  if (held !== reconciled.managed || ![0, 1].includes(held)) return h.json(request, { error: 'unmanaged_position_or_position_mismatch' }, 409);
  if (held === body.target_position) return h.json(request, { ok: true, action: 'hold' });
  const side = body.target_position === 1 ? 'buy' : 'sell';
  if (side === 'buy') {
    const quote = await h.alpaca(`/${SYMBOL}/snapshot?feed=iex`, env);
    const price = Number(quote.data?.latestTrade?.p);
    const quoteTime = Date.parse(quote.data?.latestTrade?.t);
    if (!quote.ok || !Number.isFinite(price) || price <= 0 || price > MAX_NOTIONAL ||
        !Number.isFinite(quoteTime) || Date.now()-quoteTime > 180000 || quoteTime > Date.now()+5000 ||
        !Number.isFinite(Number(a.cash)) || Number(a.cash) < price*1.01) {
      return h.json(request, { error: 'price_or_cash_limit' }, 409);
    }
  }
  const clientId = `joyeb-fly-SPY-${Math.floor(bar/1000)}`;
  const latest = await readState(db);
  const ageBeforeClaim = Date.now()-bar;
  if (!latest.enabled) return h.json(request, { error: 'automation_paused' }, 409);
  if (!latest.online || latest.report?.mode !== 'paper' ||
      latest.report?.signal?.model_id !== body.model_id ||
      latest.report?.signal?.bar_time !== body.bar_time ||
      latest.report?.signal?.target_position !== body.target_position ||
      latest.report?.evaluation?.model_id !== body.model_id ||
      (side === 'buy' && (latest.report?.evaluation?.paper_ready !== true || latest.report?.signal?.distribution_ok !== true)) ||
      ageBeforeClaim > (body.target_position === 0 ? 1800000 : 1200000)) {
    return h.json(request, {error: 'signal_expired_during_checks'}, 409);
  }
  const createdAt = new Date().toISOString();
  const dayStart = createdAt.slice(0, 10) + 'T00:00:00.000Z';
  // D1 atomically claims this candle BEFORE any external side effect. The
  // unresolved-order guard inside this statement serializes different candles.
  const claim = await db.prepare(
    "INSERT OR IGNORE INTO brain_orders (client_id,bar_time,side,status,created_at) " +
    "SELECT ?,?,?,'submitting',? WHERE (SELECT enabled FROM brain_control WHERE id=1)=1 " +
    "AND (? = 'sell' OR (SELECT COUNT(*) FROM brain_orders WHERE created_at >= ? AND side='buy') < ?) " +
    "AND NOT EXISTS (SELECT 1 FROM brain_orders WHERE status NOT IN ('filled','canceled','expired','rejected'))")
    .bind(clientId, new Date(bar).toISOString(), side, createdAt, side, dayStart, MAX_DAILY_ENTRIES).run();
  if (!claim.meta?.changes) return h.json(request, { error: 'duplicate_pending_or_daily_limit' }, 409);
  try {
    const result = await h.alpacaTrade('/orders', env, { method: 'POST',
      body: { symbol: SYMBOL, qty: '1', side, type: 'market', time_in_force: 'day', client_order_id: clientId } });
    if (!result.ok) {
      // Ask the broker once. An order that exists (a duplicate client id, or a
      // 5xx after acceptance) is recorded as it stands. A definite 4xx rejection
      // with no order at the broker is final, so later candles, exits included,
      // are not blocked. Anything else stays uncertain until reconciled.
      const found = await h.alpacaTrade(lookupPath(clientId), env);
      if (found.ok && found.data?.status) {
        await db.prepare('UPDATE brain_orders SET status=?, filled_qty=? WHERE client_id=?')
          .bind(found.data.status, Number(found.data.filled_qty || 0), clientId).run();
        return h.json(request, { ok: true, action: side, client_id: clientId, status: found.data.status });
      }
      const definite = found.status === 404 && Number.isInteger(result.status) &&
        result.status >= 400 && result.status < 500 && result.status !== 408;
      await db.prepare('UPDATE brain_orders SET status=? WHERE client_id=?').bind(definite ? 'rejected' : 'unknown', clientId).run();
      if (definite) return h.json(request, { error: 'order_rejected_by_broker', client_id: clientId, broker_status: result.status }, 409);
      return h.json(request, { error: 'submission_uncertain_reconcile_before_retry', client_id: clientId }, 502);
    }
    await db.prepare('UPDATE brain_orders SET status=?, filled_qty=? WHERE client_id=?')
      .bind(result.data.status || 'accepted', Number(result.data.filled_qty || 0), clientId).run();
    return h.json(request, { ok: true, action: side, client_id: clientId, status: result.data.status });
  } catch (_) {
    return h.json(request, { error: 'submission_uncertain_reconcile_before_retry', client_id: clientId }, 502);
  }
}

// Owner-only recovery for a row left uncertain (e.g. a timeout). Never erases the
// ledger: it copies what the broker reports, or records that the broker has no
// such order, so automation can continue without hand-editing the database.
async function resolve(request, env, body, h) {
  const db = env.NOTES_DB;
  const clientId = typeof body.client_id === 'string' ? body.client_id : '';
  if (!CLIENT_ID_RE.test(clientId)) return h.json(request, { error: 'invalid_client_id' }, 400);
  const row = await db.prepare('SELECT status, created_at FROM brain_orders WHERE client_id = ?').bind(clientId).first();
  if (!row) return h.json(request, { error: 'order_not_found' }, 404);
  if (TERMINAL.includes(row.status)) return h.json(request, { error: 'order_already_final', status: row.status }, 409);
  if (!(Date.now() - Date.parse(row.created_at) >= RESOLVE_AFTER_MS)) return h.json(request, { error: 'order_too_recent' }, 409);
  const found = await h.alpacaTrade(lookupPath(clientId), env);
  if (found.ok && found.data?.status) {
    const filled = Number(found.data.filled_qty || 0);
    await db.prepare('UPDATE brain_orders SET status=?, filled_qty=? WHERE client_id=?').bind(found.data.status, filled, clientId).run();
    return h.json(request, { ok: true, client_id: clientId, status: found.data.status, filled_qty: filled, source: 'broker' });
  }
  if (found.status === 404) {
    await db.prepare("UPDATE brain_orders SET status='rejected', filled_qty=0 WHERE client_id=?").bind(clientId).run();
    return h.json(request, { ok: true, client_id: clientId, status: 'rejected', source: 'not_found_at_broker' });
  }
  return h.json(request, { error: 'broker_unavailable' }, 502);
}

export async function handleBrain(request, env, url, h) {
  const path = url.pathname;
  if (path === '/_m/brain/bars' && request.method === 'GET') return historical(request, env, url, h);
  const isPublicStatus = path === '/_m/brain/status' && request.method === 'GET';
  if (!isPublicStatus && !h.ownerOk(request, env)) return h.json(request, { error: 'unauthorized' }, 401);
  if (!env.NOTES_DB) return h.json(request, { error: 'brain_storage_not_configured' }, 503);
  await initialize(env.NOTES_DB);
  if (request.method === 'GET' && ['/_m/brain/status', '/_m/brain/control'].includes(path)) {
    return h.json(request, await readState(env.NOTES_DB));
  }
  if (request.method !== 'POST') return h.json(request, { error: 'not_found' }, 404);
  const raw = await request.text();
  if (raw.length > 100000) return h.json(request, { error: 'report_too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch (_) { return h.json(request, { error: 'bad_json' }, 400); }
  if (!body || Array.isArray(body) || typeof body !== 'object') return h.json(request, { error: 'bad_body' }, 400);
  if (path === '/_m/brain/report') {
    if (!['observe', 'paper'].includes(body.mode) || body.evaluation?.symbol !== SYMBOL ||
        typeof body.evaluation?.paper_ready !== 'boolean' ||
        (body.signal && typeof body.signal.distribution_ok !== 'boolean') ||
        !/^[a-f0-9]{16}$/.test(body.evaluation?.model_id || '')) return h.json(request, { error: 'invalid_report' }, 400);
    // The owner-controlled runner publishes only this explicit public payload.
    const report = { mode: body.mode, evaluation: body.evaluation, signal: body.signal || null,
      event: String(body.event || '').slice(0, 200), error: body.error ? String(body.error).slice(0, 200) : null };
    await env.NOTES_DB.prepare('INSERT INTO brain_report (id,payload,seen_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, seen_at=excluded.seen_at')
      .bind(JSON.stringify(report), new Date().toISOString()).run();
    return h.json(request, { ok: true });
  }
  if (path === '/_m/brain/control') {
    if (typeof body.enabled !== 'boolean') return h.json(request, { error: 'enabled_must_be_boolean' }, 400);
    const state = await readState(env.NOTES_DB);
    if (body.enabled && (!state.online || state.report?.evaluation?.paper_ready !== true || state.report?.mode !== 'paper')) {
      return h.json(request, { error: 'paper_runner_and_evaluation_required' }, 409);
    }
    await env.NOTES_DB.prepare('UPDATE brain_control SET enabled=? WHERE id=1').bind(body.enabled ? 1 : 0).run();
    return h.json(request, { ok: true, enabled: body.enabled });
  }
  if (path === '/_m/brain/order') return submit(request, env, body, h);
  if (path === '/_m/brain/resolve') return resolve(request, env, body, h);
  return h.json(request, { error: 'not_found' }, 404);
}
