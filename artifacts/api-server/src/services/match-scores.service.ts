/**
 * Match scores — the cache, the freshness rule and the budget (Phase 8).
 * ───────────────────────────────────────────────────────────────────────
 * This module owns the decision of whether a Gemini request happens at all.
 * `ai-matching.service.ts` owns only the request itself. Nothing outside this
 * file should call `generateMatchScore()` on a user's behalf.
 *
 * THE ORDER OF CHECKS, AND WHY
 * ─────────────────────────────
 *   1. No API key            → null. Every caller renders without AI.
 *   2. Stored row, fresh     → return it. ZERO outbound requests. This is the
 *                              path the acceptance criterion "viewing the same
 *                              job twice makes zero Gemini calls" exercises.
 *   3. Daily budget spent    → return the stale stored row if there is one,
 *                              otherwise null. Never a request.
 *   4. Otherwise             → one request, then persist.
 *
 * WHAT "FRESH" MEANS
 * ───────────────────
 * UPGRADE.md §8: "Recompute only if the profile's `skills` or `resumeUrl`
 * changed after `computedAt`." That is implemented as a fingerprint of exactly
 * those two inputs, stored on the row — see `profileFingerprint()` below.
 * Comparing `profiles.updated_at` against `computed_at` instead would have
 * invalidated every stored score whenever the user touched their CGPA, which on
 * this table is up to 2,100 recomputes for an edit the prompt does not read.
 *
 * A score never expires on age alone. The job row it describes is immutable in
 * every field the prompt reads once a provider has stopped rewriting it, and an
 * expiry would mean re-spending the entire budget on the same jobs every N days
 * for an answer that cannot have changed.
 */

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, profilesTable, type JobMatchScore } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  jobMatchScoresRepository,
  type StoredScoreInput,
} from "../repositories/jobMatchScores.repository";
import {
  GEMINI_MODEL,
  generateMatchScore,
  isAIAvailable,
  type JobData,
  type MatchScoreResult,
  type UserProfileData,
} from "./ai-matching.service";

/**
 * The most Gemini requests this deployment will make in any rolling 24 hours,
 * counted from `job_match_scores.computed_at` rather than from memory.
 *
 * WHY A CEILING AT ALL, GIVEN THE TABLE
 * The table bounds repeat views, not first views. There are ~4,500 active jobs
 * of which ~2,100 are fresher-eligible, and the live path computes on demand:
 * without a ceiling, a browsing session that opened enough drawers could spend
 * a whole day's quota before the nightly batch ever ran.
 *
 * 200 is deliberately below any plausible per-day free-tier allowance — the
 * nightly batch's own 50 fits inside it four times over — because the per-day
 * allowance is the one number that could NOT be measured (see the batch
 * scorer's header). Raise it with `AI_DAILY_BUDGET` if the deployment turns out
 * to have more room; it degrades to serving stale rows, never to an error page.
 */
const DEFAULT_DAILY_BUDGET = 200;

export function dailyBudget(): number {
  // An env var that is SET BUT EMPTY has to read as "unset", not as zero.
  // `Number("")` is 0, and a budget of 0 silently disables AI matching
  // everywhere while `/api/ai/status` still reports `available: true` — a
  // failure that would look exactly like Gemini being down. Render lets a
  // variable be added with a blank value, so this is reachable.
  const raw = (process.env["AI_DAILY_BUDGET"] ?? "").trim();
  if (raw === "") return DEFAULT_DAILY_BUDGET;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_DAILY_BUDGET;
}

/**
 * The two profile fields the recompute rule names, and nothing else.
 *
 * Skills are sorted before hashing so that reordering the same set — which the
 * profile form does whenever a chip is removed and re-added — is not a change.
 * `resumeUrl` is included because §8 names it, even though the prompt does not
 * currently read the resume: when it does, every score computed before that
 * must be recomputed, and this is what will force it.
 */
