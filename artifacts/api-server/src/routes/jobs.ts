import { Router } from "express";
import { jobsService } from "../services/jobs.service";
import {
  CreateJobBody,
  UpdateJobBody,
  GetJobsClosingSoonQueryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/jobs", async (req, res) => {
  try {
    const result = await jobsService.list(req.query as Record<string, unknown>);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list jobs");
    res.status(500).json({ error: "Failed to list jobs" });
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

router.post("/jobs", async (req, res) => {
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

router.put("/jobs/:id", async (req, res) => {
  const id = req.params["id"] as string;
  const parsed = UpdateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const job = await jobsService.update(id, parsed.data as Record<string, unknown>);
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

router.delete("/jobs/:id", async (req, res) => {
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
