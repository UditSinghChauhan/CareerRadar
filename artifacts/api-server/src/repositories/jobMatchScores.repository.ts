/**
 * Persisted AI match scores (Phase 8).
 * ─────────────────────────────────────
 * The reads and writes behind `job_match_scores`. Every column is listed
 * explicitly — see `repositories/columns.ts` for why a bare `db.select()` is
 * not used anywhere in this directory.
 */

import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  db,
  jobMatchScoresTable,
  jobsTable,
  companiesTable,
  type JobMatchScore,
} from "@workspace/db";

export interface StoredScoreInput {
  profileId: string;
  jobId: string;
  score: number;
  summary: string;
  matchingSkills: string[];
  missingSkills: string[];
  recommendations: string[];
  profileFingerprint: string;
  model: string;
}

/** A job the batch scorer has decided is worth spending a request on. */
export interface ScorableJob {
  id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  requiredSkills: string[] | null;
  location: string | null;
  jobType: string;
  eligibleBranches: string[] | null;
  minCgpa: number | null;
  relevanceScore: number | null;
  companyName: string;
}

const scoreColumns = {
  id: jobMatchScoresTable.id,
  profileId: jobMatchScoresTable.profileId,
  jobId: jobMatchScoresTable.jobId,
  score: jobMatchScoresTable.score,
  summary: jobMatchScoresTable.summary,
  matchingSkills: jobMatchScoresTable.matchingSkills,
  missingSkills: jobMatchScoresTable.missingSkills,
  recommendations: jobMatchScoresTable.recommendations,
  profileFingerprint: jobMatchScoresTable.profileFingerprint,
  model: jobMatchScoresTable.model,
  computedAt: jobMatchScoresTable.computedAt,
} as const;

export const jobMatchScoresRepository = {
  /** The stored score for one (profile, job), or null. */
  async get(profileId: string, jobId: string): Promise<JobMatchScore | null> {
    const [row] = await db
      .select(scoreColumns)
      .from(jobMatchScoresTable)
      .where(
        and(
          eq(jobMatchScoresTable.profileId, profileId),
          eq(jobMatchScoresTable.jobId, jobId),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Every stored score for a profile, id and number only.
   *
   * This is what the Jobs grid reads to put a badge on a card, so it stays
   * deliberately small: no summary, no skill arrays. Even if every
   * fresher-eligible job were scored that is ~2,100 rows of two short fields,
   * which is smaller than a single page of job cards.
   */
  async listForProfile(
    profileId: string,
  ): Promise<Array<{ jobId: string; score: number; computedAt: Date }>> {
    return db
      .select({
        jobId: jobMatchScoresTable.jobId,
        score: jobMatchScoresTable.score,
        computedAt: jobMatchScoresTable.computedAt,
      })
      .from(jobMatchScoresTable)
      .where(eq(jobMatchScoresTable.profileId, profileId));
  },

  /** Upsert on the `(profile_id, job_id)` unique constraint. */
  async upsert(input: StoredScoreInput): Promise<JobMatchScore> {
    const [row] = await db
      .insert(jobMatchScoresTable)
      .values({ ...input, computedAt: new Date() })
      .onConflictDoUpdate({
        target: [jobMatchScoresTable.profileId, jobMatchScoresTable.jobId],
        set: {
          score: input.score,
          summary: input.summary,
          matchingSkills: input.matchingSkills,
          missingSkills: input.missingSkills,
          recommendations: input.recommendations,
          profileFingerprint: input.profileFingerprint,
          model: input.model,
          computedAt: new Date(),
        },
      })
      .returning(scoreColumns);
    return row as JobMatchScore;
  },

  /**
   * How many scores were computed in the last 24 hours, across every profile.
   *
   * This is the daily-budget ledger, and it is derived from `computed_at`
   * rather than from a counter in memory for the reason the whole phase
   * exists: a counter in memory resets on every spin-down, which on the free
   * tier is several times an hour, so it would read zero all day and cap
   * nothing.
   *
   * It counts SUCCESSFUL scores. A call that 500'd or returned unparseable
   * text consumed quota without writing a row, so the true spend can exceed
   * this. The per-run cap in the batch scorer is what bounds that gap.
   */
  async computedInLast24h(): Promise<number> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobMatchScoresTable)
      .where(gte(jobMatchScoresTable.computedAt, since));
    return row?.count ?? 0;
  },

  /**
   * The batch scorer's selection: the top `limit` ACTIVE, FRESHER-ELIGIBLE
   * jobs, ordered by the relevance score the Phase 2.1 classifier already
   * computed, that this profile has no usable score for.
   *
   * "Top by relevance, not arbitrary rows" is the point. A `not_relevant`
   * posting is one the user will never apply to, so a Gemini request spent on
   * it is a request not spent on the internship at the top of their queue.
   * `is_fresher_eligible` is false for exactly the not_relevant track.
   *
   * "No usable score" means either no row at all, or a row whose
   * `profile_fingerprint` no longer matches — the skills or resume the score
   * was computed from have changed since.
   *
   * NULL relevance_score sorts last (`NULLS LAST`): an unclassified row is
   * not evidence of relevance, and letting NULL sort first would hand the
   * whole budget to rows the classifier has never seen.
   */
  async selectUnscoredTopByRelevance(
    profileId: string,
    fingerprint: string,
    limit: number,
  ): Promise<ScorableJob[]> {
    return db
      .select({
        id: jobsTable.id,
        title: jobsTable.title,
        description: jobsTable.description,
        requirements: jobsTable.requirements,
        requiredSkills: jobsTable.requiredSkills,
        location: jobsTable.location,
        jobType: jobsTable.jobType,
        eligibleBranches: jobsTable.eligibleBranches,
        minCgpa: jobsTable.minCgpa,
        relevanceScore: jobsTable.relevanceScore,
        companyName: companiesTable.name,
      })
      .from(jobsTable)
      .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
      .leftJoin(
        jobMatchScoresTable,
        and(
          eq(jobMatchScoresTable.jobId, jobsTable.id),
          eq(jobMatchScoresTable.profileId, profileId),
        ),
      )
      .where(
        and(
          eq(jobsTable.status, "active"),
          eq(jobsTable.isFresherEligible, true),
          or(
            isNull(jobMatchScoresTable.id),
            isNull(jobMatchScoresTable.profileFingerprint),
            ne(jobMatchScoresTable.profileFingerprint, fingerprint),
          ),
        ),
      )
      .orderBy(sql`${jobsTable.relevanceScore} DESC NULLS LAST`)
      .limit(limit);
  },

  /** Only used by tests and the admin report. */
  async countForProfile(profileId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobMatchScoresTable)
      .where(eq(jobMatchScoresTable.profileId, profileId));
    return row?.count ?? 0;
  },

  /** Most recently computed scores for a profile — the admin report's sample. */
  async recentForProfile(
    profileId: string,
    limit: number,
  ): Promise<JobMatchScore[]> {
    return db
      .select(scoreColumns)
      .from(jobMatchScoresTable)
      .where(eq(jobMatchScoresTable.profileId, profileId))
      .orderBy(desc(jobMatchScoresTable.computedAt))
      .limit(limit);
  },

  /** Used by the score map endpoint when a caller asks for specific jobs. */
  async listForJobs(
    profileId: string,
    jobIds: string[],
  ): Promise<JobMatchScore[]> {
    if (jobIds.length === 0) return [];
    return db
      .select(scoreColumns)
      .from(jobMatchScoresTable)
      .where(
        and(
          eq(jobMatchScoresTable.profileId, profileId),
          inArray(jobMatchScoresTable.jobId, jobIds),
        ),
      );
  },
};
