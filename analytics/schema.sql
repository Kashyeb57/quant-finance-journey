-- D1 schema for owner-only visitor analytics.
-- Apply with:  wrangler d1 execute site_analytics --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS hits (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL,   -- ISO timestamp (UTC)
  ip        TEXT,            -- CF-Connecting-IP (the visitor's real IP)
  country   TEXT,
  city      TEXT,
  region    TEXT,
  timezone  TEXT,
  asn       TEXT,            -- network / ISP (e.g. "AS15169 Google LLC")
  path      TEXT,            -- page visited
  referer   TEXT,            -- where they came from
  ua        TEXT,            -- full user-agent string
  device    TEXT,            -- Desktop / Mobile / Tablet / Bot
  browser   TEXT,
  os        TEXT,
  screen    TEXT,            -- e.g. "1920x1080"
  lang      TEXT,            -- visitor's preferred language (Accept-Language)
  view_id   TEXT,            -- per-pageview id, used to attach time-on-page
  duration  INTEGER          -- seconds spent on the page (filled on page leave)
);

CREATE INDEX IF NOT EXISTS idx_hits_ts      ON hits(ts);
CREATE INDEX IF NOT EXISTS idx_hits_ip      ON hits(ip);
CREATE INDEX IF NOT EXISTS idx_hits_country ON hits(country);
CREATE INDEX IF NOT EXISTS idx_hits_view    ON hits(view_id);
