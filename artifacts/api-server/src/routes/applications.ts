import { Router } from "express";
import { applicationsService } from "../services/applications.service";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import {
  CreateApplicationBody,
  UpdateApplicationBody,
} from "@workspace/api-zod";

const router = Router();

/**
 * The generated zod schemas coerce every date-time field to a `Date`, while the
 * service takes an ISO string. This is the normalisation that bridges them.
 *
 * It is `Date | string | null | undefined` in and `string | null | undefined`
 * out, and the null is load-bearing: `null` is how the drawer clears a field it
 * previously set, and collapsing it to `undefined` — which the pre-6.1 code did
 * — means the service skips the column and the old value survives. That made a
 * follow-up date impossible to erase, which Phase 6.1's "Awaiting follow-up"
 * filter would have turned into a row stuck in the view forever.
 */
function isoOrNull(
  value: Date | string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

router.get("/applications", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  try {
    const result = await applicationsService.list(
      clerkUserId,
      req.query as Record<string, unknown>,
    );
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
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const application = await applicationsService.create(clerkUserId, {
      ...parsed.data,
      appliedDate: isoOrNull(parsed.data.appliedDate) ?? undefined,
    });
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

// Must stay above "/applications/:id" — Express matches in declaration order,
// so ":id" would otherwise swallow the literal "status-map" segment.
router.get("/applications/status-map", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  try {
    const statusMap = await applicationsService.getStatusMap(clerkUserId);
    res.json(statusMap);
  } catch (err) {
    req.log.error({ err }, "Failed to build application status map");
    res.status(500).json({ error: "Failed to build application status map" });
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
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const data = {
      ...parsed.data,
      followUpDate: isoOrNull(parsed.data.followUpDate),
      appliedDate: isoOrNull(parsed.data.appliedDate),
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
