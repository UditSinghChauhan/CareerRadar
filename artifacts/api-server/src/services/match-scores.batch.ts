/**
 * Nightly batch match scoring (Phase 8).
 * ───────────────────────────────────────
 * Scores the top N unscored, fresher-eligible jobs for the owner's profile, so
 * that by morning the jobs actually worth applying to already carry a score and
 * a missing-skills list, and the live path in the drawer is a table read rather
 * than a Gemini call.
 *
 * WHAT WAS MEASURED, AND WHAT COULD NOT BE
 * ─────────────────────────────────────────
 * Measured live against this project's own key on 2026-09-16, by bursting until
 * the API returned 429 and reading the `QuotaFailure` detail out of the body
 * rather than trusting documentation:
 *
 *   gemini-3.5-flash-lite  quotaValue 15, id GenerateRequestsPerMinutePer-
 *                          ProjectPerModel-FreeTier → 15 requests/minute
 *   gemini-3.6-flash       same id, quotaValue 5    → 5 requests/minute
 *   one real scoring call  539 prompt + 138 output tokens, 3.2s on flash-lite
 *
 * NOT measured, and deliberately not guessed: the per-DAY allowance. Google
 * stopped publishing per-model free-tier tables — ai.google.dev/gemini-api/docs
 * /rate-limits now says only "viewed in Google AI Studio" — and the only way to
 * observe the number from here is to exhaust it, which would spend the owner's
 * quota for the day to learn a fact that mainly tells us we spent it. All that
 * is known is a floor: ~60 requests in one afternoon of probing produced no
 * per-day 429.
 *
 * THE PHASE 5 JSEARCH LESSON APPLIES DIRECTLY
 * ────────────────────────────────────────────
 * A per-run cap cannot protect a per-day quota — run the capped job often
 * enough and the day is gone anyway. The lever is FREQUENCY, so:
 *
 *   ONE run per day. Not one per sync pass. The sync workflow fires every six
 *   hours, and hanging the batch off it would be four runs a day and 4× the
 *   spend for the same 50 jobs. `.github/workflows/ai-batch.yml` therefore runs
 *   this on its own nightly schedule.
 *
 *   A second trigger in the same day is not blocked by a clock — an interval
 *   guard would need a "last run" timestamp, and the only one available
 *   (`max(computed_at)`) is also written by the live path, so opening one
 *   drawer would cancel the night's batch. It is bounded by the LEDGER instead:
 *   `runBatchScoringForOwner` clamps each run's limit to whatever is left of
 *   `AI_DAILY_BUDGET` in the rolling 24 hours, and at 0 it makes no requests at
 *   all. Four accidental triggers still cannot spend more than the budget.
 *
 * REQUEST COST OF THE SHIPPED DEFAULTS
 * ─────────────────────────────────────
 *   50 requests/night, worst case — fewer when fewer jobs need scoring, and
 *   zero once the top of the ranking is fully scored and nothing has changed.
 *   ≈ 34,000 tokens/night (50 × 677).
 *   Paced to 12 requests/minute, 80% of the measured 15, so a run takes about
 *   4–5 minutes and leaves headroom for the live path running concurrently.
 *   Against the per-minute allowance that is a 20% margin. Against the
 *   unmeasured per-day allowance it is 50 — which is why the live path carries
 *   its own `AI_DAILY_BUDGET` ceiling of 200 on top.
 *
 * WHEN THE BUDGET IS EXHAUSTED MID-RUN
 * ─────────────────────────────────────
 *   Per-MINUTE 429 → transient. Sleep the server's own `RetryInfo` delay (or an
 *     exponential fallback), up to `MAX_ATTEMPTS` per job, then give up on that
 *     job and continue. The pacing above means this should not happen; it is
 *     the safety net for the live path and the batch overlapping.
 *   Per-DAY 429 → nothing in the next few minutes changes it. The run STOPS
 *     immediately and reports `stoppedBy: "daily_quota"`. It does not retry, and
 *     it does not keep walking the list.
 *   Either way, every job scored before the stop is already committed — each
 *     score is its own upsert, there is no run-wide transaction — so the work is
 *     never lost and the next night simply picks up where this one stopped. The
 *     selection is "jobs with no usable score, top by relevance", so a partial
 *     run costs nothing but a delay.
 *
 * MEMORY: the instance has 512 MB and 0.1 CPU. The selection is a single LIMIT
 * query of at most 50 rows with the description truncated by the prompt builder,
 * and concurrency is 2 — this is the same budget the Phase 2 backfills live in.
 */

