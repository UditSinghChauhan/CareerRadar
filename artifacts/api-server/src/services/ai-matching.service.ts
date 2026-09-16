/**
 * AI Matching Service — the Gemini call itself.
 * ──────────────────────────────────────────────
 * ONE outbound request per invocation, no caching. Everything about *whether*
 * to make the call — the persisted score, the freshness rule, the daily budget —
 * lives in `match-scores.service.ts`, which is the only thing that should call
 * `generateMatchScore()` on a user's behalf.
 *
 * Gracefully degrades when GEMINI_API_KEY is not set: `isAIAvailable()` returns
 * false and every entry point returns null, so the frontend hides AI UI instead
 * of a page failing. That path is the one that runs in local development, where
 * the key is deliberately absent.
 *
 * WHY THE IN-MEMORY LRU IS GONE (Phase 8)
 * ────────────────────────────────────────
 * This file used to hold a 200-entry `Map` keyed by skills+title+company. On
 * Render's free tier the instance spins down after 15 minutes idle and the map
 * dies with it, so on the deployed service it was almost never warm: opening
 * the same job twice on different days cost two Gemini calls. The cache is now
 * the `job_match_scores` table, which survives restarts. Re-adding a process
 * cache here would put a second, shorter-lived source of truth in front of it.
 *
 * WHY THE MODEL CHANGED (Phase 8)
 * ────────────────────────────────
 * Until this phase both this file and `capture/gemini-extract.ts` asked for
 * `gemini-2.0-flash`. Measured live on 2026-09-16 against the project's own
 * key, that model — and every 2.5 model — now answers:
 *
 *   404 "This model models/gemini-2.5-flash is no longer available to new
 *        users. Please update your code to use models/gemini-3.6-flash"
 *
 * so both AI features had been silently failing in production: every call threw
 * and the catch below turned it into `null`, which reads exactly like "no key
 * configured". Measured free-tier limits for the two candidates, taken from the
 * `QuotaFailure` detail on a real 429 rather than from documentation (Google no
 * longer publishes per-model free-tier tables):
 *
 *   gemini-3.5-flash-lite   15 req/min   ~3.2s   539 in + 138 out tokens
 *   gemini-3.6-flash         5 req/min   6–27s   plus ~100 thinking tokens
 *
 * flash-lite wins on every axis that matters here: 3× the per-minute headroom,
 * a fifth of the latency, and no thinking-token overhead on a task whose whole
 * output is a 138-token JSON object.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../lib/logger";

/**
 * The model both this service and the Phase 4 capture extractor call. Exported
 * so there is exactly one name to change the next time Google retires one —
 * two copies is how `gemini-2.0-flash` survived in this repo after it stopped
 * existing.
 */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

/**
 * Measured, not assumed: a 25-way burst against this model on 2026-09-16
 * returned 11 × HTTP 429 carrying
 * `quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"`,
 * `quotaValue: "15"`. Everything that paces requests targets a fraction of
 * this, never the number itself.
 */
export const MEASURED_FREE_TIER_RPM = 15;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MatchScoreResult {
  score: number; // 0-100
  summary: string; // 1-2 sentence summary
  matchingSkills: string[]; // Skills the student has that match
  missingSkills: string[]; // Skills the job wants but student lacks
  recommendations: string[]; // Actionable advice
}

export interface UserProfileData {
  name: string;
  skills: string[];
  degree?: string | null;
  branch?: string | null;
  college?: string | null;
  graduationYear?: number | null;
  cgpa?: number | null;
}

export interface JobData {
  title: string;
  company: string;
  description?: string | null;
  requirements?: string | null;
  requiredSkills?: string[] | null;
  location?: string | null;
  jobType?: string | null;
  eligibleBranches?: string[] | null;
  minCgpa?: number | null;
}

// ─── Quota ───────────────────────────────────────────────────────────────────

