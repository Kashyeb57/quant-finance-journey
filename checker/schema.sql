-- Checker: private job dashboard for joyebkashyeb.com.np/checker
-- Run once:  npx wrangler d1 execute checker --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,           -- first 16 hex of SHA-256(url)
  url         TEXT NOT NULL UNIQUE,       -- https posting / apply link
  company     TEXT NOT NULL,
  title       TEXT NOT NULL,
  location    TEXT,
  category    TEXT,                       -- data / software / quant (hunter type)
  deadline    TEXT,                       -- YYYY-MM-DD or 'rolling', from the posting
  pay         TEXT,
  intl        TEXT,                       -- hunter intl_friendly value
  score       INTEGER,
  source      TEXT,
  found_at    TEXT,                       -- when the hunter first found it
  last_seen   TEXT,                       -- last ingest that still listed it
  cpt         TEXT NOT NULL DEFAULT 'unknown',   -- excluded / risk / ok / unknown
  opt         TEXT NOT NULL DEFAULT 'unknown',
  auth_quote  TEXT,                       -- the posting's own work-authorization sentence
  -- Joyeb's fields. The ingest route never writes these.
  status      TEXT NOT NULL DEFAULT 'new',
  applied_on  TEXT,
  resume      TEXT,
  my_deadline TEXT,
  notes       TEXT,
  updated_at  TEXT
);
CREATE INDEX IF NOT EXISTS jobs_status  ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_score   ON jobs(score DESC);
CREATE INDEX IF NOT EXISTS jobs_found   ON jobs(found_at DESC);
CREATE INDEX IF NOT EXISTS jobs_company ON jobs(company);

-- Failed logins, for the 5-tries-per-15-minutes limit.
CREATE TABLE IF NOT EXISTS login_fail (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_fail_ip ON login_fail(ip, at);

-- Private documents: tailored resumes, evaluator scorecards, the 5 base resumes.
-- Served only to a signed-in session. job_id is NULL for base resumes.
CREATE TABLE IF NOT EXISTS docs (
  id         TEXT PRIMARY KEY,           -- random 16 hex
  job_id     TEXT,                       -- jobs.id, or NULL for a base resume
  kind       TEXT NOT NULL,              -- resume / scorecard / base / other
  name       TEXT NOT NULL,              -- file name shown and downloaded
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  body       BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS docs_job ON docs(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS docs_unique ON docs(COALESCE(job_id, ''), kind, name);
