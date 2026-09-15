import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middlewares/requireAuth";
import { applicationsRepository } from "../repositories/applications.repository";
import { bookmarksRepository } from "../repositories/bookmarks.repository";
import { jobsRepository } from "../repositories/jobs.repository";
import { resolveProfileId } from "../repositories/jobDismissals.repository";
import { dailyQueue } from "../queue/daily-queue.repository";
import { dailyProgress, DEFAULT_DAILY_TARGET } from "../queue/daily-target";
import { dailyQueueDay, PRIORITY_WEIGHTS } from "../queue/priority";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;

  try {
    const [
      profile,
      totalApplications,
      byStatus,
      bookmarksCount,
      activeJobsCount,
      upcomingDeadlines,
    ] = await Promise.all([
      db
        .select()
        .from(profilesTable)
        .where(eq(profilesTable.clerkId, clerkUserId))
        .then((r) => r[0] ?? null),
      applicationsRepository.countAll(clerkUserId),
      applicationsRepository.countByStatuses(clerkUserId),
      bookmarksRepository.count(clerkUserId),
      jobsRepository.countActive(),
      jobsRepository.countClosingSoon(7),
    ]);

    let profileCompleteness = 0;
    if (profile) {
      const fields = [
        profile.name,
        profile.email,
        profile.college,
        profile.degree,
        profile.branch,
        profile.graduationYear != null,
        profile.cgpa != null,
        (profile.skills?.length ?? 0) > 0,
        profile.resumeUrl,
        profile.linkedinUrl,
        profile.githubUrl,
      ];
      const filled = fields.filter(Boolean).length;
      profileCompleteness = Math.round((filled / fields.length) * 100);
    }

    const appliedCount =
      (byStatus["applied"] ?? 0) +
      (byStatus["oa_pending"] ?? 0) +
      (byStatus["oa_completed"] ?? 0) +
      (byStatus["interview_pending"] ?? 0) +
      (byStatus["interview_completed"] ?? 0) +
      (byStatus["offered"] ?? 0);

    const recentActivity = totalApplications;

    res.json({
      totalApplications,
      appliedCount,
      upcomingDeadlines,
      recentActivity,
      profileCompleteness,
      bookmarksCount,
      activeJobsCount,
      byStatus,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    res.status(500).json({ error: "Failed to get dashboard summary" });
  }
});

// ─── GET /api/dashboard/today ─────────────────────────────────────────────────
// Phase 3.1 — the daily apply queue. Ranked jobs the user has not applied to,
// not dismissed, status = 'active', fresher-eligible, duplicates collapsed by
// (company, normalised title).
//
// The priority components come back WITH each row (§3.1: "Do not recompute
// them in the frontend") along with a plain-language reason per component, so
// the UI explains the ranking from the server's numbers rather than deriving
// its own.
//
// `progress` rides along in the same response instead of a second endpoint:
// §3.3's counter sits directly above the list, and the queue already has to
// read `applications` to exclude what has been applied to.

const MAX_QUEUE_LIMIT = 50;

router.get("/dashboard/today", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;

  const rawLimit = Number(req.query["limit"]);
  const limit =
    Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= MAX_QUEUE_LIMIT
      ? rawLimit
      : DEFAULT_DAILY_TARGET;

  try {
    // One instant for the whole request: scoring some rows against a clock
    // that moved mid-query would make the order non-deterministic.
    const now = new Date();
    const [profileId, progress] = await Promise.all([
      resolveProfileId(clerkUserId),
      // Read first, not in parallel with the queue: its `timezone` is what
      // decides which day's tie rotation the queue uses, and a queue scored
      // against a different day than the counter displays would be confusing
      // at exactly the moment it matters — around local midnight.
      dailyProgress(clerkUserId),
    ]);
    const queueDay = dailyQueueDay(now, progress.timezone);

    const queue = await dailyQueue({
      clerkId: clerkUserId,
      profileId,
      limit,
      now,
      queueDay,
    });

    res.json({
      generatedAt: now.toISOString(),
      // Which day's tie rotation produced this order. Two requests sharing a
      // queueDay return the same rows in the same order.
      queueDay,
      limit,
      // What the ranking actually had to choose between, and how much of that
      // was duplicate rows — the two numbers that say whether the queue is
      // short because the table is thin or because everything is collapsed.
      eligibleCount: queue.eligibleCount,
      distinctCount: queue.distinctCount,
      queryMs: queue.queryMs,
      progress,
      weights: PRIORITY_WEIGHTS,
      items: queue.items,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to build today's queue");
    res.status(500).json({ error: "Failed to build today's queue" });
  }
});

export default router;