/**
 * Which quota a 429 was about. The distinction decides what the caller does,
 * and getting it wrong is the Phase 5 JSearch lesson repeating itself:
 *
 *   "minute"  — transient. Wait out `retryDelayMs` and the same request
 *               succeeds. Worth retrying.
 *   "day"     — nothing that happens in the next few minutes changes this.
 *               Retrying is pure waste and, worse, keeps the batch running
 *               long after it can accomplish anything. The run must stop.
 *   "unknown" — a 429 whose QuotaFailure detail did not name a quota. Treated
 *               as "day", because the expensive mistake is to keep hammering.
 */
export type QuotaScope = "minute" | "day" | "unknown";

export class GeminiQuotaError extends Error {
  readonly scope: QuotaScope;
  /** From the response's RetryInfo detail when present; null when it was not. */
  readonly retryDelayMs: number | null;
  readonly quotaId: string | null;

  constructor(
    message: string,
    scope: QuotaScope,
    retryDelayMs: number | null,
    quotaId: string | null,
  ) {
    super(message);
    this.name = "GeminiQuotaError";
    this.scope = scope;
    this.retryDelayMs = retryDelayMs;
    this.quotaId = quotaId;
  }
}

interface QuotaViolation {
  quotaId?: string;
  quotaMetric?: string;
  quotaValue?: string;
}

interface ErrorDetail {
  "@type"?: string;
  violations?: QuotaViolation[];
  retryDelay?: string;
}

/** `"22.211135101s"` / `"638.876453ms"` / `"0s"` → milliseconds. */
function parseRetryDelay(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = /^([\d.]+)(ms|s)$/.exec(raw.trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(match[2] === "ms" ? value : value * 1000);
}

/**
 * Turn whatever was thrown into a GeminiQuotaError, or null if it was not a
 * 429. The SDK's `GoogleGenerativeAIFetchError` carries `status` and the raw
 * `error.details` array, which is where the quota id and the retry delay live —
 * so this reads the server's own verdict instead of pattern-matching a message.
 *
 * It is IDEMPOTENT, and that matters: `generateMatchScore` below already
 * converts the SDK error before rethrowing, so by the time the batch scorer's
 * catch block sees it the object is a GeminiQuotaError with no `.status` at
 * all. Without this first branch the batch would classify every real quota
 * refusal as an ordinary failure, keep walking its list, and make 49 more
 * requests that could not succeed — which is the exact behaviour the phase
 * exists to prevent.
 */
export function asQuotaError(err: unknown): GeminiQuotaError | null {
  if (err instanceof GeminiQuotaError) return err;
  if (typeof err !== "object" || err === null) return null;
  const candidate = err as { status?: number; errorDetails?: ErrorDetail[] };
  if (candidate.status !== 429) return null;

  const details = Array.isArray(candidate.errorDetails)
    ? candidate.errorDetails
    : [];

  let quotaId: string | null = null;
  let retryDelayMs: number | null = null;
  for (const detail of details) {
    if (detail.violations?.length) {
      quotaId = detail.violations[0]?.quotaId ?? quotaId;
    }
    if (detail.retryDelay) {
      retryDelayMs = parseRetryDelay(detail.retryDelay) ?? retryDelayMs;
    }
  }

  // Google's ids read `GenerateRequestsPerMinutePerProjectPerModel-FreeTier`
  // and `GenerateRequestsPerDayPerProjectPerModel-FreeTier`.
  const scope: QuotaScope = !quotaId
    ? "unknown"
    : /PerMinute/i.test(quotaId)
      ? "minute"
      : /PerDay/i.test(quotaId)
        ? "day"
        : "unknown";

  return new GeminiQuotaError(
    err instanceof Error ? err.message : "Gemini quota exceeded",
    scope,
    retryDelayMs,
    quotaId,
  );
}

// ─── Service ─────────────────────────────────────────────────────────────────

function getGenAI(): GoogleGenerativeAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

export function isAIAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * One Gemini call. No cache, no budget check, no retry — the caller owns all
 * three.
 *
 * Returns null when no key is configured or the reply could not be parsed.
 * THROWS `GeminiQuotaError` on a 429, because a quota refusal is not the same
 * as a bad answer: a batch that treats it as "this job scored null" burns
 * through the rest of its list making requests that cannot succeed.
 */
export async function generateMatchScore(
  profile: UserProfileData,
  job: JobData,
): Promise<MatchScoreResult | null> {
  const genAI = getGenAI();
  if (!genAI) return null;

  const prompt = buildPrompt(profile, job);

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        // Native JSON mode. `stripJsonFences` below stays for the capture
        // extractor and as a belt-and-braces parse, but with this set the
        // model returns bare JSON rather than a fenced block.
        responseMimeType: "application/json",
        // Deterministic enough that re-scoring the same pair does not swing
        // the number, which matters when the score is cached for weeks.
        temperature: 0.2,
        // The measured reply is 138 tokens. This is a ceiling against a
        // runaway generation, not a target.
        maxOutputTokens: 1024,
      },
    });
    const result = await model.generateContent(prompt);
    return parseResponse(result.response.text());
  } catch (err) {
    const quota = asQuotaError(err);
    if (quota) {
      logger.warn(
        { quotaId: quota.quotaId, scope: quota.scope },
        "Gemini quota exceeded",
      );
      throw quota;
    }
    logger.error({ err }, "AI matching failed");
    return null;
  }
}

