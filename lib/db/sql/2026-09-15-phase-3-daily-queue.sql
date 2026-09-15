-- Phase 3 — the daily apply queue: job_dismissals and the daily target
-- setting. No new index on `jobs` — see section 3 for the measurement.
--
-- Additive only, and every statement is idempotent, so this is safe to run
-- twice. Matches lib/db/src/schema/jobDismissals.ts and settings.ts exactly
-- (verified against a local `drizzle-kit push` and information_schema on
-- 2026-09-15). Written out because the deployed database (Neon) cannot be
-- introspected by drizzle-kit through the pooled endpoint — apply this with
-- psql via the DIRECT endpoint BEFORE or WITH the merge.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-09-15-phase-3-daily-queue.sql
--
-- NOTE: artifacts/api-server/src/lib/schema-check.ts discovers tables from the
-- Drizzle schema module automatically, so the moment `jobDismissals.ts` is
-- exported, a database without this table makes /api/health and /api/healthz
-- return 503 and POST /api/sync/cron refuse to run. There is no window in
-- which the code tolerates the old schema.
--
-- Nothing here touches a pre-existing column, and nothing is dropped or
-- renamed. `job_dismissals` starts empty, which is exactly the pre-Phase-3
-- behaviour: no rows dismissed, so nothing hidden from /api/jobs or the queue.

-- ─── 1. job_dismissals (§3.2) ────────────────────────────────────────────────
-- "Not this one." A hide, never a delete — the jobs row is untouched and
-- DELETE /api/jobs/:id/dismiss removes the row here to restore it.
--
-- Keyed by profiles.id rather than clerk_id, unlike applications and
-- bookmarks: UPGRADE.md §3.2 specifies it, and both foreign keys CASCADE so a
-- deleted profile or a purged job cannot leave a dismissal pointing at
-- nothing.

CREATE TABLE IF NOT EXISTS job_dismissals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  job_id     uuid NOT NULL,
  reason     text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Constraints added separately so a re-run over a table that already exists
-- (created by an earlier partial apply) still reaches them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_dismissals_profile_id_profiles_id_fk'
  ) THEN
    ALTER TABLE job_dismissals
      ADD CONSTRAINT job_dismissals_profile_id_profiles_id_fk
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_dismissals_job_id_jobs_id_fk'
  ) THEN
    ALTER TABLE job_dismissals
      ADD CONSTRAINT job_dismissals_job_id_jobs_id_fk
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
  END IF;

  -- The queue's anti-join probes (profile_id, job_id), and the repository's
  -- onConflictDoNothing names this constraint to make POST /dismiss
  -- idempotent. Both depend on it existing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_dismissals_profile_job_unique'
  ) THEN
    ALTER TABLE job_dismissals
      ADD CONSTRAINT job_dismissals_profile_job_unique UNIQUE (profile_id, job_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS job_dismissals_profile_id_idx ON job_dismissals (profile_id);
CREATE INDEX IF NOT EXISTS job_dismissals_job_id_idx     ON job_dismissals (job_id);

-- ─── 2. The daily target (§3.3) ──────────────────────────────────────────────
-- NOT NULL with a default, so every existing settings row gets 10 without a
-- backfill and without a moment where the column reads NULL.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS daily_application_target integer NOT NULL DEFAULT 10;

-- ─── 3. NO NEW INDEX ON `jobs` — MEASURED, NOT ASSUMED ───────────────────────
-- UPGRADE.md §3.3 asks for "whatever indexes it needs". Measured on
-- 2026-09-15, the answer is none, and adding one would make things worse.
--
-- The queue reads WHERE status = 'active' AND is_fresher_eligible and then
-- sorts the survivors by a COMPUTED priority, so no index can serve the
-- ORDER BY — the only thing an index could do is choose which rows enter the
-- sort, and that predicate matches 1,549 of 3,845 rows (40%). Past roughly
-- 10% selectivity a btree loses to a sequential scan, and the planner agrees:
-- with `jobs (status, is_fresher_eligible, posted_date DESC NULLS LAST)`
-- created on a production-scale copy, the plan did not change and the
-- execution time did not move (10.3ms vs 10.0ms, three runs each) — the index
-- was never touched. It would have cost a write on every one of the thousands
-- of rows each sync pass inserts, for nothing.
--
-- Against the live table the query runs in 15ms warm / 60ms cold, 33x inside
-- the 500ms budget, on a plain Seq Scan plus a WindowAgg whose
-- `row_number() <= 1` run condition Postgres pushes into the window itself.
--
-- The anti-joins likewise need nothing new: applications_clerk_job_unique
-- (clerk_id, job_id) and job_dismissals_profile_job_unique
-- (profile_id, job_id) created above are already the exact probes.

-- ─── Read back what is there now ─────────────────────────────────────────────

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'job_dismissals'
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'settings'
  AND column_name = 'daily_application_target';

SELECT indexname
FROM pg_indexes
WHERE tablename = 'job_dismissals'
ORDER BY indexname;
