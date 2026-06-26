import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;

  try {
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, clerkUserId));

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

    res.json({
      totalApplications: 0,
      appliedCount: 0,
      upcomingDeadlines: 0,
      recentActivity: 0,
      profileCompleteness,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    res.status(500).json({ error: "Failed to get dashboard summary" });
  }
});

export default router;
