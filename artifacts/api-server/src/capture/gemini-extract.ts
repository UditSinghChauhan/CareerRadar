/**
 * Gemini JD extraction (Phase 4.1) — the accelerator, never the floor.
 * ─────────────────────────────────────────────────────────────────────
 * Given text the USER pasted, ask Gemini for a strict JSON object. Nothing here
 * fetches a job page: the only outbound connection this module can make is to
 * Google's API through the SDK, and it only happens when GEMINI_API_KEY is set.
 *
 * Every failure mode — no key, network error, non-JSON reply, a reply that
 * parses to something that is not an object — returns null, and the caller
 * falls back to `parse-text.ts`. `GEMINI_API_KEY` is set on Render and not
 * locally, so the null path is the one that runs during development and it has
 * to be complete rather than degraded.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../lib/logger";
import {
  isAIAvailable,
  stripJsonFences,
} from "../services/ai-matching.service";
import type { CaptureDraft, CaptureJobType, CaptureWorkMode } from "./types";

/** Gemini sees at most this much of the paste — it is a JD, not a novel. */
const MAX_PROMPT_TEXT = 12_000;

const MODEL = "gemini-2.0-flash";

export { isAIAvailable };

function buildPrompt(rawText: string, url: string | null): string {
  return `You are a job-posting parser. Extract structured fields from the job description below.

${url ? `The posting's URL is: ${url}\n` : ""}JOB DESCRIPTION TEXT:
"""
${rawText.slice(0, MAX_PROMPT_TEXT)}
"""

Rules:
- Use only what the text states. Never invent a value; use null when the text does not say.
- "stipend" is a MONTHLY figure in rupees, as an integer with no separators. Use it for internships.
- "salaryMin"/"salaryMax" are ANNUAL figures in rupees, as integers. "12 LPA" is 1200000.
- "deadline" is an ISO-8601 date-time (UTC) or null.
- "workMode" is exactly one of "remote", "hybrid", "onsite", or null.
- "jobType" is exactly one of "internship", "full_time", or null.
- "requiredSkills" is an array of short technology or skill names, at most 15.
- "location" is the city and state as written, e.g. "Bengaluru, Karnataka".

Respond ONLY with valid JSON in this exact format (no markdown, no backticks):
{
  "title": <string or null>,
  "companyName": <string or null>,
  "location": <string or null>,
  "workMode": <string or null>,
  "jobType": <string or null>,
  "stipend": <integer or null>,
  "salaryMin": <integer or null>,
  "salaryMax": <integer or null>,
  "deadline": <string or null>,
  "requiredSkills": [<string>],
  "description": <string or null>
}`;
}

// ─── Coercion ─────────────────────────────────────────────────────────────────
// The model is asked for a shape; it is not trusted to have produced one.

function asString(value: unknown, maxLength = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === "null") return null;
  return trimmed.slice(0, maxLength);
}

function asInteger(value: unknown): number | null {
  const n =
    typeof value === "string" ? Number(value.replace(/[,\s₹]/g, "")) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function asWorkMode(value: unknown): CaptureWorkMode | null {
  const s = asString(value)?.toLowerCase();
  return s === "remote" || s === "hybrid" || s === "onsite" ? s : null;
}

function asJobType(value: unknown): CaptureJobType | null {
  const s = asString(value)?.toLowerCase().replace(/[\s-]/g, "_");
  return s === "internship" || s === "full_time" ? s : null;
}

function asDeadline(value: unknown): string | null {
  const s = asString(value, 40);
  if (!s) return null;
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const s = asString(item, 40);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 15) break;
  }
  return out;
}

/** Everything the model returned, coerced. Fields it got wrong come back null. */
export function coerceGeminiDraft(
  parsed: unknown,
): Partial<CaptureDraft> | null {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const raw = parsed as Record<string, unknown>;
  return {
    title: asString(raw.title, 200),
    companyName: asString(raw.companyName, 120),
    location: asString(raw.location, 120),
    workMode: asWorkMode(raw.workMode),
    jobType: asJobType(raw.jobType),
    stipend: asInteger(raw.stipend),
    salaryMin: asInteger(raw.salaryMin),
    salaryMax: asInteger(raw.salaryMax),
    deadline: asDeadline(raw.deadline),
    requiredSkills: asSkills(raw.requiredSkills),
    description: asString(raw.description, 8000),
  };
}

/**
 * Ask Gemini to extract the posting. Returns null whenever the answer cannot be
 * used, including when no key is configured — the caller must treat null as
 * "use the heuristics", not as an error.
 */
export async function extractWithGemini(
  rawText: string,
  url: string | null,
): Promise<Partial<CaptureDraft> | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(buildPrompt(rawText, url));
    const text = result.response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFences(text));
    } catch {
      logger.warn(
        "Capture: Gemini reply was not JSON — falling back to heuristics",
      );
      return null;
    }

    const draft = coerceGeminiDraft(parsed);
    if (!draft) {
      logger.warn(
        "Capture: Gemini reply parsed to a non-object — falling back to heuristics",
      );
    }
    return draft;
  } catch (err) {
    logger.error(
      { err },
      "Capture: Gemini extraction failed — falling back to heuristics",
    );
    return null;
  }
}
