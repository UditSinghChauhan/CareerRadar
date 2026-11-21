/**
 * Keeps the read-only demo account looking like a student mid-season.
 *
 * The demo cannot write, so it cannot onboard itself either: a fresh demo
 * account landed every visitor on /welcome, where "Show my ten" is a write
 * the server refuses, and every other screen (the board, the funnel, recent
 * activity, dream companies) was empty. This fills the account from the
 * live postings, on the server, before each demo ticket is issued:
 *
 * - the profile's onboarding answer and an invented student's details;
 * - applications across every board stage, dated over the last three weeks,
 *   two of them today so the day's counter and streak read as in use;
 * - three bookmarks, which make three dream companies.
 *
 * It rebuilds the applications and bookmarks when the newest one is older
 * than REFRESH_AFTER_MS, so the dates stay recent and closed postings drop
 * out. Only DEMO_CLERK_USER_ID's rows are ever touched, inside a transaction
 * that holds an advisory lock, so two visitors arriving together seed once.
 */
import { and, desc, eq, max, sql } from "drizzle-orm";
import {
  applicationsTable,
  bookmarksTable,
  db,
  jobDismissalsTable,
  jobsTable,
  notificationsTable,
  profilesTable,
  settingsTable,
} from "@workspace/db";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Under a day, so "applied today" is today for whoever opens the demo. */
export const REFRESH_AFTER_MS = 20 * HOUR;
/** Postings left for Today's ten before any are used for applications. */
const KEEP_FOR_QUEUE = 25;

export const DEMO_PROFILE = {
  name: "Demo Student",
  email: "demo@careerradar.example",
  college: "Example Institute of Technology",
  degree: "B.Tech",
  branch: "CSE",
  cgpa: 8.4,
  skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Java"],
  rolePreference: "both" as const,
  preferredLocations: ["anywhere"],
};

/** Board stages, oldest first, with how many days ago each was applied. */
const STAGES: Array<{
  status:
    | "saved"
    | "applied"
    | "oa_pending"
    | "oa_completed"
    | "interview_pending"
    | "interview_completed"
    | "offered"
    | "rejected";
  daysAgo: number | null;
  notes?: string;
  referral?: boolean;
}> = [
  { status: "offered", daysAgo: 20 },
  { status: "rejected", daysAgo: 18 },
  {
    status: "interview_completed",
    daysAgo: 16,
    notes: "Two rounds: DSA, then a system design discussion.",
    referral: true,
  },
  { status: "interview_pending", daysAgo: 13, notes: "Revise graphs and DP." },
  { status: "oa_completed", daysAgo: 11 },
  { status: "oa_pending", daysAgo: 8 },
  { status: "oa_pending", daysAgo: 6 },
  { status: "applied", daysAgo: 5 },
  { status: "applied", daysAgo: 4 },
  { status: "applied", daysAgo: 2 },
  { status: "applied", daysAgo: 0.05 },
  { status: "applied", daysAgo: 0.02 },
  { status: "saved", daysAgo: null },
  { status: "saved", daysAgo: null },
];
const BOOKMARKS = 3;

export type DemoSeedResult = "fresh" | "seeded";

export async function ensureDemoAccount(
  clerkId: string,
  now: Date = new Date(),
): Promise<DemoSeedResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('demo-seed'))`);

    // 1. The profile: answered onboarding, an invented student.
    const [existing] = await tx
      .select({ id: profilesTable.id })
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, clerkId));
    const profileValues = {
      ...DEMO_PROFILE,
      graduationYear: graduationYear(now),
      updatedAt: now,
    };
    let profileId: string;
    if (existing) {
      await tx
        .update(profilesTable)
        .set(profileValues)
        .where(eq(profilesTable.id, existing.id));
      profileId = existing.id;
    } else {
      const [created] = await tx
        .insert(profilesTable)
        .values({ clerkId, ...profileValues })
        .returning({ id: profilesTable.id });
      profileId = created!.id;
    }
    await tx
      .insert(settingsTable)
      .values({ clerkId, dailyApplicationTarget: 10, timezone: "Asia/Kolkata" })
      .onConflictDoNothing({ target: settingsTable.clerkId });

    // 2. Fresh enough already? Then leave the history alone.
    const [{ newest } = { newest: null }] = await tx
      .select({ newest: max(applicationsTable.createdAt) })
      .from(applicationsTable)
      .where(eq(applicationsTable.clerkId, clerkId));
    if (
      newest &&
      now.getTime() - new Date(newest).getTime() < REFRESH_AFTER_MS
    ) {
      return "fresh";
    }

    // 3. Rebuild the history from today's live postings.
    await tx
      .delete(applicationsTable)
      .where(eq(applicationsTable.clerkId, clerkId));
    await tx.delete(bookmarksTable).where(eq(bookmarksTable.clerkId, clerkId));
    await tx
      .delete(notificationsTable)
      .where(eq(notificationsTable.clerkId, clerkId));
    await tx
      .delete(jobDismissalsTable)
      .where(eq(jobDismissalsTable.profileId, profileId));

    const candidates = await tx
      .select({
        id: jobsTable.id,
        companyId: jobsTable.companyId,
        title: jobsTable.title,
      })
      .from(jobsTable)
      .where(
        and(
          eq(jobsTable.status, "active"),
          eq(jobsTable.isFresherEligible, true),
        ),
      )
      .orderBy(desc(jobsTable.relevanceScore), desc(jobsTable.postedDate))
      .limit(400);

    // The strongest roles stay unapplied, for Today's ten; one role per
    // company, so the board reads as a real search.
    const pool = distinctByCompany(candidates.slice(KEEP_FOR_QUEUE));
    const forApplications = pool.slice(0, STAGES.length);
    const forBookmarks = pool.slice(STAGES.length, STAGES.length + BOOKMARKS);

    if (forApplications.length > 0) {
      await tx.insert(applicationsTable).values(
        forApplications.map((job, i) => {
          const stage = STAGES[i]!;
          const at =
            stage.daysAgo === null
              ? null
              : new Date(now.getTime() - stage.daysAgo * DAY);
          return {
            clerkId,
            jobId: job.id,
            status: stage.status,
            appliedDate: at,
            notes: stage.notes ?? null,
            referralName: stage.referral ? "Alumni referral" : null,
            referralStatus: stage.referral ? "received" : "none",
            createdAt: at ?? now,
            updatedAt: now,
          };
        }),
      );
    }
    if (forBookmarks.length > 0) {
      await tx
        .insert(bookmarksTable)
        .values(forBookmarks.map((job) => ({ clerkId, jobId: job.id })));
    }
    return "seeded";
  });
}

/** The batch graduating next summer: a final-year student's. */
function graduationYear(now: Date): number {
  return now.getUTCMonth() >= 6
    ? now.getUTCFullYear() + 1
    : now.getUTCFullYear();
}

function distinctByCompany<T extends { companyId: string | null }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.companyId ?? `none:${out.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
