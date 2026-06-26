import { Router } from "express";
import { savedSearchesService } from "../services/savedSearches.service";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { CreateSavedSearchBody } from "@workspace/api-zod";

const router = Router();

router.get("/saved-searches", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  try {
    const searches = await savedSearchesService.list(clerkUserId);
    res.json(searches);
  } catch (err) {
    req.log.error({ err }, "Failed to list saved searches");
    res.status(500).json({ error: "Failed to list saved searches" });
  }
});

router.post("/saved-searches", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const parsed = CreateSavedSearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const search = await savedSearchesService.create(clerkUserId, {
      name: parsed.data.name,
      filters: parsed.data.filters as Record<string, unknown>,
    });
    res.status(201).json(search);
  } catch (err) {
    req.log.error({ err }, "Failed to create saved search");
    res.status(500).json({ error: "Failed to create saved search" });
  }
});

router.delete("/saved-searches/:id", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const id = req.params["id"] as string;
  try {
    const deleted = await savedSearchesService.delete(id, clerkUserId);
    if (!deleted) {
      res.status(404).json({ error: "Saved search not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete saved search");
    res.status(500).json({ error: "Failed to delete saved search" });
  }
});

export default router;
