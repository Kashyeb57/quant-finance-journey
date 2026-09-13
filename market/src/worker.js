/**
 * Live market data proxy for joyebkashyeb.com.np
 * ---------------------------------------------
 * Runs as a Cloudflare Worker on the route  joyebkashyeb.com.np/_m/*
 * (everything else on the domain passes straight through to GitHub Pages).
 *
 *   GET /_m/bars?symbol=AAPL&tf=1Min      -> OHLC candles for the chart
 *   GET /_m/snapshot?symbol=AAPL          -> latest trade + day change (price header)
 *   GET /_m/stream?symbol=AAPL  (WebSocket) -> live trades relayed from Alpaca's
 *                                             IEX stream (auth done server-side)
 *
 * Why a Worker: Alpaca requires an API key AND secret. Putting those in the
 * site's JavaScript would expose them to everyone. Here they live as Worker
 * secrets (set with `wrangler secret put`), so the browser only ever talks to
 * our own domain and never sees the credentials.
 *
 * Secrets used:  ALPACA_KEY_ID , ALPACA_SECRET_KEY
 *   TRADE_TOKEN  — owner-only passphrase gating POST /_m/order and /_m/cancel.
 *                  Set with `wrangler secret put TRADE_TOKEN`. Without it, the
 *                  write endpoints reject everything (read endpoints unaffected).
 */

const ALPACA = 'https://data.alpaca.markets/v2/stocks';
// Paper TRADING API — the account + open positions for the portfolio panel.
// (Live trading would be api.alpaca.markets; we deliberately use the paper
// endpoint so nothing here can ever touch real money.)
const ALPACA_PAPER = 'https://paper-api.alpaca.markets/v2';

const ALLOWED_ORIGINS = [
  'https://joyebkashyeb.com.np',
  'http://localhost:3000',
];

const TIMEFRAMES = {
  '1Min':  { tf: '1Min',  lookbackMs: 2 * 24 * 3600e3,   cache: 10 },
  '3Min':  { tf: '3Min',  lookbackMs: 5 * 24 * 3600e3,   cache: 12 },
  '5Min':  { tf: '5Min',  lookbackMs: 7 * 24 * 3600e3,   cache: 20 },
  '15Min': { tf: '15Min', lookbackMs: 20 * 24 * 3600e3,  cache: 30 },
  '1Hour': { tf: '1Hour', lookbackMs: 45 * 24 * 3600e3,  cache: 45 },
  '1Day':  { tf: '1Day',  lookbackMs: 400 * 24 * 3600e3, cache: 300 },
};

const SYMBOL_RE = /^[A-Z.]{1,10}$/;

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Trade-Token',
    'Vary': 'Origin',
  };
}

function json(request, body, status = 200, cacheSeconds = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
      ...corsHeaders(request),
    },
  });
}

// Belt-and-braces: several handlers forward an upstream error body to the
// browser, because messages like "insufficient buying power" are genuinely
// useful. Alpaca does not echo credentials in its errors — but "the upstream
// won't" is a trust assumption, not a guarantee, so strip the values before any
// upstream text can leave this Worker. Cheap, and makes the leak impossible
// rather than unlikely.
function scrub(text, env) {
  let t = text || '';
  for (const secret of [env.ALPACA_KEY_ID, env.ALPACA_SECRET_KEY, env.TRADE_TOKEN]) {
    if (secret && secret.length >= 8) t = t.split(secret).join('[redacted]');
  }
  return t;
}

