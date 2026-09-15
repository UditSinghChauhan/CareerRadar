-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 7 — search and performance
--
-- Additive only, and idempotent: safe to run twice, safe to run against a
-- database that already has the column. Nothing is dropped or renamed.
--
--   1. jobs.search_vector  — a STORED generated tsvector over title (weight A),
--      required_skills (B), requirements (C) and description (D). Because it is
--      GENERATED ALWAYS, Postgres fills it for every existing row as part of
--      the ALTER and keeps it correct on every later insert and update. There
--      is no backfill step and no trigger to forget.
--   2. jobs_search_vector_idx — GIN, so `search_vector @@ websearch_to_tsquery`
--      is an index scan.
--   3. jobs_status_relevance_posted_idx — the Jobs page's default ORDER BY,
--      key for key INCLUDING the NULLS placement. Postgres will not use an
--      index for an ORDER BY whose null placement differs, and
--      jobs.repository.ts sorts `relevance_score DESC NULLS LAST,
--      posted_date DESC, created_at DESC` — the last two being plain DESC,
--      i.e. NULLS FIRST. Do not "tidy" either side independently.
--
-- WHY THE DO BLOCK. The column is added if it is absent, and its expression is
-- corrected in place if an earlier revision of this file already created it
-- without the slash normalisation (see below). Correcting it uses
-- ALTER COLUMN ... SET EXPRESSION, which needs PostgreSQL 17+ — Neon runs 18.6.
-- That branch only ever fires on a database that has the superseded v1
-- expression; a fresh database takes the ADD COLUMN branch and needs nothing.
-- Note that `drizzle-kit push` does NOT diff a generated column's expression,
-- so this file, not push, is what changes it.
--
-- COST NOTE. Both ADD COLUMN and SET EXPRESSION rewrite the table and hold an
-- ACCESS EXCLUSIVE lock for the duration. At ~4,600 rows that is well under a
-- second; it is called out because the same statement on a large table would
-- not be.
--
-- Apply with the DIRECT Neon endpoint (the pooled one cannot serve DDL
-- introspection). See CLAUDE.md → "Deploying a schema change".
-- ─────────────────────────────────────────────────────────────────────────────

DO $phase7$
DECLARE
  -- Kept in one place so the ADD and the SET EXPRESSION branches cannot drift.
  -- Mirrors `searchVector` in lib/db/src/schema/jobs.ts exactly.
  --
  -- replace(..., '/', ' ') on every arm: Postgres's default parser reads
  -- "Developer/intern" as a single `file` token, so it yields no `intern`
  -- lexeme and a search for "intern" misses the row. Eight active production
  -- postings titled `…/Intern` were lost that way — for an internship tracker,
  -- exactly the wrong eight.
  --
  -- array_to_tsvector(required_skills)::text, not array_to_string(...): a
  -- generated expression must be IMMUTABLE and array_to_string is only STABLE,
  -- so the obvious spelling is rejected outright.
  want text := $expr$
      setweight(to_tsvector('english', replace(coalesce(title, ''), '/', ' ')), 'A')
   || setweight(to_tsvector('english', replace(coalesce(array_to_tsvector(required_skills)::text, ''), '/', ' ')), 'B')
   || setweight(to_tsvector('english', replace(coalesce(requirements, ''), '/', ' ')), 'C')
   || setweight(to_tsvector('english', replace(coalesce(description, ''), '/', ' ')), 'D')
  $expr$;
  have text;
BEGIN
  SELECT generation_expression INTO have
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'jobs'
    AND column_name = 'search_vector';

  IF have IS NULL THEN
    RAISE NOTICE 'adding jobs.search_vector';
    EXECUTE 'ALTER TABLE jobs ADD COLUMN search_vector tsvector GENERATED ALWAYS AS ('
            || want || ') STORED';
  ELSIF position('replace' in have) = 0 THEN
    RAISE NOTICE 'correcting jobs.search_vector expression (slash normalisation)';
    EXECUTE 'ALTER TABLE jobs ALTER COLUMN search_vector SET EXPRESSION AS (' || want || ')';
  ELSE
    RAISE NOTICE 'jobs.search_vector already current — nothing to do';
  END IF;
END
$phase7$;

CREATE INDEX IF NOT EXISTS jobs_search_vector_idx
  ON jobs USING gin (search_vector);

CREATE INDEX IF NOT EXISTS jobs_status_relevance_posted_idx
  ON jobs USING btree (
    status,
    relevance_score DESC NULLS LAST,
    posted_date DESC NULLS FIRST,
    created_at DESC NULLS FIRST
  );

ANALYZE jobs;

-- ── Read the result back ────────────────────────────────────────────────────
SELECT column_name,
       data_type,
       is_generated,
       position('replace' in generation_expression) > 0 AS slash_normalised
FROM information_schema.columns
WHERE table_schema = current_schema()
  AND table_name = 'jobs'
  AND column_name = 'search_vector';

SELECT indexname
FROM pg_indexes
WHERE tablename = 'jobs'
  AND indexname IN ('jobs_search_vector_idx', 'jobs_status_relevance_posted_idx')
ORDER BY indexname;
