import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { UpdateProfileBody } from "@workspace/api-zod";
import { createClerkClient } from "@clerk/express";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

const router = Router();

async function getOrCreateProfile(clerkUserId: string) {
  const [existing] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.clerkId, clerkUserId));

  if (existing) return existing;

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    "User";
  const email =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ?? "";

  const [created] = await db
    .insert(profilesTable)
    .values({ clerkId: clerkUserId, name, email, skills: [] })
    .returning();

  return created;
}

router.get("/profile", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  try {
    const profile = await getOrCreateProfile(clerkUserId);
    res.json(profile);
  } catch (err) {
    req.log.error({ err }, "Failed to get profile");
    res.status(500).json({ error: "Failed to get profile" });
  }
});

router.put("/profile", requireAuth, async (req, res) => {
  const { clerkUserId } = req as AuthenticatedRequest;
  const parsed = UpdateProfileBody.safeParse(req.body);

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    await getOrCreateProfile(clerkUserId);

    const [updated] = await db
      .update(profilesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(profilesTable.clerkId, clerkUserId))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update profile");
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
