-- Phase 6 — referral/follow-up fields on `applications` (§6.1) and the
-- idempotency key + read index the notification generator needs (§6.2).
--
-- §6.3 (the Resend email digest) is deliberately NOT part of this phase and
-- adds no schema of its own, so nothing here anticipates it.
--
-- Additive only, and every statement is idempotent, so this is safe to run
-- twice. Matches lib/db/src/schema/applications.ts and notifications.ts
-- exactly — verified by running `drizzle-kit push` against the local database
-- first and then proving this file is a no-op against that same database
-- (2026-09-16). Written out because the deployed database (Neon) cannot be
-- introspected by drizzle-kit through the pooled endpoint — apply this with
-- psql via the DIRECT endpoint BEFORE or WITH the merge, or every
-- /api/applications select 500s the moment the code lands (Phase 1.5 and 2.0
-- both did exactly that).
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-09-16-phase-6-notifications.sql
--
-- NOTE: artifacts/api-server/src/lib/schema-check.ts discovers columns from the
-- Drizzle schema module automatically, so a database without these columns
-- makes /api/health and /api/healthz return 503 and POST /api/sync/cron refuse
-- to run. There is no window in which the code tolerates the old schema.
--
-- Nothing here is dropped or renamed, and no existing column is touched.

-- ─── 1. applications: referral and outreach tracking (§6.1) ──────────────────
--
-- Two columns section 6.1 asks for are NOT added, because they already exist:
--
--   followUpAt  -> follow_up_date  (timestamptz, present since Phase 1)
--   contactName -> referral_name   (text, present since Phase 1, never surfaced
--                                   in the UI until now)
--
-- Adding `contact_name` beside `referral_name` would have left the latter dead
-- forever, since CLAUDE.md forbids ever dropping a column. The drawer labels
-- `referral_name` "Contact name" instead.
--
-- referral_status is plain text with NOT NULL DEFAULT 'none', not an enum:
-- every pre-existing row reads as "not asked" with no backfill and no moment
-- where it is NULL, and the allowed set stays changeable (a pgEnum value can
-- never be removed). The set is enforced in openapi.yaml and in
-- REFERRAL_STATUSES in artifacts/api-server/src/services/applications.service.ts.

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS contact_url     text,
  ADD COLUMN IF NOT EXISTS referral_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS outreach_notes  text;

-- The "Awaiting follow-up" filter: follow_up_date <= now() AND a non-terminal
-- status, always scoped to one clerk_id. Partial, because a follow-up date is
-- set on a small minority of rows and indexing the NULLs would be pure write
-- cost on a table every Apply click writes to.
CREATE INDEX IF NOT EXISTS applications_clerk_follow_up_idx
  ON applications (clerk_id, follow_up_date)
  WHERE follow_up_date IS NOT NULL;

-- ─── 2. notifications: generator idempotency + the bell's read path (§6.2) ───
--
-- dedupe_key is what stops the generator re-announcing the same deadline on
-- every cron pass. It is nullable and null by default: Postgres treats NULLs
-- in a unique constraint as distinct, so only rows the generator writes are
-- deduplicated, and a hand-written notification is never collapsed into
-- another one.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

-- Named exactly as Drizzle names it, because the generator's
-- onConflictDoNothing() targets these two columns and silently degrades into
-- "insert a duplicate every run" if the constraint is absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_clerk_dedupe_unique'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_clerk_dedupe_unique UNIQUE (clerk_id, dedupe_key);
  END IF;
END $$;

-- The bell's two queries — the unread count and the newest-first page — are
-- both `WHERE clerk_id = $1`, so clerk_id leads. The pre-existing single-column
-- indexes are left in place: dropping one is forbidden, and they cost nothing
-- on a table this size.
CREATE INDEX IF NOT EXISTS notifications_clerk_read_created_idx
  ON notifications (clerk_id, is_read, created_at DESC NULLS LAST);

-- ─── 3. NO BACKFILL ──────────────────────────────────────────────────────────
-- Nothing to backfill. referral_status defaults to 'none' for every existing
-- row as part of the ALTER, the three nullable columns start NULL (which is
-- exactly "not recorded"), and notifications starts with zero generated rows —
-- the first POST /api/sync/cron after the merge writes them.

-- ─── Read back what is there now ─────────────────────────────────────────────

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'applications'
  AND column_name IN ('contact_url', 'referral_status', 'outreach_notes',
                      'referral_name', 'follow_up_date')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND column_name = 'dedupe_key';

SELECT indexname
FROM pg_indexes
WHERE tablename IN ('applications', 'notifications')
  AND indexname IN ('applications_clerk_follow_up_idx',
                    'notifications_clerk_read_created_idx',
                    'notifications_clerk_dedupe_unique')
ORDER BY indexname;
