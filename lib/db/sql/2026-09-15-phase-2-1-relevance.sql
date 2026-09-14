-- Phase 2.1/2.2 — relevance classifier columns on jobs.
--
-- Additive only, and every statement is IF NOT EXISTS so this is safe to run
-- twice. Matches lib/db/src/schema/jobs.ts exactly (verified against a local
-- `drizzle-kit push` and information_schema on 2026-09-15). Written out
-- because the deployed database (Neon) cannot be introspected by drizzle-kit
-- through the pooled endpoint — apply this with psql via the DIRECT endpoint
-- BEFORE or WITH the merge, or every /api/jobs select 500s the moment the
-- code lands (Phase 1.5 and 2.0 both did exactly that).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-09-15-phase-2-1-relevance.sql
--
-- Nothing here touches a pre-existing column. Rows start unclassified
-- (is_fresher_eligible = false, relevance_track NULL) until
-- POST /api/admin/backfill-relevance runs.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS relevance_track     text,
  ADD COLUMN IF NOT EXISTS relevance_score     integer,
  ADD COLUMN IF NOT EXISTS is_fresher_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seniority_excluded  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS relevance_signals   text[]  NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS classified_at       timestamp with time zone;

CREATE INDEX IF NOT EXISTS jobs_is_fresher_eligible_idx ON jobs (is_fresher_eligible);
CREATE INDEX IF NOT EXISTS jobs_relevance_score_idx     ON jobs (relevance_score);
-- The default Jobs-page query: WHERE is_fresher_eligible AND status = 'active'
-- ORDER BY relevance_score DESC.
CREATE INDEX IF NOT EXISTS jobs_fresher_status_score_idx
  ON jobs (is_fresher_eligible, status, relevance_score DESC NULLS LAST);

-- Read back what is there now.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'jobs'
  AND column_name IN ('relevance_track','relevance_score','is_fresher_eligible',
                      'seniority_excluded','relevance_signals','classified_at')
ORDER BY ordinal_position;
