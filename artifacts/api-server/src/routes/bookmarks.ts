import { Router } from "express";
import { bookmarksService } from "../services/bookmarks.service";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { CreateBookmarkBody } from "@workspace/api-zod";

const router = Router();

router.get("/bookmarks", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  try {
    const bookmarks = await bookmarksService.list(clerkUserId);
    res.json(bookmarks);
  } catch (err) {
    req.log.error({ err }, "Failed to list bookmarks");
    res.status(500).json({ error: "Failed to list bookmarks" });
  }
});

router.post("/bookmarks", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const parsed = CreateBookmarkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const bookmark = await bookmarksService.add(clerkUserId, parsed.data.jobId);
    res.status(201).json(bookmark);
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message.includes("already bookmarked")) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err.message.includes("not found")) {
        res.status(404).json({ error: err.message });
        return;
      }
    }
    req.log.error({ err }, "Failed to create bookmark");
    res.status(500).json({ error: "Failed to create bookmark" });
  }
});

router.delete("/bookmarks/:jobId", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const jobId = req.params["jobId"] as string;
  try {
    const deleted = await bookmarksService.remove(clerkUserId, jobId);
    if (!deleted) {
      res.status(404).json({ error: "Bookmark not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete bookmark");
    res.status(500).json({ error: "Failed to delete bookmark" });
  }
});

export default router;