import {
  GEMINI_MODEL,
  MEASURED_FREE_TIER_RPM,
  asQuotaError,
  generateMatchScore,
  isAIAvailable,
  type MatchScoreResult,
  type UserProfileData,
} from "./ai-matching.service";
import {
  jobMatchScoresRepository,
  type ScorableJob,
} from "../repositories/jobMatchScores.repository";
import { persistable, profileFingerprint } from "./match-scores.service";
import { logger } from "../lib/logger";

/** UPGRADE.md §8: "the top 50 unscored fresher-eligible jobs". */
export const DEFAULT_BATCH_LIMIT = 50;

/** UPGRADE.md §8: "concurrency capped at 2". */
export const DEFAULT_CONCURRENCY = 2;

/**
 * Requests per minute the run paces itself to: 80% of the measured 15, so a
 * drawer opened while the batch is running does not push the pair over.
 */
export const PACED_RPM = Math.max(1, Math.floor(MEASURED_FREE_TIER_RPM * 0.8));

/** Attempts per job before it is abandoned, per-minute 429s included. */
const MAX_ATTEMPTS = 3;

/** Exponential fallback when a 429 carried no RetryInfo. */
const BACKOFF_BASE_MS = 4_000;

export type StoppedBy = "completed" | "daily_quota" | "no_key" | "no_profile";

/**
 * Set by whichever worker saw a per-day 429; ends the whole run.
 *
 * Held on an object rather than in a bare `let` because TypeScript's
 * control-flow analysis does not follow assignments made inside the worker
 * closures: a `let` would be narrowed to `never` by the time the report reads
 * it back, even though the workers are precisely what set it.
 */
interface QuotaStop {
  quotaId: string | null;
}

export interface BatchScoreReport {
  startedAt: string;
  durationMs: number;
  model: string;
  /** How many jobs the selection returned — the ceiling on requests. */
  candidates: number;
  /** Gemini requests actually issued, retries included. This is the spend. */
  requests: number;
  scored: number;
  failed: number;
  /** Jobs never attempted because the run stopped first. */
  skipped: number;
  /** Per-minute 429s absorbed by backoff. */
  rateLimitRetries: number;
  stoppedBy: StoppedBy;
  /** The quota id the server named, when a 429 stopped the run. */
  quotaId?: string;
  pacedRpm: number;
  concurrency: number;
  limit: number;
  /** What the daily ledger read before and after — see match-scores.service. */
  computedInLast24hBefore: number;
  computedInLast24hAfter: number;
  dryRun: boolean;
  /** Present only when a job's score could not be produced at all. */
  errors: Array<{ jobId: string; reason: string }>;
}

export interface BatchProfile extends UserProfileData {
  id: string;
  resumeUrl: string | null;
}

