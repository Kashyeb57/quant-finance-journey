# Checker

Owner-only job dashboard at `joyebkashyeb.com.np/checker`. Not linked from the site,
served `noindex`, and every page and API call needs a login.

- **Jobs**: every posting the job hunter (private Job-hunting repo) found, after its rules.
  The hunter sends them to `/checker/api/ingest` after each run with a bearer token.
- **Applications**: status (new, saved, preparing, applied, oa, interview, offer, rejected,
  skipped, closed), date applied, resume sent, own deadline, notes. Only the owner changes these;
  the ingest route cannot overwrite them.
- **Apply queue**: tick jobs, then walk through them one by one (open the posting, mark applied
  or skip). Every application is still submitted by hand.
- **Export CSV**: every job you have touched, for updating the tracker.

No job data is stored in this repo. It lives only in the `checker` D1 database.

## One-time setup

```sh
cd checker
npx wrangler d1 create checker                 # paste the database_id into wrangler.toml
npx wrangler d1 execute checker --remote --file=./schema.sql
npx wrangler secret put CHECKER_PASSWORD       # the login password
npx wrangler secret put SESSION_SECRET         # 32+ random characters
npx wrangler secret put INGEST_TOKEN           # 32+ random characters; also add it to the
                                               # Job-hunting repo as secret CHECKER_INGEST_TOKEN
```

Then push; `.github/workflows/deploy-checker.yml` deploys it. Until all three secrets
exist the Worker answers 503 to everything.

## Security

- Login: password compared in constant time; 5 failed tries per IP per 15 minutes, then 429.
- Session: HttpOnly, Secure, SameSite=Strict cookie scoped to `/checker`, HMAC-signed with
  SESSION_SECRET plus the password, 7 days. Changing the password signs out every browser.
- Changes need the same Origin and an `X-Checker: 1` header (blocks cross-site requests).
- Strict CSP with a per-response nonce; all job text is drawn with `textContent`.
- Apply links must be `https:`; CSV export neutralises spreadsheet formulas.
- Optional extra lock: put `/checker*` behind Cloudflare Access (Zero Trust, one-time email code).

## Local test

```sh
printf 'CHECKER_PASSWORD=test\nSESSION_SECRET=%s\nINGEST_TOKEN=%s\n' $(openssl rand -hex 16) $(openssl rand -hex 16) > .dev.vars
npx wrangler d1 execute checker --local --file=./schema.sql
npx wrangler dev --local
```
