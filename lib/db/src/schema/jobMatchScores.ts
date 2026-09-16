import {
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { profilesTable } from "./profiles";
import { jobsTable } from "./jobs";

/**
 * Persisted AI match scores (Phase 8).
 * ─────────────────────────────────────
 * Before this table the only cache in front of Gemini was a 200-entry in-memory
 * LRU inside `ai-matching.service.ts`. On Render's free tier the instance spins
 * down after 15 minutes idle, so that map was empty on practically every
 * request: opening the same job on Monday and again on Tuesday cost two Gemini
 * calls, and the table holds ~4,500 active rows of which ~2,100 are
 * fresher-eligible. This table is the cache instead, and it survives restarts.
 *
 * One row per (profile, job) — the unique constraint below is what makes the
 * writer an upsert rather than a read-then-insert race.
 */
export const jobMatchScoresTable = pgTable(
  "job_match_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobsTable.id, { onDelete: "cascade" }),

    /** 0–100, as returned by the model and clamped by the parser. */
    score: integer("score").notNull(),
    summary: text("summary").notNull().default(""),
    matchingSkills: text("matching_skills").array().notNull().default([]),
    /** The Phase 8 payload the apply drawer actually shows. */
    missingSkills: text("missing_skills").array().notNull().default([]),
    recommendations: text("recommendations").array().notNull().default([]),

    /**
     * Fingerprint of the profile inputs this score was computed from — the
     * sorted `skills` array and `resumeUrl`, nothing else. See
     * `profileFingerprint()` in match-scores.service.ts.
     *
     * This column is what implements "recompute only when skills or resumeUrl
     * changed". The obvious alternative — comparing `profiles.updated_at`
     * against `computed_at` — invalidates every stored score whenever the user
     * edits their CGPA or pastes a GitHub URL, which on this table means up to
     * 2,100 Gemini calls for a change the prompt does not even read. A
     * fingerprint mismatch is the only thing that forces a recompute.
     *
     * Nullable so a row written before this column existed reads as "unknown
     * fingerprint", which the reader treats as stale and recomputes once.
     */
    profileFingerprint: text("profile_fingerprint"),

    /**
     * The Gemini model that produced the row, e.g. `gemini-3.5-flash-lite`.
     * Recorded because model names on the free tier are retired without notice
     * — `gemini-2.0-flash`, which this project called until Phase 8, now 404s —
     * and when that happens the operator needs to find the rows a dead model
     * wrote without recomputing all of them.
     */
    model: text("model"),

    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("job_match_scores_profile_job_key").on(table.profileId, table.jobId),
    /**
     * The batch scorer's hot path: "top-N fresher-eligible jobs this profile
     * has no fresh score for". It joins jobs to this table on
     * (profile_id, job_id), which the unique index above already serves, and
     * the daily-budget counter scans `computed_at` across all profiles.
     */
    index("job_match_scores_computed_at_idx").on(table.computedAt),
  ],
);

export type JobMatchScore = typeof jobMatchScoresTable.$inferSelect;
export type InsertJobMatchScore = typeof jobMatchScoresTable.$inferInsert;