async function alpaca(path, env) {
  if (!env.ALPACA_KEY_ID || !env.ALPACA_SECRET_KEY) {
    return { ok: false, status: 503, error: 'Worker is missing Alpaca credentials.' };
  }
  const res = await fetch(`${ALPACA}${path}`, {
    headers: {
      'APCA-API-KEY-ID': env.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': env.ALPACA_SECRET_KEY,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const text = scrub(await res.text().catch(() => ''), env);
    return { ok: false, status: res.status, error: text.slice(0, 300) || 'Upstream error' };
  }
  return { ok: true, data: await res.json() };
}

// Same auth, but against the PAPER TRADING base. GET by default; pass
// { method, body } for writes (order placement / cancel). A 204 (cancel) comes
// back as an empty object so callers can treat every ok result uniformly.
async function alpacaTrade(path, env, init) {
  if (!env.ALPACA_KEY_ID || !env.ALPACA_SECRET_KEY) {
    return { ok: false, status: 503, error: 'not_connected' };
  }
  const headers = {
    'APCA-API-KEY-ID': env.ALPACA_KEY_ID,
    'APCA-API-SECRET-KEY': env.ALPACA_SECRET_KEY,
    'Accept': 'application/json',
  };
  const opt = { headers };
  if (init && init.method) {
    opt.method = init.method;
    if (init.body != null) {
      headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(init.body);
    }
  }
  const res = await fetch(`${ALPACA_PAPER}${path}`, opt);
  if (!res.ok) {
    const text = scrub(await res.text().catch(() => ''), env);
    return { ok: false, status: res.status, error: text.slice(0, 300) || 'Upstream error' };
  }
  const ct = res.headers.get('content-type') || '';
  const data = res.status === 204 || !ct.includes('json') ? {} : await res.json().catch(() => ({}));
  return { ok: true, status: res.status, data };
}

// Owner gate for the write endpoints. The passphrase lives ONLY as the
// TRADE_TOKEN Worker secret and in the owner's browser — never in the bundle.
// Constant-time compare so a wrong token can't be timed out character by char.
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function ownerOk(request, env) {
  return !!env.TRADE_TOKEN && safeEq(request.headers.get('X-Trade-Token') || '', env.TRADE_TOKEN);
}

// POST /_m/order — owner-only. Places a MARKET, whole-share, day order on the
// PAPER account. Never touches real money (paper base URL). Rejects anything
// without a valid TRADE_TOKEN.
async function handleOrder(request, env) {
  if (!ownerOk(request, env)) return json(request, { error: 'unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch (_) { return json(request, { error: 'bad_json' }, 400); }
  const symbol = String(body.symbol || '').toUpperCase();
  const side = body.side === 'sell' ? 'sell' : 'buy';
  const qty = Math.floor(Number(body.qty));
  if (!SYMBOL_RE.test(symbol)) return json(request, { error: 'bad_symbol' }, 400);
  if (!Number.isFinite(qty) || qty < 1 || qty > 100000) return json(request, { error: 'bad_qty' }, 400);

  const out = await alpacaTrade('/orders', env, {
    method: 'POST',
    body: { symbol, qty: String(qty), side, type: 'market', time_in_force: 'day' },
  });
  if (!out.ok) return json(request, { error: out.error }, out.status === 503 ? 503 : 400);
  const o = out.data || {};
  return json(request, {
    ok: true,
    order: { id: o.id, symbol: o.symbol, side: o.side, qty: numOr(o.qty), type: o.type, status: o.status, submittedAt: o.submitted_at },
  });
}

// POST /_m/cancel — owner-only. Cancels a still-open order by id.
async function handleCancel(request, env) {
  if (!ownerOk(request, env)) return json(request, { error: 'unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch (_) { return json(request, { error: 'bad_json' }, 400); }
  const id = String(body.id || '');
  if (!/^[a-f0-9-]{10,60}$/i.test(id)) return json(request, { error: 'bad_id' }, 400);
  const out = await alpacaTrade(`/orders/${id}`, env, { method: 'DELETE' });
  if (!out.ok) return json(request, { error: out.error }, out.status === 503 ? 503 : 400);
  return json(request, { ok: true });
}

async function handleBars(request, env, url) {
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
  const tfKey = url.searchParams.get('tf') || '1Min';
  if (!SYMBOL_RE.test(symbol)) return json(request, { error: 'Bad symbol' }, 400);
  const conf = TIMEFRAMES[tfKey];
  if (!conf) return json(request, { error: 'Bad timeframe' }, 400);

  const start = new Date(Date.now() - conf.lookbackMs).toISOString();
  const qs = new URLSearchParams({
    timeframe: conf.tf,
    start,
    limit: '1000',
    adjustment: 'raw',
    feed: 'iex',
    sort: 'asc',
  });

  const out = await alpaca(`/${symbol}/bars?${qs}`, env);
  if (!out.ok) return json(request, { error: out.error }, out.status);

  const bars = (out.data.bars || []).map((b) => ({
    time: Math.floor(new Date(b.t).getTime() / 1000),
    open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
  }));
  return json(request, { symbol, tf: tfKey, bars }, 200, conf.cache);
}

async function handleSnapshot(request, env, url) {
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return json(request, { error: 'Bad symbol' }, 400);

  const out = await alpaca(`/${symbol}/snapshot?feed=iex`, env);
  if (!out.ok) return json(request, { error: out.error }, out.status);

  const d = out.data || {};
  const last = (d.latestTrade && d.latestTrade.p) || (d.minuteBar && d.minuteBar.c) || (d.dailyBar && d.dailyBar.c) || null;
  const prevClose = (d.prevDailyBar && d.prevDailyBar.c) || null;
  const change = last != null && prevClose != null ? last - prevClose : null;
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null;

  return json(request, {
    symbol,
    last,
    prevClose,
    change,
    changePct,
    dayOpen: (d.dailyBar && d.dailyBar.o) || null,
    dayHigh: (d.dailyBar && d.dailyBar.h) || null,
    dayLow: (d.dailyBar && d.dailyBar.l) || null,
    volume: (d.dailyBar && d.dailyBar.v) || null,
    at: (d.latestTrade && d.latestTrade.t) || null,
  }, 200, 5);
}

// The paper-trading account + open positions for the terminal's portfolio
// panel. Read-only: it never places or cancels orders. Returns a graceful
// { error: 'not_connected' } (HTTP 200) when no paper keys are configured, so
// the UI can show a friendly "not connected yet" state instead of an error.
const numOr = (v, d = null) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

function shapeAccount(a) {
  const equity = numOr(a.equity);
  const lastEquity = numOr(a.last_equity);
  const dayPL = equity != null && lastEquity != null ? equity - lastEquity : null;
  return {
    equity,
    lastEquity,
    cash: numOr(a.cash),
    buyingPower: numOr(a.buying_power),
    portfolioValue: numOr(a.portfolio_value),
    dayPL,
    dayPLpct: dayPL != null && lastEquity ? (dayPL / lastEquity) * 100 : null,
    status: a.status || null,
    currency: a.currency || 'USD',
  };
}

function shapePosition(p) {
  return {
    symbol: p.symbol,
    qty: numOr(p.qty, 0),
    side: p.side || 'long',
    avgEntry: numOr(p.avg_entry_price),
    price: numOr(p.current_price),
    marketValue: numOr(p.market_value),
    costBasis: numOr(p.cost_basis),
    unrealizedPL: numOr(p.unrealized_pl),
    unrealizedPLpct: numOr(p.unrealized_plpc) != null ? numOr(p.unrealized_plpc) * 100 : null,
    changeToday: numOr(p.change_today) != null ? numOr(p.change_today) * 100 : null,
  };
}

const softAuth = (s) => s === 503 || s === 401 || s === 403;

async function handlePortfolio(request, env) {
  const [acct, pos] = await Promise.all([
    alpacaTrade('/account', env),
    alpacaTrade('/positions', env),
  ]);

  if (!acct.ok) {
    // 503 = no keys set; 401/403 = keys aren't valid paper keys. Both surface
    // as a soft "not connected" so the panel degrades cleanly.
    return json(request, { error: softAuth(acct.status) ? 'not_connected' : acct.error }, softAuth(acct.status) ? 200 : acct.status);
  }

  const positions = ((pos.ok && Array.isArray(pos.data)) ? pos.data : [])
    .map(shapePosition)
    .sort((x, y) => Math.abs(y.marketValue || 0) - Math.abs(x.marketValue || 0));

  return json(request, {
    account: shapeAccount(acct.data || {}),
    positions,
    asOf: new Date().toISOString(),
  }, 200, 10);
}

// The full ledger for the Portfolio page: account, open positions, order
// history, realized/closed round-trips (FIFO, computed from fills), and the
// equity curve. Read-only. Soft "not_connected" when no paper keys.
async function handleLedger(request, env) {
  const [acctR, posR, ordR, actR, histR] = await Promise.all([
    alpacaTrade('/account', env),
    alpacaTrade('/positions', env),
    alpacaTrade('/orders?status=all&limit=100&direction=desc', env),
    alpacaTrade('/account/activities/FILL?page_size=500', env),
    alpacaTrade('/account/portfolio/history?period=3M&timeframe=1D', env),
  ]);

  if (!acctR.ok) {
    return json(request, { error: softAuth(acctR.status) ? 'not_connected' : acctR.error }, softAuth(acctR.status) ? 200 : acctR.status);
  }

  const account = shapeAccount(acctR.data || {});
  const positions = ((posR.ok && Array.isArray(posR.data)) ? posR.data : [])
    .map(shapePosition)
    .sort((x, y) => Math.abs(y.marketValue || 0) - Math.abs(x.marketValue || 0));

  const orders = ((ordR.ok && Array.isArray(ordR.data)) ? ordR.data : []).map((o) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    qty: numOr(o.qty) != null ? numOr(o.qty) : numOr(o.filled_qty, 0),
    filledQty: numOr(o.filled_qty, 0),
    type: o.type || o.order_type || 'market',
    status: o.status,
    limitPrice: numOr(o.limit_price),
    filledAvgPrice: numOr(o.filled_avg_price),
    submittedAt: o.submitted_at || o.created_at || null,
    filledAt: o.filled_at || null,
  }));

  // FIFO realized P/L from fills — handles both long and short round-trips.
  const fills = ((actR.ok && Array.isArray(actR.data)) ? actR.data : [])
    .filter((f) => f.symbol && f.price != null && f.qty != null)
    .sort((a, b) => new Date(a.transaction_time) - new Date(b.transaction_time));

  const book = {}; // symbol -> [{ qty (signed), price }]
  const closes = [];
  let realizedTotal = 0;
  for (const f of fills) {
    const sym = f.symbol;
    const price = numOr(f.price, 0);
    const dir = f.side === 'buy' ? 1 : -1;
    let remaining = numOr(f.qty, 0);
    if (!book[sym]) book[sym] = [];
    const lots = book[sym];
    // Close against opposite-signed lots first (FIFO).
    while (remaining > 1e-9 && lots.length && Math.sign(lots[0].qty) === -dir) {
      const lot = lots[0];
      const matched = Math.min(remaining, Math.abs(lot.qty));
      const pl = lot.qty > 0 ? (price - lot.price) * matched : (lot.price - price) * matched;
      realizedTotal += pl;
      closes.push({
        symbol: sym,
        side: lot.qty > 0 ? 'long' : 'short',
        qty: matched,
        entry: lot.price,
        exit: price,
        pl,
        plpct: lot.price ? (pl / (lot.price * matched)) * 100 : null,
        closedAt: f.transaction_time,
      });
      lot.qty += dir * matched;
      remaining -= matched;
      if (Math.abs(lot.qty) < 1e-9) lots.shift();
    }
    // Any leftover opens a new lot in the fill's direction.
    if (remaining > 1e-9) lots.push({ qty: dir * remaining, price });
  }
  closes.reverse(); // newest first

  // Equity curve from portfolio history.
  const h = histR.ok ? (histR.data || {}) : {};
  const ts = Array.isArray(h.timestamp) ? h.timestamp : [];
  const eq = Array.isArray(h.equity) ? h.equity : [];
  const history = [];
  for (let i = 0; i < ts.length; i++) {
    if (eq[i] != null) history.push({ t: ts[i], value: numOr(eq[i]) });
  }

  return json(request, {
    account,
    positions,
    orders,
    closed: closes.slice(0, 100),
    realizedTotal,
    history,
    baseValue: numOr(h.base_value),
    asOf: new Date().toISOString(),
  }, 200, 12);
}

// WebSocket proxy: browser <-> this Worker <-> Alpaca's live trade stream.
// The Alpaca key/secret are used only here (server-side) to authenticate the
// upstream connection; the browser never sees them.
// WebSocket relay for Alpaca's IEX trade stream.
//
// ⚠️ TWO LIMITS TO KNOW BEFORE CHANGING THIS:
//
// 1. CORS DOES NOT APPLY TO WEBSOCKETS. The browser's same-origin policy is not
//    enforced on a WS handshake, so `corsHeaders()` protects nothing here. The
//    Origin check below is explicit for that reason. It stops another site from
//    embedding this feed; it is NOT authentication, because a non-browser client
//    can send whatever Origin it likes. Treat it as hotlink protection.
//
// 2. EVERY CONNECTION OPENS ITS OWN UPSTREAM SOCKET, and Alpaca's free tier
//    allows ONE concurrent connection per account. So two simultaneous visitors
//    means the second gets Alpaca error 406 and no live trades. Fixing that
//    properly needs a Durable Object holding ONE upstream connection and fanning
//    it out to every client — a real change (wrangler.toml + a migration), not a
//    patch. Until then the handler at least reports the limit clearly instead of
//    failing silently, and the client stops hammering it.
async function handleStream(request, env, url) {
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
    return json(request, { error: 'Expected a WebSocket upgrade' }, 426);
  }
  // Reject a foreign Origin, but allow a missing one: browsers always send it on
  // a WS handshake, so a mismatch means someone else's page. Demanding its
  // presence would buy nothing (a script can forge it) while risking the real
  // site if anything upstream ever strips the header.
  const origin = request.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json(request, { error: 'Origin not allowed' }, 403);
  }
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return json(request, { error: 'Bad symbol' }, 400);
  if (!env.ALPACA_KEY_ID || !env.ALPACA_SECRET_KEY) {
    return json(request, { error: 'Worker is missing Alpaca credentials.' }, 503);
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  const send = (obj) => { try { server.send(JSON.stringify(obj)); } catch (_) {} };

  let upstream = null;
  try {
    const resp = await fetch('https://stream.data.alpaca.markets/v2/iex', {
      headers: { Upgrade: 'websocket' },
    });
    upstream = resp.webSocket;
  } catch (_) {
    upstream = null;
  }
  if (!upstream) {
    send({ type: 'error', msg: 'Could not reach the data stream.' });
    try { server.close(1011, 'upstream failed'); } catch (_) {}
    return new Response(null, { status: 101, webSocket: client });
  }
  upstream.accept();

  upstream.addEventListener('message', (ev) => {
    let msgs;
    try { msgs = JSON.parse(ev.data); } catch (_) { return; }
    if (!Array.isArray(msgs)) return;
    for (const m of msgs) {
      if (m.T === 'success' && m.msg === 'connected') {
        upstream.send(JSON.stringify({ action: 'auth', key: env.ALPACA_KEY_ID, secret: env.ALPACA_SECRET_KEY }));
      } else if (m.T === 'success' && m.msg === 'authenticated') {
        upstream.send(JSON.stringify({ action: 'subscribe', trades: [symbol] }));
        send({ type: 'ready' });
      } else if (m.T === 't') {
        send({
          type: 'trade',
          price: m.p,
          size: m.s,
          time: m.t ? Math.floor(new Date(m.t).getTime() / 1000) : Math.floor(Date.now() / 1000),
        });
      } else if (m.T === 'error') {
        // Alpaca's codes: 406 = connection limit reached (the free tier's single
        // connection is already in use), 401/402 = auth rejected. None of those
        // clear up on an immediate retry, so say so and let the client stand
        // down instead of reconnecting every few seconds forever.
        const fatal = m.code === 406 || m.code === 401 || m.code === 402;
        send({
          type: 'error',
          msg: m.code === 406
            ? 'The live feed is already in use (one connection at a time).'
            : (m.msg || 'stream error'),
          code: m.code,
          fatal,
        });
        if (fatal) { try { server.close(4406, 'upstream refused'); } catch (_) {} }
      }
    }
  });
  upstream.addEventListener('close', () => { try { server.close(); } catch (_) {} });
  upstream.addEventListener('error', () => { try { server.close(); } catch (_) {} });
  server.addEventListener('close', () => { try { upstream.close(); } catch (_) {} });
  server.addEventListener('error', () => { try { upstream.close(); } catch (_) {} });

  return new Response(null, { status: 101, webSocket: client });
}

// ─── Gamma exposure (GEX) from CBOE's free delayed options feed ──────────────
// Full chain with per-strike open_interest + gamma, no auth. We compute net
// dealer gamma by strike (calls +, puts −, the standard convention), the total
// GEX, the gamma-flip / zero-gamma price (BSM re-compute across spot), and the
// call/put "walls" (largest gamma·OI strikes). Result is cached ~10 min (the
// feed is delayed and open interest is end-of-day, so this is plenty fresh).
const CBOE = 'https://cdn.cboe.com/api/global/delayed_quotes/options';
const CBOE_INDEXES = ['SPX', 'VIX', 'NDX', 'RUT', 'XSP', 'DJX', 'XEO', 'OEX'];

function normPdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }
function bsmGamma(S, K, T, sigma, r) {
  if (!(T > 0) || !(sigma > 0) || !(S > 0)) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return normPdf(d1) / (S * sigma * Math.sqrt(T));
}
// OCC symbol: ROOT + YYMMDD + [C|P] + strike×1000 (8 digits)
function parseOcc(s) {
  const m = /^[A-Z]+(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(s || '');
  if (!m) return null;
  return {
    type: m[4] === 'C' ? 'call' : 'put',
    strike: parseInt(m[5], 10) / 1000,
    expiryMs: Date.UTC(2000 + +m[1], +m[2] - 1, +m[3]),
  };
}

// Near-money option chain from CBOE's free delayed feed (~15-min delayed).
async function chainFromCboe(symbol, dayStart) {
  const path = (CBOE_INDEXES.includes(symbol) ? '_' : '') + symbol;
  const res = await fetch(`${CBOE}/${path}.json`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    cf: { cacheTtl: 120, cacheEverything: true },
  });
  if (!res.ok) return null;
  const data = (await res.json()).data || {};
  const spot = numOr(data.current_price);
  const opts = Array.isArray(data.options) ? data.options : [];
  if (!spot || !opts.length) return null;
  const lo = spot * 0.85, hi = spot * 1.15;
  const contracts = [];
  for (const o of opts) {
    const oi = numOr(o.open_interest, 0);
    if (!oi) continue;
    const p = parseOcc(o.option);
    if (!p || p.strike < lo || p.strike > hi || p.expiryMs < dayStart) continue;
    contracts.push({ k: p.strike, type: p.type, oi, iv: numOr(o.iv, 0), gamma: numOr(o.gamma, 0), expMs: p.expiryMs });
  }
  return { spot, contracts, source: 'cboe' };
}

// Near-money option chain from Polygon.io (paid; real-time OI + greeks + IV).
// Active only when POLYGON_KEY is set; on any failure the caller falls back to
// CBOE, so a missing/bad key never breaks the endpoint.
async function chainFromPolygon(symbol, key, winDays, dayStart) {
  const base = 'https://api.polygon.io/v3/snapshot/options/' + symbol;
  const auth = (u) => u + (u.includes('?') ? '&' : '?') + 'apiKey=' + key;
  const s0 = await fetch(auth(base + '?limit=1'));
  if (!s0.ok) return null;
  const first = ((await s0.json()).results || [])[0];
  const spot = first && first.underlying_asset ? numOr(first.underlying_asset.price) : null;
  if (!spot) return null;
  const cutoff = new Date(Date.now() + Math.max(winDays, 2) * 86400000).toISOString().slice(0, 10);
  const lo = Math.floor(spot * 0.85), hi = Math.ceil(spot * 1.15);
  let u = auth(`${base}?strike_price.gte=${lo}&strike_price.lte=${hi}&expiration_date.lte=${cutoff}&limit=250`);
  const contracts = [];
  for (let pages = 0; u && pages < 8; pages++) {
    const res = await fetch(u);
    if (!res.ok) break;
    const j = await res.json();
    for (const rr of (j.results || [])) {
      const d = rr.details || {}, g = rr.greeks || {};
      const oi = numOr(rr.open_interest, 0);
      if (!oi || !d.expiration_date) continue;
      const expMs = Date.parse(d.expiration_date + 'T00:00:00Z');
      if (expMs < dayStart) continue;
      contracts.push({
        k: numOr(d.strike_price),
        type: d.contract_type === 'put' ? 'put' : 'call',
        oi, iv: numOr(rr.implied_volatility, 0), gamma: numOr(g.gamma, 0), expMs,
      });
    }
    u = j.next_url ? auth(j.next_url) : null;
  }
  return contracts.length ? { spot, contracts, source: 'polygon' } : null;
}

async function handleGex(request, env, url) {
  const symbol = (url.searchParams.get('symbol') || '').toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return json(request, { error: 'Bad symbol' }, 400);
  const exp = (url.searchParams.get('exp') || 'day').toLowerCase();
  const WINDOW = { day: 1.5, week: 7, '15d': 15, '30d': 30 };
  const winDays = WINDOW[exp] || 1.5;

  // Edge-cached because the option-chain maths is expensive. NOTE: a cached
  // response carries the CORS headers of whichever request first populated it,
  // and `corsHeaders()` echoes the *caller's* Origin. Returning the hit verbatim
  // therefore hands a later caller someone else's Access-Control-Allow-Origin.
  // Production never notices (same-origin fetches ignore CORS), but `npm start`
  // on localhost calls production cross-origin, so the GEX panel breaks there
  // intermittently depending on which origin warmed that colo's cache. Re-wrap
  // the cached body with this request's headers instead.
  const cache = caches.default;
  const cacheKey = new Request(`https://gex.internal/${symbol}/${exp}`);
  const hit = await cache.match(cacheKey);
  if (hit) {
    return new Response(await hit.text(), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': hit.headers.get('Cache-Control') || 'no-store',
        ...corsHeaders(request),
      },
    });
  }

  const now = Date.now();
  const dayStart = now - (now % 86400000);
  const r = 0.045;

  // real-time via Polygon.io when POLYGON_KEY is set; else free ~15-min CBOE
  let chain = null;
  if (env.POLYGON_KEY) {
    try { chain = await chainFromPolygon(symbol, env.POLYGON_KEY, winDays, dayStart); } catch (_) {}
  }
  if (!chain) chain = await chainFromCboe(symbol, dayStart);
  if (!chain || !chain.contracts.length) return json(request, { error: `no options data for ${symbol}` }, 404);

  const spot = chain.spot;
  const source = chain.source;
  const all = chain.contracts;
  let frontExp = Infinity;
  for (const c of all) if (c.expMs < frontExp) frontExp = c.expMs;
  // 'day' = the nearest expiry only (0DTE focus); else everything ≤ window
  const cutoff = now + winDays * 86400000;
  const keep = all.filter((c) => (exp === 'day' ? c.expMs === frontExp : c.expMs <= cutoff));

  // aggregate to per (strike, expiry) rows so the browser can re-compute the
  // flip + walls at the LIVE spot every tick (open interest is fixed intraday).
  const rowMap = new Map();
  const expiries = new Set();
  for (const c of keep) {
    expiries.add(c.expMs);
    const key = c.k + '|' + c.expMs;
    let row = rowMap.get(key);
    if (!row) { row = { k: c.k, e: c.expMs, coi: 0, poi: 0, civ: 0, piv: 0 }; rowMap.set(key, row); }
    if (c.type === 'call') { row.coi += c.oi; if (c.iv) row.civ = c.iv; }
    else { row.poi += c.oi; if (c.iv) row.piv = c.iv; }
  }
  let rows = [...rowMap.values()];
  if (rows.length > 600) rows = rows.sort((a, b) => (b.coi + b.poi) - (a.coi + a.poi)).slice(0, 600);

  // server-side flip/walls at the delayed CBOE spot — initial paint before the
  // client's first live re-compute.
  const SCALE = 100 * spot * spot * 0.01;
  const byStrike = new Map();
  let netGex = 0;
  for (const c of keep) {
    netGex += (c.type === 'call' ? 1 : -1) * c.gamma * c.oi * SCALE;
    const rec = byStrike.get(c.k) || { call: 0, put: 0 };
    rec[c.type] += c.gamma * c.oi;
    byStrike.set(c.k, rec);
  }
  let callWall = null, putWall = null, cw = 0, pw = 0;
  for (const [k, rec] of byStrike) {
    if (rec.call > cw) { cw = rec.call; callWall = k; }
    if (rec.put > pw) { pw = rec.put; putWall = k; }
  }
  const gexAt = (S) => {
    let sum = 0;
    for (const c of keep) {
      const T = Math.max((c.expMs - now) / 86400000, 0.25) / 365;
      sum += (c.type === 'call' ? 1 : -1) * bsmGamma(S, c.k, T, c.iv, r) * c.oi;
    }
    return sum;
  };
  let gammaFlip = null, pS = spot * 0.88, pV = gexAt(pS);
  for (let i = 1; i <= 40; i++) {
    const S = spot * 0.88 + spot * 0.24 * (i / 40), v = gexAt(S);
    if ((pV < 0 && v >= 0) || (pV > 0 && v <= 0)) { gammaFlip = v === pV ? pS : pS + (S - pS) * (-pV) / (v - pV); break; }
    pS = S; pV = v;
  }

  const out = {
    symbol, exp, spot, source, asOf: new Date().toISOString(),
    netGex: Math.round(netGex),
    gammaFlip: gammaFlip ? Math.round(gammaFlip * 100) / 100 : null,
    regime: gammaFlip == null ? null : (spot >= gammaFlip ? 'positive' : 'negative'),
    callWall, putWall,
    expiries: [...expiries].sort((a, b) => a - b),
    rows,
  };
  const resp = json(request, out, 200, source === 'polygon' ? 20 : 300);
  await cache.put(cacheKey, resp.clone());
  return resp;
}

