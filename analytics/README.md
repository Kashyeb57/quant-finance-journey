# Owner-only visitor analytics

A private visitor log for **joyebkashyeb.com.np** — records every page view with
the visitor's **IP address, location (country / city / region), device, browser,
OS and the page visited**, viewable only by you behind a secret token.

It runs as a **Cloudflare Worker** on the route `joyebkashyeb.com.np/_a/*`.
Every other path on the domain still goes to GitHub Pages untouched. Data is
stored in a **Cloudflare D1** database (free tier is plenty).

```
Visitor → Cloudflare edge ──/_a/collect──▶ Worker ──▶ D1 (log)
                                                   └──▶ /_a/logs?token=…  (your dashboard)
```

The site-side beacon (`src/clientModules/analytics.js`, already wired into
`docusaurus.config.js`) pings `/_a/collect` on each page view. It sends only the
path + referrer; the **IP and geo are read server-side** by the Worker from
Cloudflare's edge, so they can't be spoofed by the browser.

---

## One-time deploy (about 5 minutes)

You need the Cloudflare account that owns `joyebkashyeb.com.np` (the one whose
nameservers are `odin`/`rihana.ns.cloudflare.com`). Run everything from this
`analytics/` folder.

```bash
cd analytics

# 1. Install + log in (opens a browser to authorize your Cloudflare account)
npm i -g wrangler
wrangler login

# 2. Create the database, then paste the printed database_id into wrangler.toml
wrangler d1 create site_analytics
#   → copy the "database_id = \"...\"" value into wrangler.toml

# 3. Create the table
wrangler d1 execute site_analytics --file=./schema.sql --remote

# 4. Set your private dashboard password (any long random string).
#    You'll be prompted to paste it. Save it in your password manager.
wrangler secret put VIEW_TOKEN

# 5. Deploy the Worker
wrangler deploy
```

That's it. The beacon is already in the site, so once the Worker is live it
starts logging. (The site's next push to `main` will include the beacon; until
then the Worker still logs any hit to `/_a/collect`.)

## View your traffic

Open, replacing `YOUR_TOKEN` with what you set in step 4:

```
https://joyebkashyeb.com.np/_a/logs?token=YOUR_TOKEN
```

You'll get a dashboard with total visits, unique IPs, top pages / countries /
devices / browsers, and a table of recent visits (time, IP, location, page,
device, browser·OS, network). Raw JSON export:

```
https://joyebkashyeb.com.np/_a/logs.json?token=YOUR_TOKEN&limit=1000
```

**Keep that URL private** — anyone with the token can read the log. To rotate
it, just run `wrangler secret put VIEW_TOKEN` again with a new value.

## Local dev / test

```bash
wrangler dev            # test the Worker locally (uses a local D1)
```

---

## Cost

Cloudflare free tier covers this comfortably: Workers give 100,000 requests/day
and D1 gives 5 GB storage + 5M row reads/day free. A personal site won't come
close.

## Privacy / legal note

This log stores visitors' **IP addresses**, which are personal data under laws
like the GDPR/UK-GDPR. If you get EU/UK visitors, you should:

- add a short **privacy notice** to the site saying you log IP + approximate
  location + device for your own analytics, and
- not share the raw log publicly.

If you'd rather **not** store full IPs, you can anonymise them in the Worker
(e.g. drop the last octet) — ask and I'll switch it to hashed/truncated IPs
while keeping country/city.

## Housekeeping

Prune old rows anytime, e.g. keep the last 90 days:

```bash
wrangler d1 execute site_analytics --remote \
  --command "DELETE FROM hits WHERE ts < datetime('now','-90 days');"
```

## Files

| File | Purpose |
|------|---------|
| `src/worker.js` | The Worker: `/_a/collect` (record) + `/_a/logs` (dashboard) |
| `schema.sql` | D1 table definition |
| `wrangler.toml` | Worker config (route + D1 binding) |
| `../src/clientModules/analytics.js` | Site beacon (already wired into `docusaurus.config.js`) |
