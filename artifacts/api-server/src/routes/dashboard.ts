import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { applicationsRepository } from "../repositories/applications.repository";
import { bookmarksRepository } from "../repositories/bookmarks.repository";
import { jobsRepository } from "../repositories/jobs.repository";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;

  try {
    const [profile, totalApplications, byStatus, bookmarksCount, activeJobsCount, upcomingDeadlines] =
      await Promise.all([
        db.select().from(profilesTable).where(eq(profilesTable.clerkId, clerkUserId)).then((r) => r[0] ?? null),
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

export default router;