// GET /_m/quote?symbols=AMD,^KS11,GC=F,JPY=X
// Quotes for the homepage watchlist, routed per symbol so every row can say
// where its own number came from:
//   * plain US equity tickers            -> ALPACA snapshot, IEX feed (real time)
//   * everything else (^index, =F, =X)   -> Yahoo v8 chart (delayed ~15 min)
// Alpaca carries US equities only, so a mixed board (stocks + a foreign index +
// gold + a forex pair) cannot come from a single source. Each quote carries its
// own `source` and `delayed` flag so the UI can label rows honestly instead of
// implying the whole board is live. The equities go out as ONE batched Alpaca
// snapshots call, not one request per symbol.
const YF_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const YF_SYM_RE = /^[A-Za-z0-9.^=-]{1,12}$/;
// Alpaca-eligible: letters only, 1-5 chars. Excludes ^KS11, GC=F, JPY=X.
const ALPACA_EQUITY_RE = /^[A-Z]{1,5}$/;

// One snapshots call for every US equity on the board. Returns a map of
// symbol -> quote; symbols Alpaca has no data for are simply absent, so the
// caller falls back to Yahoo for them.
async function quotesFromAlpaca(syms, env) {
  const out = {};
  if (!syms.length) return out;
  const res = await alpaca(`/snapshots?symbols=${syms.join(',')}&feed=iex`, env);
  if (!res.ok) return out;
  // The endpoint has returned both a bare map and a { snapshots: {...} }
  // envelope across API revisions; accept either.
  const snaps = (res.data && res.data.snapshots) || res.data || {};
  for (const sym of syms) {
    const d = snaps[sym];
    if (!d) continue;
    const price = (d.latestTrade && d.latestTrade.p)
      || (d.minuteBar && d.minuteBar.c)
      || (d.dailyBar && d.dailyBar.c)
      || null;
    if (typeof price !== 'number') continue;
    const prevClose = (d.prevDailyBar && d.prevDailyBar.c) || null;
    out[sym] = {
      symbol: sym,
      price,
      changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
      prevClose,
      currency: 'USD',
      source: 'alpaca-iex',
      delayed: false,
      at: (d.latestTrade && d.latestTrade.t) || null,
    };
  }
  return out;
}

