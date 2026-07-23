-- Adds visitor language + time-on-page tracking to an EXISTING database.
-- Run this ONCE, BEFORE deploying the updated Worker:
--   wrangler d1 execute site_analytics --file=./migrations/001_lang_duration.sql --remote
--
-- (Fresh installs already get these columns from schema.sql — this file is
-- only for a database that was created before the feature was added.)

ALTER TABLE hits ADD COLUMN lang TEXT;
ALTER TABLE hits ADD COLUMN view_id TEXT;
ALTER TABLE hits ADD COLUMN duration INTEGER;

CREATE INDEX IF NOT EXISTS idx_hits_view ON hits(view_id);
