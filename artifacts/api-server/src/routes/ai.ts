/**
 * AI Routes
 * ──────────
 * GET  /api/ai/status           — whether AI features are available, and what is left of today's budget
 * GET  /api/ai/match-scores     — every stored score for the caller, id + number only (job cards)
 * GET  /api/ai/jobs/:id/match   — the full match result for one job (apply drawer)
 * POST /api/ai/batch-score      — the nightly batch trigger — x-cron-secret, NOT Clerk
 *
 * NOTHING HERE CALLS GEMINI DIRECTLY. Every read goes through
 * `match-scores.service.ts`, which checks the `job_match_scores` table and the
 * daily budget first. See that file's header for the order of checks.
 */

import { Router } from "express";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { jobsService } from "../services/jobs.service";
import {
  GEMINI_MODEL,
  isAIAvailable,
  type JobData,
} from "../services/ai-matching.service";
import {
  dailyBudget,
  getOrCompute,
  profileForClerkId,
} from "../services/match-scores.service";
import { runBatchScoring } from "../services/match-scores.batch";
import { jobMatchScoresRepository } from "../repositories/jobMatchScores.repository";
import { verifyCronSecret } from "../lib/cron-auth";
import { db, companiesTable, profilesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

const router = Router();

/**
 * Check if AI matching is available (Gemini API key configured).
 *
 * Public and cheap on purpose: it is the first thing every page asks, and the
 * answer decides whether the AI UI renders at all. With no key it returns
 * `available: false` and a zeroed budget rather than an error, which is what
 * makes every page render with GEMINI_API_KEY unset.
 */
router.get("/ai/status", async (_req, res) => {
  const available = isAIAvailable();
  const budget = dailyBudget();
  // A database that cannot be reached must not turn the status check into a
  // 500 — the frontend would then render neither the AI section nor the page
  // around it. Unknown spend reads as zero spent.
  let spentToday = 0;
  try {
    spentToday = await jobMatchScoresRepository.computedInLast24h();
  } catch {
    spentToday = 0;
  }

  res.json({
    available,
    provider: GEMINI_MODEL,
    description: "AI-powered resume ↔ job matching scores",
    dailyBudget: budget,
    spentToday,
    remainingToday: Math.max(0, budget - spentToday),
  });
});

/**
 * Every stored score for the signed-in user, as `{ jobId, score }`.
 *
 * NEVER COMPUTES ANYTHING. This is the endpoint the Jobs grid calls to put a
 * badge on cards, and it is a pure table read — which is the whole reason a
 * card can render before it resolves and simply gain a badge when it does.
 * §8: "never block a card's render waiting for it."
 */
router.get("/ai/match-scores", requireAuth, async (req, res) => {
  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;
  try {
    const profile = await profileForClerkId(clerkUserId);
    if (!profile) {
      res.json({ scores: [] });
      return;
    }
    const rows = await jobMatchScoresRepository.listForProfile(profile.id);
    res.json({
      scores: rows.map((row) => ({
        jobId: row.jobId,
        score: row.score,
        computedAt: row.computedAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "GET /ai/match-scores failed");
    res.status(500).json({ error: "Failed to load match scores" });
  }
});

/**
 * The full match result for one job: score, summary, matching and missing
 * skills, recommendations.
 *
 * Served from `job_match_scores` when the profile's skills and resume have not
 * changed since it was computed — which, after the first view, is always. A
 * second view of the same job makes zero Gemini calls.
 */
router.get("/ai/jobs/:id/match", requireAuth, async (req, res) => {
  if (!isAIAvailable()) {
    res.status(503).json({
      error: "AI matching is not configured",
      hint: "Set GEMINI_API_KEY environment variable",
    });
    return;
  }

  const jobId = req.params["id"] as string;
  const clerkUserId = (req as AuthenticatedRequest).clerkUserId;

  try {
    const profile = await profileForClerkId(clerkUserId);
    if (!profile) {
      res.status(404).json({
        error: "Profile not found",
        hint: "Complete your profile first to use AI matching",
      });
      return;
    }

    const job = await jobsService.get(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    let companyName = "Unknown";
    if (job.companyId) {
      const [company] = await db
        .select({ name: companiesTable.name })
        .from(companiesTable)
        .where(eq(companiesTable.id, job.companyId))
        .limit(1);
      if (company) companyName = company.name;
    }

    const jobData: JobData = {
      title: job.title,
      company: companyName,
      description: job.description,
      requirements: job.requirements,
      requiredSkills: job.requiredSkills,
      location: job.location,
      jobType: job.jobType,
      eligibleBranches: job.eligibleBranches,
      minCgpa: job.minCgpa,
    };

    const result = await getOrCompute({
      profileId: profile.id,
      profile: {
        name: profile.name,
        skills: profile.skills ?? [],
        degree: profile.degree,
        branch: profile.branch,
        college: profile.college,
        graduationYear: profile.graduationYear,
        cgpa: profile.cgpa,
        resumeUrl: profile.resumeUrl,
      },
      jobId,
      job: jobData,
    });

    if (!result) {
      // No stored score and none could be produced — the daily budget is spent,
      // Gemini refused, or the reply did not parse. 503 rather than 500: the
      // request was fine, the capability is temporarily absent, and the
      // frontend hides the section exactly as it does when no key is set.
      res.status(503).json({
        error: "No match score available",
        hint: "The daily AI budget may be spent — tonight's batch will fill it in",
      });
      return;
    }

    // The pre-Phase-8 keys are unchanged and in the same order; `computedAt`,
    // `cached` and `stale` are additive.
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "AI match score failed");
    res.status(500).json({ error: "Failed to compute match score" });
  }
});

// ─── POST /api/ai/batch-score ─────────────────────────────────────────────────
// The nightly batch trigger, called by .github/workflows/ai-batch.yml.
//
// NO CLERK, DELIBERATELY — same reasoning as POST /api/sync/cron: a CI runner
// has no browser session cookie. The gate is the shared `x-cron-secret` header,
// compared in constant time. An operator who wants to run it by hand uses
// POST /api/admin/score-jobs, which is Clerk-authenticated.
//
// THE RUN IS CLAMPED TO WHAT IS LEFT OF THE DAILY BUDGET, not refused when the
// budget is low: scoring 12 more jobs is better than scoring none, and the
// nightly cadence means the rest are picked up tomorrow.
//
// It answers only when the run has finished. Unlike the sync, which takes
// minutes across dozens of providers, a full 50-job run is ~4–5 minutes of
// paced requests and the caller genuinely wants the report — the counts are the
// only record of what the night cost.

router.post("/ai/batch-score", async (req, res) => {
  const auth = verifyCronSecret(req.headers["x-cron-secret"]);
  if (!auth.ok) {
    req.log.warn(
      { reason: auth.reason },
      "POST /ai/batch-score — rejected unauthenticated trigger",
    );
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const report = await runBatchScoringForOwner({
      limit: parseLimit(req.query["limit"]),
      dryRun: req.query["dryRun"] === "true",
    });
    res.json(report);
  } catch (err) {
    req.log.error({ err }, "POST /ai/batch-score failed");
    res.status(500).json({ error: "Batch scoring failed" });
  }
});

export function parseLimit(raw: unknown): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 200) return undefined;
  return value;
}

/**
 * Run the batch for the single profile this deployment has.
 *
 * CareerRadar has one user by design (CLAUDE.md: "one primary user"), and the
 * Clerk instance is a development one with a user cap. Scoring every profile
 * would multiply the request cost by the number of rows in `profiles`, which on
 * a shared 15 req/min allowance is how one stray test account eats the night's
 * budget. It scores the oldest profile — the owner's — and says so in the
 * report.
 */
export async function runBatchScoringForOwner(options: {
  limit?: number;
  dryRun?: boolean;
}) {
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
    .orderBy(asc(profilesTable.createdAt))
    .limit(1);

  if (!profile) {
    return {
      stoppedBy: "no_profile" as const,
      candidates: 0,
      requests: 0,
      scored: 0,
      failed: 0,
      skipped: 0,
      model: GEMINI_MODEL,
      note: "No profile row exists yet — nothing to score against.",
    };
  }

  // Clamp to what is left of the rolling 24-hour ledger, so a second trigger in
  // the same day cannot spend a second full batch.
  const spent = await jobMatchScoresRepository.computedInLast24h();
  const remaining = Math.max(0, dailyBudget() - spent);
  const requested = options.limit ?? 50;
  const limit = Math.min(requested, remaining);

  if (limit === 0) {
    return {
      stoppedBy: "daily_quota" as const,
      candidates: 0,
      requests: 0,
      scored: 0,
      failed: 0,
      skipped: 0,
      model: GEMINI_MODEL,
      computedInLast24hBefore: spent,
      note: `Daily budget of ${dailyBudget()} already spent — no requests made.`,
    };
  }

  return runBatchScoring(
    {
      id: profile.id,
      name: profile.name,
      skills: profile.skills ?? [],
      degree: profile.degree,
      branch: profile.branch,
      college: profile.college,
      graduationYear: profile.graduationYear,
      cgpa: profile.cgpa,
      resumeUrl: profile.resumeUrl,
    },
    { limit, ...(options.dryRun !== undefined && { dryRun: options.dryRun }) },
  );
}

export default router;
