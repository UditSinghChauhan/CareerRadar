import { Router } from "express";
import { applicationsService } from "../services/applications.service";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import {
  CreateApplicationBody,
  UpdateApplicationBody,
} from "@workspace/api-zod";

const router = Router();

router.get("/applications", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  try {
    const result = await applicationsService.list(clerkUserId, req.query as Record<string, unknown>);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list applications");
    res.status(500).json({ error: "Failed to list applications" });
  }
});

router.post("/applications", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const parsed = CreateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const application = await applicationsService.create(clerkUserId, parsed.data);
    res.status(201).json(application);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message.includes("already applied")) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err.message.includes("not found")) {
        res.status(404).json({ error: err.message });
        return;
      }
    }
    req.log.error({ err }, "Failed to create application");
    res.status(500).json({ error: "Failed to create application" });
  }
});

router.get("/applications/:id", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const id = req.params["id"] as string;
  try {
    const application = await applicationsService.get(id, clerkUserId);
    if (!application) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    res.json(application);
  } catch (err) {
    req.log.error({ err }, "Failed to get application");
    res.status(500).json({ error: "Failed to get application" });
  }
});

router.put("/applications/:id", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const id = req.params["id"] as string;
  const parsed = UpdateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const data = {
      ...parsed.data,
      followUpDate: parsed.data.followUpDate
        ? typeof parsed.data.followUpDate === "string"
          ? parsed.data.followUpDate
          : (parsed.data.followUpDate as Date).toISOString()
        : undefined,
      appliedDate: parsed.data.appliedDate
        ? typeof parsed.data.appliedDate === "string"
          ? parsed.data.appliedDate
          : (parsed.data.appliedDate as Date).toISOString()
        : undefined,
    };
    const application = await applicationsService.update(id, clerkUserId, data);
    if (!application) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    res.json(application);
  } catch (err) {
    req.log.error({ err }, "Failed to update application");
    res.status(500).json({ error: "Failed to update application" });
  }
});

router.delete("/applications/:id", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const id = req.params["id"] as string;
  try {
    const deleted = await applicationsService.delete(id, clerkUserId);
    if (!deleted) {
      res.status(404).json({ error: "Application not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete application");
    res.status(500).json({ error: "Failed to delete application" });
  }
});

export default router;