export function profileFingerprint(profile: {
  skills: string[] | null | undefined;
  resumeUrl: string | null | undefined;
}): string {
  const skills = [...(profile.skills ?? [])].map((s) => s.trim()).sort();
  const payload = JSON.stringify({
    skills,
    resumeUrl: profile.resumeUrl ?? null,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export interface MatchScorePayload extends MatchScoreResult {
  jobId: string;
  computedAt: Date;
  /** True when this answer came out of the table — i.e. cost nothing. */
  cached: boolean;
  /** Stale means the fingerprint no longer matches but the budget is spent. */
  stale: boolean;
}

function toPayload(
  row: JobMatchScore,
  opts: { cached: boolean; stale: boolean },
): MatchScorePayload {
  return {
    jobId: row.jobId,
    score: row.score,
    summary: row.summary,
    matchingSkills: row.matchingSkills,
    missingSkills: row.missingSkills,
    recommendations: row.recommendations,
    computedAt: row.computedAt,
    cached: opts.cached,
    stale: opts.stale,
  };
}

/** Swappable so tests can count outbound calls without a network. */
export interface MatchScoreDeps {
  generate: typeof generateMatchScore;
  repository: typeof jobMatchScoresRepository;
}

const defaultDeps: MatchScoreDeps = {
  generate: generateMatchScore,
  repository: jobMatchScoresRepository,
};

export interface GetOrComputeInput {
  profileId: string;
  profile: UserProfileData & { resumeUrl?: string | null };
  jobId: string;
  job: JobData;
}

/**
 * The single entry point for "what is this profile's score for this job".
 *
 * Returns null only when there is nothing to show at all: no key, or a first
 * view that could not be computed. Callers treat null as "hide the AI section",
 * never as an error.
 *
 * It does not throw on a quota refusal. A 429 here means the same thing a miss
 * means to the page — no score to show — and the outcome is logged. The batch
 * scorer is the caller that needs to distinguish them, and it calls
 * `generateMatchScore` directly.
 */
export async function getOrCompute(
  input: GetOrComputeInput,
  deps: MatchScoreDeps = defaultDeps,
): Promise<MatchScorePayload | null> {
  if (!isAIAvailable()) return null;

  const fingerprint = profileFingerprint({
    skills: input.profile.skills,
    resumeUrl: input.profile.resumeUrl ?? null,
  });

  const stored = await deps.repository.get(input.profileId, input.jobId);
  if (stored && stored.profileFingerprint === fingerprint) {
    // THE ZERO-CALL PATH. Nothing below this line runs.
    return toPayload(stored, { cached: true, stale: false });
  }

  const spent = await deps.repository.computedInLast24h();
  if (spent >= dailyBudget()) {
    logger.warn(
      { spent, budget: dailyBudget(), jobId: input.jobId },
      "AI daily budget spent — serving stored score without recomputing",
    );
    // A stale answer beats no answer: the skills that changed are the user's,
    // and yesterday's missing-skills list is still mostly right.
    return stored ? toPayload(stored, { cached: true, stale: true }) : null;
  }

  let result: MatchScoreResult | null = null;
  try {
    result = await deps.generate(input.profile, input.job);
  } catch (err) {
    logger.warn(
      { err, jobId: input.jobId },
      "AI match score refused by Gemini — falling back to stored value",
    );
    return stored ? toPayload(stored, { cached: true, stale: true }) : null;
  }

  if (!result) {
    return stored ? toPayload(stored, { cached: true, stale: true }) : null;
  }

  const row = await deps.repository.upsert(
    persistable(input.profileId, input.jobId, fingerprint, result),
  );
  return toPayload(row, { cached: false, stale: false });
}

export function persistable(
  profileId: string,
  jobId: string,
  fingerprint: string,
  result: MatchScoreResult,
): StoredScoreInput {
  return {
    profileId,
    jobId,
    score: result.score,
    summary: result.summary,
    matchingSkills: result.matchingSkills,
    missingSkills: result.missingSkills,
    recommendations: result.recommendations,
    profileFingerprint: fingerprint,
    model: GEMINI_MODEL,
  };
}

/** The profile row the scorer needs, by Clerk id. Null when not provisioned. */
export async function profileForClerkId(clerkUserId: string) {
  const [profile] = await db
    .select({
      id: profilesTable.id,
      name: profilesTable.name,
      skills: profilesTable.skills,
      degree: profilesTable.degree,
      branch: profilesTable.branch,
      college: profilesTable.college,
      graduationYear: profilesTable.graduationYear,
      cgpa: profilesTable.cgpa,
      resumeUrl: profilesTable.resumeUrl,
    })
    .from(profilesTable)
    .where(eq(profilesTable.clerkId, clerkUserId))
    .limit(1);
  return profile ?? null;
}

export const matchScoresService = {
  getOrCompute,
  profileFingerprint,
  profileForClerkId,
  dailyBudget,
};
