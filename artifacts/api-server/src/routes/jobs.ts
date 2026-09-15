import { Router } from "express";
import { getAuth } from "@clerk/express";
import { jobsService } from "../services/jobs.service";
import {
  CreateJobBody,
  UpdateJobBody,
  DismissJobBody,
  GetJobsClosingSoonQueryParams,
} from "@workspace/api-zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import {
  jobDismissalsRepository,
  resolveProfileId,
} from "../repositories/jobDismissals.repository";

const router = Router();

// Public, as it has always been. The Clerk session is read OPTIONALLY so a
// signed-in caller gets their dismissed rows hidden (Phase 3.2); an anonymous
// one gets the same unfiltered list as before. `clerkMiddleware` runs for the
// whole app in app.ts, so getAuth here needs no extra wiring.
router.get("/jobs", async (req, res) => {
  try {
    const result = await jobsService.list(
      req.query as Record<string, unknown>,
      {
        clerkId: getAuth(req)?.userId ?? null,
      },
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list jobs");
    res.status(500).json({ error: "Failed to list jobs" });
  }
});

// ─── Phase 3.2 dismissals ─────────────────────────────────────────────────────
// "Not this one." A hide, never a delete — DELETE below restores it in full.
// Registered before /jobs/:id so the router does not read "dismiss" as an id.

router.post("/jobs/:id/dismiss", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const jobId = req.params["id"] as string;
  const parsed = DismissJobBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const job = await jobsService.get(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const profileId = await resolveProfileId(clerkUserId);
    if (!profileId) {
      // The profile row is created by GET /api/profile, which the app calls on
      // load. Reaching here means a client dismissed before ever loading a
      // page, so say what is missing rather than inventing a half-filled row.
      res.status(409).json({
        error: "No profile yet — load the app once before dismissing jobs",
      });
      return;
    }
    // Idempotent: a double-click or a retry returns the first dismissal.
    const dismissal = await jobDismissalsRepository.add(
      profileId,
      jobId,
      parsed.data.reason ?? null,
    );
    res.status(201).json(dismissal);
  } catch (err) {
    req.log.error({ err }, "Failed to dismiss job");
    res.status(500).json({ error: "Failed to dismiss job" });
  }
});

router.delete("/jobs/:id/dismiss", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const jobId = req.params["id"] as string;

  try {
    const profileId = await resolveProfileId(clerkUserId);
    // Nothing to undo is not an error worth a 500; it is a 404 on the
    // dismissal, and it makes the DELETE idempotent too.
    if (!profileId) {
      res.status(404).json({ error: "Dismissal not found" });
      return;
    }
    const removed = await jobDismissalsRepository.remove(profileId, jobId);
    if (!removed) {
      res.status(404).json({ error: "Dismissal not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to restore dismissed job");
    res.status(500).json({ error: "Failed to restore dismissed job" });
  }
});

// IMPORTANT: /deadlines/soon must be registered before /:id
router.get("/jobs/deadlines/soon", async (req, res) => {
  const parsed = GetJobsClosingSoonQueryParams.safeParse(req.query);
  const days = parsed.success ? (parsed.data.days ?? 7) : 7;

  try {
    const jobs = await jobsService.getClosingSoon(days);
    res.json(jobs);
  } catch (err) {
    req.log.error({ err }, "Failed to get closing soon jobs");
    res.status(500).json({ error: "Failed to get jobs closing soon" });
  }
});

router.get("/jobs/:id", async (req, res) => {
  const id = req.params["id"] as string;
  try {
    const job = await jobsService.get(id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  } catch (err) {
    req.log.error({ err }, "Failed to get job");
    res.status(500).json({ error: "Failed to get job" });
  }
});

router.post("/jobs", requireAuth, async (req, res) => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    // Normalize deadline to string before passing to service
    const normalizeDate = (d: unknown) =>
      d ? (typeof d === "string" ? d : (d as Date).toISOString()) : undefined;
    const data = {
      ...parsed.data,
      deadline: normalizeDate(parsed.data.deadline),
      postedDate: normalizeDate(parsed.data.postedDate),
    };
    const job = await jobsService.create(data);
    res.status(201).json(job);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("not found")) {
      res.status(404).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Failed to create job");
    res.status(500).json({ error: "Failed to create job" });
  }
});

router.put("/jobs/:id", requireAuth, async (req, res) => {
  const id = req.params["id"] as string;
  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const job = await jobsService.update(
      id,
      parsed.data as Record<string, unknown>,
    );
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  } catch (err) {
    req.log.error({ err }, "Failed to update job");
    res.status(500).json({ error: "Failed to update job" });
  }
});

router.delete("/jobs/:id", requireAuth, async (req, res) => {
  const id = req.params["id"] as string;
  try {
    const job = await jobsService.close(id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  } catch (err) {
    req.log.error({ err }, "Failed to close job");
    res.status(500).json({ error: "Failed to close job" });
  }
});

export default router;