export interface BatchOptions {
  limit?: number;
  concurrency?: number;
  dryRun?: boolean;
  /**
   * Requests per minute this run paces itself to. Defaults to `PACED_RPM`,
   * which is 80% of the measured free-tier limit. Only the tests override it,
   * and they override it upward — a suite that actually waited 5 seconds
   * between requests would take minutes to assert on ten of them.
   */
  pacedRpm?: number;
  /** Swappable for tests; defaults to the real Gemini call. */
  generate?: typeof generateMatchScore;
  repository?: typeof jobMatchScoresRepository;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A minimum spacing between request STARTS, shared by every worker. Two workers
 * at 3.2s each would otherwise issue ~37 requests/minute — well over the
 * measured 15 — and the run would spend most of its life in backoff. Spacing
 * the starts is what actually holds the rate down; the concurrency cap alone
 * does not.
 */
class RateGate {
  private next = 0;
  constructor(private readonly intervalMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.intervalMs;
    if (at > now) await sleep(at - now);
  }
}

function toJobData(job: ScorableJob) {
  return {
    title: job.title,
    company: job.companyName,
    description: job.description,
    requirements: job.requirements,
    requiredSkills: job.requiredSkills,
    location: job.location,
    jobType: job.jobType,
    eligibleBranches: job.eligibleBranches,
    minCgpa: job.minCgpa,
  };
}

/**
 * Score the top unscored fresher-eligible jobs for one profile.
 *
 * Never throws. Every outcome — no key, no candidates, a daily quota stop — is
 * a report, because the caller is an HTTP route whose job is to say what
 * happened, not a process that can crash usefully.
 */
export async function runBatchScoring(
  profile: BatchProfile,
  options: BatchOptions = {},
): Promise<BatchScoreReport> {
  const started = Date.now();
  const limit = options.limit ?? DEFAULT_BATCH_LIMIT;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const dryRun = options.dryRun ?? false;
  const pacedRpm = options.pacedRpm ?? PACED_RPM;
  const generate = options.generate ?? generateMatchScore;
  const repository = options.repository ?? jobMatchScoresRepository;

  const base: Omit<BatchScoreReport, "stoppedBy"> = {
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    model: GEMINI_MODEL,
    candidates: 0,
    requests: 0,
    scored: 0,
    failed: 0,
    skipped: 0,
    rateLimitRetries: 0,
    pacedRpm,
    concurrency,
    limit,
    computedInLast24hBefore: 0,
    computedInLast24hAfter: 0,
    dryRun,
    errors: [],
  };

  if (!isAIAvailable()) {
    return {
      ...base,
      stoppedBy: "no_key",
      durationMs: Date.now() - started,
    };
  }

  const fingerprint = profileFingerprint(profile);
  const before = await repository.computedInLast24h();
  const candidates = await repository.selectUnscoredTopByRelevance(
    profile.id,
    fingerprint,
    limit,
  );

  base.candidates = candidates.length;
  base.computedInLast24hBefore = before;

  if (dryRun || candidates.length === 0) {
    return {
      ...base,
      computedInLast24hAfter: before,
      skipped: dryRun ? candidates.length : 0,
      stoppedBy: "completed",
      durationMs: Date.now() - started,
    };
  }

  const gate = new RateGate(Math.ceil(60_000 / pacedRpm));
  const errors: Array<{ jobId: string; reason: string }> = [];

  // Shared across workers. `stop` is what a per-day 429 sets, and every worker
  // checks it before taking its next job — which is why a day-quota refusal
  // ends the whole run rather than each of the two workers discovering it
  // separately, 25 wasted requests apart.
  const run: { stop: QuotaStop | null } = { stop: null };
  let cursor = 0;
  let requests = 0;
  let scored = 0;
  let failed = 0;
  let rateLimitRetries = 0;

  async function scoreOne(job: ScorableJob): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (run.stop) return;
      await gate.wait();
      if (run.stop) return;

      requests++;
      let result: MatchScoreResult | null;
      try {
        result = await generate(profile, toJobData(job));
      } catch (err) {
        const quota = asQuotaError(err);
        if (!quota) {
          failed++;
          errors.push({
            jobId: job.id,
            reason: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        if (quota.scope === "minute") {
          // Transient. The server usually tells us exactly how long.
          rateLimitRetries++;
          if (attempt === MAX_ATTEMPTS) {
            failed++;
            errors.push({ jobId: job.id, reason: "rate limited" });
            return;
          }
          await sleep(
            quota.retryDelayMs ?? BACKOFF_BASE_MS * 2 ** (attempt - 1),
          );
          continue;
        }
        // "day" or "unknown" — stop the run. See the header.
        run.stop = { quotaId: quota.quotaId };
        logger.warn(
          { quotaId: quota.quotaId, scope: quota.scope, requests },
          "Batch match scoring stopped — daily Gemini quota",
        );
        return;
      }

      if (!result) {
        failed++;
        errors.push({ jobId: job.id, reason: "unparseable or empty reply" });
        return;
      }

      await repository.upsert(
        persistable(profile.id, job.id, fingerprint, result),
      );
      scored++;
      return;
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      if (run.stop) return;
      const index = cursor++;
      if (index >= candidates.length) return;
      await scoreOne(candidates[index] as ScorableJob);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );

  const after = await repository.computedInLast24h();

  return {
    ...base,
    requests,
    scored,
    failed,
    // Everything the run never reached. Nonzero only after a daily-quota stop.
    skipped: Math.max(0, candidates.length - scored - failed),
    rateLimitRetries,
    computedInLast24hBefore: before,
    computedInLast24hAfter: after,
    errors,
    stoppedBy: run.stop ? "daily_quota" : "completed",
    ...(run.stop?.quotaId ? { quotaId: run.stop.quotaId } : {}),
    durationMs: Date.now() - started,
  };
}
