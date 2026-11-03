-- Onboarding preferences.
-- ───────────────────────
-- Adds two columns to `profiles` for the one onboarding step a new account
-- sees after sign-up: which roles they want (internship, new grad or both)
-- and which cities Today's ten should put first.
--
-- ADDITIVE ONLY. Adds two columns; drops nothing, renames nothing, rewrites no
-- existing row. `role_preference` is nullable and NULL means "not answered
-- yet", which is the correct state for every existing account: each of them
-- sees the onboarding step once. `preferred_locations` defaults to an empty
-- array, which the queue reads as "no preference". Idempotent (IF NOT EXISTS).
--
-- Apply BEFORE deploying the code that reads these columns, with the DIRECT
-- Neon endpoint, per CLAUDE.md → "Deploying a schema change":
--
--   ( URL=$(grep '^DATABASE_URL_PROD=' .env.prod | cut -d= -f2-); \
--     psql "$URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-11-03-onboarding-preferences.sql )

BEGIN;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS role_preference text;

ALTER TABLE profiles
    DROP CONSTRAINT IF EXISTS profiles_role_preference_check;
ALTER TABLE profiles
    ADD CONSTRAINT profiles_role_preference_check
    CHECK (role_preference IS NULL
           OR role_preference IN ('internship', 'new_grad', 'both'));

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS preferred_locations text[] NOT NULL DEFAULT '{}'::text[];

COMMIT;

SELECT column_name,
       data_type,
       is_nullable,
       column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('role_preference', 'preferred_locations')
ORDER BY ordinal_position;
