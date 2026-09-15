/**
 * Notification Routes (Phase 6.2)
 * ───────────────────────────────
 * GET    /api/notifications            — newest first, with the unread count
 * DELETE /api/notifications            — clear all of the caller's own
 * POST   /api/notifications/read-all   — mark every unread one read
 * POST   /api/notifications/:id/read   — mark one read
 *
 * Read and acknowledge only. Nothing here creates a notification: rows are
 * written by the generator that runs after each POST /api/sync/cron pass
 * (see ../notifications/generator.ts). A client-writable notification endpoint
 * would be a way for a browser to fabricate its own alerts, and nothing needs
 * one.
 *
 * Every route is scoped to the caller's own clerkId inside the repository, so
 * an id belonging to somebody else reads as "not found" rather than as a
 * permission error — there is no way to probe for other people's rows.
 */

import { Router } from "express";
import { notificationsService } from "../services/notifications.service";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";

const router = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  try {
    const result = await notificationsService.list(
      clerkUserId,
      req.query as Record<string, unknown>,
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list notifications");
    res.status(500).json({ error: "Failed to list notifications" });
  }
});

// Not in UPGRADE.md §6.2. Without it the table only grows: rows are generated
// on a schedule and there is no retention sweep, so "read" alone would leave
// the popover accumulating every deadline of the season.
router.delete("/notifications", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  try {
    res.json(await notificationsService.clear(clerkUserId));
  } catch (err) {
    req.log.error({ err }, "Failed to clear notifications");
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

// Must stay above "/notifications/:id/read". The two do not collide today
// (different segment counts), but the ordering matches the rule
// /applications/status-map already follows and survives a later edit.
router.post("/notifications/read-all", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  try {
    res.json(await notificationsService.markAllRead(clerkUserId));
  } catch (err) {
    req.log.error({ err }, "Failed to mark all notifications read");
    res.status(500).json({ error: "Failed to mark all notifications read" });
  }
});

router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const id = req.params["id"] as string;
  try {
    const notification = await notificationsService.markRead(id, clerkUserId);
    if (!notification) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }
    res.json(notification);
  } catch (err) {
    req.log.error({ err }, "Failed to mark notification read");
    res.status(500).json({ error: "Failed to mark notification read" });
  }
});

export default router;