async function quoteFromYahoo(sym) {
  try {
    const r = await fetch(`${YF_CHART}${encodeURIComponent(sym)}?range=1d&interval=1d`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; quant-desk/1.0)' },
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
    if (!m || typeof m.regularMarketPrice !== 'number') return null;
    return {
      symbol: sym,
      price: m.regularMarketPrice,
      changePct: typeof m.regularMarketChangePercent === 'number' ? m.regularMarketChangePercent : null,
      prevClose: typeof m.chartPreviousClose === 'number' ? m.chartPreviousClose : null,
      currency: m.currency || null,
      source: 'yahoo',
      delayed: true,
      at: typeof m.regularMarketTime === 'number' ? new Date(m.regularMarketTime * 1000).toISOString() : null,
    };
  } catch (e) {
    return null;
  }
}

async function handleQuotes(request, env, url) {
  const raw = (url.searchParams.get('symbols') || '').trim();
  const symbols = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 16);
  if (!symbols.length || !symbols.every((s) => YF_SYM_RE.test(s))) {
    return json(request, { error: 'Bad symbols' }, 400);
  }

  const equities = [...new Set(
    symbols.map((s) => s.toUpperCase()).filter((s) => ALPACA_EQUITY_RE.test(s))
  )];
  const live = await quotesFromAlpaca(equities, env);

  const quotes = await Promise.all(symbols.map(async (sym) => {
    const hit = live[sym.toUpperCase()];
    if (hit) return { ...hit, symbol: sym };
    const y = await quoteFromYahoo(sym);
    return y || {
      symbol: sym,
      price: null,
      changePct: null,
      prevClose: null,
      currency: null,
      source: null,
      delayed: null,
    };
  }));

  return json(request, {
    quotes,
    sources: [...new Set(quotes.map((q) => q.source).filter(Boolean))],
    anyDelayed: quotes.some((q) => q.delayed === true),
    asOf: new Date().toISOString(),
  }, 200, 60);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/_m/stream') return handleStream(request, env, url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Owner-only writes — token-gated inside each handler.
    if (request.method === 'POST') {
      if (url.pathname === '/_m/order')  return handleOrder(request, env);
      if (url.pathname === '/_m/cancel') return handleCancel(request, env);
      return json(request, { error: 'Not found' }, 404);
    }
    if (request.method !== 'GET') {
      return json(request, { error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/_m/bars')      return handleBars(request, env, url);
    if (url.pathname === '/_m/snapshot')  return handleSnapshot(request, env, url);
    if (url.pathname === '/_m/quote')     return handleQuotes(request, env, url);
    if (url.pathname === '/_m/portfolio') return handlePortfolio(request, env);
    if (url.pathname === '/_m/ledger')    return handleLedger(request, env);
    if (url.pathname === '/_m/gex')       return handleGex(request, env, url);
    if (url.pathname === '/_m/health')    return json(request, { ok: true });

    return json(request, { error: 'Not found' }, 404);
  },
};
