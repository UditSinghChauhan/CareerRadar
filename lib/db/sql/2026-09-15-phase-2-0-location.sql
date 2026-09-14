-- Phase 2.0 — normalised location columns on jobs.
--
-- Additive only, and every statement is IF NOT EXISTS so this is safe to run
-- twice. Matches lib/db/src/schema/jobs.ts exactly; drizzle-kit push produces
-- the same DDL against a local database. Written out because the deployed
-- database (Neon) cannot be introspected by drizzle-kit through the pooled
-- endpoint, and because the code that reads these columns shipped before the
-- columns did — every /api/jobs select 500'd until this ran.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-09-15-phase-2-0-location.sql

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS location_city    text,
  ADD COLUMN IF NOT EXISTS location_region  text,
  ADD COLUMN IF NOT EXISTS location_country text,
  ADD COLUMN IF NOT EXISTS location_metro   text,
  ADD COLUMN IF NOT EXISTS is_india         boolean,
  ADD COLUMN IF NOT EXISTS is_remote        boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS jobs_is_india_idx       ON jobs (is_india);
CREATE INDEX IF NOT EXISTS jobs_is_remote_idx      ON jobs (is_remote);
CREATE INDEX IF NOT EXISTS jobs_location_metro_idx ON jobs (location_metro);

-- Read back what is there now.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'jobs'
  AND column_name IN ('location_city','location_region','location_country',
                      'location_metro','is_india','is_remote')
ORDER BY ordinal_position;