/**
 * Kept as the pre-Phase-8 entry point so nothing that imported it breaks. It is
 * a direct, uncached Gemini call — new code wants
 * `matchScoresService.getOrCompute()` instead, which is what checks the table
 * and the daily budget first.
 *
 * @deprecated Use `matchScoresService.getOrCompute()`.
 */
export async function getJobMatchScore(
  profile: UserProfileData,
  job: JobData,
): Promise<MatchScoreResult | null> {
  return generateMatchScore(profile, job);
}

function buildPrompt(profile: UserProfileData, job: JobData): string {
  return `You are a career matching AI. Analyze how well this student matches this job.

STUDENT PROFILE:
- Skills: ${profile.skills.length > 0 ? profile.skills.join(", ") : "Not specified"}
- Degree: ${profile.degree ?? "Not specified"}
- Branch: ${profile.branch ?? "Not specified"}
- College: ${profile.college ?? "Not specified"}
- Graduation Year: ${profile.graduationYear ?? "Not specified"}
- CGPA: ${profile.cgpa ?? "Not specified"}

JOB LISTING:
- Title: ${job.title}
- Company: ${job.company}
- Type: ${job.jobType ?? "Not specified"}
- Location: ${job.location ?? "Not specified"}
- Description: ${(job.description ?? "Not provided").slice(0, 1500)}
- Requirements: ${(job.requirements ?? "Not provided").slice(0, 500)}
- Required Skills: ${job.requiredSkills?.join(", ") ?? "Not specified"}
- Eligible Branches: ${job.eligibleBranches?.join(", ") ?? "Not specified"}
- Minimum CGPA: ${job.minCgpa ?? "Not specified"}

"missingSkills" is the field that matters most: list the concrete skills this
job asks for that the student's profile does not show, most important first, at
most six. It is read as an interview-prep checklist.

Respond ONLY with valid JSON in this exact format (no markdown, no backticks):
{
  "score": <number 0-100>,
  "summary": "<1-2 sentence match summary>",
  "matchingSkills": ["<skill1>", "<skill2>"],
  "missingSkills": ["<skill1>", "<skill2>"],
  "recommendations": ["<tip1>", "<tip2>"]
}`;
}

/**
 * Strip the markdown code fences Gemini wraps JSON in, however firmly the
 * prompt asked it not to. Exported because Phase 4's capture extractor faces
 * exactly the same behaviour and must not grow a second copy of this.
 */
export function stripJsonFences(text: string): string {
  return text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function parseResponse(text: string): MatchScoreResult | null {
  try {
    const cleaned = stripJsonFences(text);
    const parsed = JSON.parse(cleaned);

    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      summary: String(parsed.summary || ""),
      matchingSkills: Array.isArray(parsed.matchingSkills)
        ? parsed.matchingSkills.map(String)
        : [],
      missingSkills: Array.isArray(parsed.missingSkills)
        ? parsed.missingSkills.map(String)
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map(String)
        : [],
    };
  } catch {
    logger.warn("Failed to parse AI match response");
    return null;
  }
}
