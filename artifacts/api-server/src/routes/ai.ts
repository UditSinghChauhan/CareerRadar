/**
 * AI Routes
 * ──────────
 * GET  /api/ai/status           — check if AI features are available
 * GET  /api/ai/jobs/:id/match   — get AI match score for authenticated user vs job
 */

import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { jobsService } from "../services/jobs.service";
import {
  getJobMatchScore,
  isAIAvailable,
  type UserProfileData,
  type JobData,
} from "../services/ai-matching.service";
import { db, profilesTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

/** Check if AI matching is available (Gemini API key configured). */
router.get("/ai/status", (_req, res) => {
  res.json({
    available: isAIAvailable(),
    provider: "gemini-2.0-flash",
    description: "AI-powered resume ↔ job matching scores",
  });
});

/** Get AI match score between authenticated user's profile and a specific job. */
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
    // Fetch user profile
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, clerkUserId))
      .limit(1);

    if (!profile) {
      res.status(404).json({
        error: "Profile not found",
        hint: "Complete your profile first to use AI matching",
      });
      return;
    }

    // Fetch job details
    const job = await jobsService.get(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Fetch company name
    let companyName = "Unknown";
    if (job.companyId) {
      const [company] = await db
        .select({ name: companiesTable.name })
        .from(companiesTable)
        .where(eq(companiesTable.id, job.companyId))
        .limit(1);
      if (company) companyName = company.name;
    }

    const profileData: UserProfileData = {
      name: profile.name,
      skills: profile.skills ?? [],
      degree: profile.degree,
      branch: profile.branch,
      college: profile.college,
      graduationYear: profile.graduationYear,
      cgpa: profile.cgpa,
    };

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

    const matchResult = await getJobMatchScore(profileData, jobData);

    if (!matchResult) {
      res.status(500).json({ error: "AI matching failed — please try again" });
      return;
    }

    res.json({
      jobId,
      ...matchResult,
    });
  } catch (err) {
    req.log.error({ err }, "AI match score failed");
    res.status(500).json({ error: "Failed to compute match score" });
  }
});

export default router;
