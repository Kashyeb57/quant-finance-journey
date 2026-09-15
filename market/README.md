# Market data Worker

Feeds the live Terminal at `/terminal` with real prices.

The site is a static build on GitHub Pages, so it cannot keep an API secret.
This Worker sits on your own domain, holds the Alpaca credentials as Cloudflare
secrets, and hands the browser only the data it needs.

```
browser  ──►  joyebkashyeb.com.np/_m/*  (this Worker, holds the keys)  ──►  Alpaca
```

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET /_m/bars?symbol=AAPL&tf=1Min` | OHLC candles for the chart. `tf` = `1Min`, `5Min`, `1Hour`, `1Day` |
| `GET /_m/snapshot?symbol=AAPL` | Last trade, previous close, day change — powers the price header |
| `GET /_m/portfolio` | **Read-only** paper account (equity + open positions) — powers the Portfolio panel under the terminal chart. Never places or cancels orders. |
| `GET /_m/health` | Returns `{ok:true}`; handy to confirm the deploy worked |

## One-time setup

1. **Get free Alpaca keys** — sign up at <https://alpaca.markets>, open
   *Paper Trading → API Keys*, and generate a key. Paper keys work fine for
   market data; no funding or live account is required.

2. **Install wrangler and log in**

   ```bash
   npm i -g wrangler
   wrangler login
   ```

3. **Store the credentials as secrets** (run from this `market/` folder).
   Wrangler will prompt for each value and it is never written to disk or git:

   ```bash
   cd market
   wrangler secret put ALPACA_KEY_ID
   wrangler secret put ALPACA_SECRET_KEY
   ```

4. **Deploy**

   ```bash
   wrangler deploy
   ```

5. **Check it** — open <https://joyebkashyeb.com.np/_m/health>.
   You should see `{"ok":true}`.

## Automated deploys (GitHub Actions)

Deploys now happen **automatically through GitHub** — the default path, so your
code ships the same way the site does. The workflow
`.github/workflows/deploy-market.yml` redeploys this Worker on every push to
`main` that touches `market/**`. You can **still run `wrangler deploy` locally**
whenever you want (an emergency hotfix, a quick test) — CI is the default, not a
lock. Just commit your change too, so GitHub stays the source of truth.

It needs two repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | token with **Workers Scripts: Edit**, **Workers Routes: Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account id (dashboard right sidebar) |

Your `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` stay on Cloudflare and are untouched by
deploys. Setting them (step 3) is one-time provisioning; after that, code changes
ship through GitHub. You can also trigger a deploy manually from the **Actions**
tab (“Deploy market worker” → *Run workflow*).

## Paper portfolio panel

The Terminal shows a **read-only paper portfolio** below the chart (`/_m/portfolio`).
For it to show real positions, the `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` secrets must
be **paper-account** keys (from *Paper Trading → API Keys* on Alpaca). Paper keys also
serve the market-data feed, so a single paper key pair powers both the chart and the
portfolio — nothing else to set up.

- It hits Alpaca's **paper** trading base (`paper-api.alpaca.markets`), so it can
  never touch real money.
- It is **read-only** — it calls `/v2/account` and `/v2/positions` only, never
  `POST /v2/orders`. (Automated buy/sell is a separate, deliberately server-side
  step for later — a Cloudflare Cron Trigger, never a public endpoint.)
- If no keys are set (or they aren't valid paper keys), the panel shows a friendly
  "not connected yet" state instead of an error.

## Notes

- The free Alpaca tier serves the **IEX** feed. Prices are real trades in real
  time, but IEX is one exchange (a few percent of total US volume), so quotes
  can differ slightly from a full consolidated feed, and volume reads low.
- Caching: only `/_m/gex` (option-chain maths) and `/_m/rss` (news feeds, 120s)
  use Cloudflare's edge cache. Bars, snapshots, quotes and the portfolio go to
  Alpaca/Yahoo on every request so prices stay live; their `Cache-Control`
  headers are advisory and the site's own requests use `cache: 'no-store'`. At
  the site's traffic this stays well inside Alpaca's free-tier rate limit; if it
  ever doesn't, a few seconds of edge cache on `/_m/snapshot` is the first lever.
- Only `joyebkashyeb.com.np` (and `localhost:3000` for local dev) may call the
  Worker — see `ALLOWED_ORIGINS` in `src/worker.js`.
- **Until this Worker is deployed the Terminal still works** — it falls back to
  a keyless public data source automatically. Deploying just makes it reliable.
