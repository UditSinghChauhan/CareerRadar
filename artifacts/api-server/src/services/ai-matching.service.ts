/**
 * AI Matching Service
 * ────────────────────
 * Uses Google Gemini (free tier) to compute a match score between
 * a student's profile/skills and a job listing's requirements.
 *
 * Gracefully degrades when GEMINI_API_KEY is not set — returns null
 * so the frontend can hide AI features.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../lib/logger";

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

// ─── LRU Cache ───────────────────────────────────────────────────────────────

class LRUCache<V> {
  private cache = new Map<string, V>();
  constructor(private maxSize: number = 200) {}

  get(key: string): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

const matchCache = new LRUCache<MatchScoreResult>(200);

function getGenAI(): GoogleGenerativeAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

export function isAIAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function getJobMatchScore(
  profile: UserProfileData,
  job: JobData,
): Promise<MatchScoreResult | null> {
  const genAI = getGenAI();
  if (!genAI) return null;

  // Check cache
  const cacheKey = `${profile.skills.sort().join(",")}::${job.title}::${job.company}`;
  const cached = matchCache.get(cacheKey);
  if (cached) return cached;

  const prompt = buildPrompt(profile, job);

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const parsed = parseResponse(text);
    if (parsed) {
      matchCache.set(cacheKey, parsed);
    }
    return parsed;
  } catch (err) {
    logger.error({ err }, "AI matching failed");
    return null;
  }
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

Respond ONLY with valid JSON in this exact format (no markdown, no backticks):
{
  "score": <number 0-100>,
  "summary": "<1-2 sentence match summary>",
  "matchingSkills": ["<skill1>", "<skill2>"],
  "missingSkills": ["<skill1>", "<skill2>"],
  "recommendations": ["<tip1>", "<tip2>"]
}`;
}

function parseResponse(text: string): MatchScoreResult | null {
  try {
    // Strip markdown code fences if present
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();
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
