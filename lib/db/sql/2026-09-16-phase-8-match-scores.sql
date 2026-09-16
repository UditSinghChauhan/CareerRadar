-- Phase 8 — cost-controlled AI matching.
-- ──────────────────────────────────────
-- Adds one new table, `job_match_scores`: the persistent cache that replaces the
-- 200-entry in-memory LRU in ai-matching.service.ts. On Render's free tier the
-- instance spins down after 15 minutes idle, so that map was empty on almost
-- every request and each view of a job cost a fresh Gemini call.
--
-- ADDITIVE ONLY. Creates a table; drops nothing, renames nothing, and does not
-- touch a single existing row. Fully idempotent — every statement is IF NOT
-- EXISTS — so re-running it against a database that already has the table is a
-- no-op. Proven as a no-op against the local database this change was pushed to
-- with `pnpm --filter @workspace/db run push` before being trusted here.
--
-- Apply with the DIRECT Neon endpoint (the pooled one cannot serve
-- introspection), per CLAUDE.md → "Deploying a schema change":
--
--   ( URL=$(grep '^DATABASE_URL_PROD=' .env.prod | cut -d= -f2-); \
--     psql "$URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-09-16-phase-8-match-scores.sql )
--
-- There is no backfill. An empty table is the correct starting state: it means
-- "nothing scored yet", which is exactly what the reader already handles, and
-- the nightly batch fills it in from the top of the relevance ranking down.

BEGIN;

CREATE TABLE IF NOT EXISTS job_match_scores (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id          uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
    job_id              uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    score               integer NOT NULL,
    summary             text NOT NULL DEFAULT '',
    matching_skills     text[] NOT NULL DEFAULT '{}'::text[],
    missing_skills      text[] NOT NULL DEFAULT '{}'::text[],
    recommendations     text[] NOT NULL DEFAULT '{}'::text[],
    -- Hash of the sorted `skills` array and `resume_url` this score was computed
    -- from. A mismatch is the ONLY thing that forces a recompute, so editing a
    -- CGPA or a GitHub URL does not invalidate every stored score. Nullable:
    -- a row without one reads as stale and is recomputed once.
    profile_fingerprint text,
    -- Which Gemini model wrote the row. Free-tier model names are retired
    -- without notice — `gemini-2.0-flash`, which this project called until
    -- Phase 8, now returns 404 — and this is how rows from a dead model are
    -- found without recomputing all of them.
    model               text,
    computed_at         timestamptz NOT NULL DEFAULT now()
);

-- One score per (profile, job). This is what makes the writer a real upsert
-- (ON CONFLICT DO UPDATE) instead of a read-then-insert race, and it is also
-- the index the "already scored?" lookup uses.
ALTER TABLE job_match_scores
    DROP CONSTRAINT IF EXISTS job_match_scores_profile_job_key;
ALTER TABLE job_match_scores
    ADD CONSTRAINT job_match_scores_profile_job_key UNIQUE (profile_id, job_id);

-- The daily-budget counter scans `computed_at` across all profiles.
CREATE INDEX IF NOT EXISTS job_match_scores_computed_at_idx
    ON job_match_scores (computed_at);

COMMIT;

-- Read the result back, the way every migration in this directory ends: this is
-- the output that proves the columns the Drizzle schema declares actually exist,
-- which is the same comparison artifacts/api-server/src/lib/schema-check.ts
-- makes at boot and on every /api/health call.
SELECT column_name,
       data_type,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'job_match_scores'
ORDER BY ordinal_position;
