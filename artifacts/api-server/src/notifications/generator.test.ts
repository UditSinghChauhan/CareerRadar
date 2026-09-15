import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Real Postgres (PGlite). The point of this suite is that the generator writes
 * the right ROWS and — the part that actually matters on a six-hourly cron —
 * does not write them twice. Idempotency here is a unique constraint plus
 * ON CONFLICT DO NOTHING, which a mocked `db` cannot exercise at all: it would
 * happily "prove" deduplication that the database was never asked to enforce.
 */
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import {
  db,
  applicationsTable,
  bookmarksTable,
  companiesTable,
  jobsTable,
  notificationsTable,
  savedSearchesTable,
} from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import {
  applicationsRepository,
  TERMINAL_STATUSES,
} from "../repositories/applications.repository";
import {
  generateNotifications,
  REMINDER_SUPPRESSED_STATUSES,
} from "./generator";

const CLERK_ID = "user_notifications_spec";
const OTHER_CLERK_ID = "user_someone_else";
const NOW = new Date("2026-09-16T12:00:00.000Z");

function hoursFromNow(h: number): Date {
  return new Date(NOW.getTime() + h * 60 * 60 * 1000);
}

let companyId: string;

async function insertJob(overrides: {
  title: string;
  deadline?: Date | null;
  relevanceScore?: number;
  createdAt?: Date;
  status?: "active" | "closed";
}): Promise<string> {
  const [job] = await db
    .insert(jobsTable)
    .values({
      companyId,
      title: overrides.title,
      workMode: "hybrid",
      jobType: "internship",
      status: overrides.status ?? "active",
      deadline: overrides.deadline ?? null,
      relevanceScore: overrides.relevanceScore ?? null,
      isFresherEligible: true,
      postedDate: new Date("2026-09-15T00:00:00.000Z"),
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    })
    .returning();
  return job.id;
}

async function notificationsFor(clerkId = CLERK_ID) {
  return db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.clerkId, clerkId));
}

describe("notification generator", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    const [company] = await db
      .insert(companiesTable)
      .values({ name: "Acme Corp", slug: "acme" })
      .returning();
    companyId = company.id;
  });

  // ─── Deadline reminders ─────────────────────────────────────────────────────

  describe("deadline reminders", () => {
    it("announces a saved application whose deadline is inside 24 hours", async () => {
      const jobId = await insertJob({
        title: "SDE Intern",
        deadline: hoursFromNow(20),
      });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      const report = await generateNotifications(NOW);

      expect(report.deadlineReminders).toBe(1);
      const [row] = await notificationsFor();
      expect(row.type).toBe("deadline_reminder");
      expect(row.title).toBe("Closes within 24 hours");
      expect(row.message).toContain("SDE Intern");
      expect(row.message).toContain("Acme Corp");
      // Saved, not applied — the nudge is the whole point.
      expect(row.message).toContain("You have not applied yet.");
      expect(row.relatedJobId).toBe(jobId);
      expect(row.isRead).toBe(false);
      expect(row.dedupeKey).toBe(`deadline:${jobId}:24h`);
    });

    it("uses the 3-day wording for a deadline between 24 and 72 hours out", async () => {
      const jobId = await insertJob({
        title: "Backend Intern",
        deadline: hoursFromNow(60),
      });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      await generateNotifications(NOW);

      const [row] = await notificationsFor();
      expect(row.title).toBe("Closes within 3 days");
      expect(row.dedupeKey).toBe(`deadline:${jobId}:72h`);
    });

    it("drops the 'not applied yet' line once the application has been submitted", async () => {
      const jobId = await insertJob({
        title: "SDE Intern",
        deadline: hoursFromNow(20),
      });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "applied" });

      await generateNotifications(NOW);

      const [row] = await notificationsFor();
      expect(row.message).not.toContain("not applied");
    });

    it("announces a bookmarked job the user has no application row for", async () => {
      const jobId = await insertJob({
        title: "Bookmarked Intern",
        deadline: hoursFromNow(10),
      });
      await db.insert(bookmarksTable).values({ clerkId: CLERK_ID, jobId });

      const report = await generateNotifications(NOW);

      expect(report.deadlineReminders).toBe(1);
      expect((await notificationsFor())[0].message).toContain(
        "You have not applied yet.",
      );
    });

    it("announces a job that is both bookmarked and saved exactly once", async () => {
      const jobId = await insertJob({
        title: "Double Counted",
        deadline: hoursFromNow(10),
      });
      await db.insert(bookmarksTable).values({ clerkId: CLERK_ID, jobId });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      const report = await generateNotifications(NOW);

      expect(report.deadlineReminders).toBe(1);
      expect(await notificationsFor()).toHaveLength(1);
    });

    it.each(["rejected", "withdrawn", "offered"] as const)(
      "stays silent about a %s application",
      async (status) => {
        const jobId = await insertJob({
          title: "Closed Chapter",
          deadline: hoursFromNow(10),
        });
        await db
          .insert(applicationsTable)
          .values({ clerkId: CLERK_ID, jobId, status });

        const report = await generateNotifications(NOW);

        expect(report.deadlineReminders).toBe(0);
        expect(await notificationsFor()).toHaveLength(0);
      },
    );

    it("does not remind about an offer, but still leaves it awaiting follow-up", async () => {
      // THE ANTI-DRIFT TEST. `offered` is the one status where the two lists
      // deliberately disagree, and it asserts both halves against the SAME row
      // so neither can be changed without the other being reconsidered:
      //
      //   REMINDER_SUPPRESSED_STATUSES — no reminder. The posting's closing
      //     date is not the offer's accept-by date, so it is noise.
      //   TERMINAL_STATUSES            — still awaiting follow-up. An offer is
      //     the most urgent thing in the tracker, not the least.
      const jobId = await insertJob({
        title: "Offered And Still Listed",
        deadline: hoursFromNow(10),
      });
      await db.insert(applicationsTable).values({
        clerkId: CLERK_ID,
        jobId,
        status: "offered",
        followUpDate: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
      });

      const report = await generateNotifications(NOW);

      expect(report.deadlineReminders).toBe(0);
      expect(await notificationsFor()).toHaveLength(0);

      const awaiting = await applicationsRepository.findAll(
        CLERK_ID,
        { awaitingFollowUp: true },
        { page: 1, limit: 20 },
      );
      expect(awaiting.data.map((a) => a.job.title)).toEqual([
        "Offered And Still Listed",
      ]);
    });

    it("suppresses reminders for every terminal status too, by derivation", async () => {
      // REMINDER_SUPPRESSED_STATUSES is built from TERMINAL_STATUSES, so a
      // status that becomes terminal later stops producing reminders without
      // anyone having to remember this file.
      expect([...REMINDER_SUPPRESSED_STATUSES]).toEqual(
        expect.arrayContaining([...TERMINAL_STATUSES]),
      );
      expect(REMINDER_SUPPRESSED_STATUSES).toContain("offered");
      expect([...TERMINAL_STATUSES]).not.toContain("offered");
    });

    it("stays silent about a deadline that has already passed", async () => {
      const jobId = await insertJob({
        title: "Too Late",
        deadline: hoursFromNow(-2),
      });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      expect((await generateNotifications(NOW)).deadlineReminders).toBe(0);
    });

    it("stays silent about a deadline further out than 72 hours", async () => {
      const jobId = await insertJob({
        title: "Plenty Of Time",
        deadline: hoursFromNow(200),
      });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      expect((await generateNotifications(NOW)).deadlineReminders).toBe(0);
    });

    it("stays silent about a job that has been closed", async () => {
      const jobId = await insertJob({
        title: "Closed Posting",
        deadline: hoursFromNow(10),
        status: "closed",
      });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      expect((await generateNotifications(NOW)).deadlineReminders).toBe(0);
    });

    it("never announces one user's job to another", async () => {
      const jobId = await insertJob({
        title: "Private",
        deadline: hoursFromNow(10),
      });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      await generateNotifications(NOW);

      expect(await notificationsFor(OTHER_CLERK_ID)).toHaveLength(0);
    });
  });

  // ─── Idempotency ────────────────────────────────────────────────────────────

  describe("re-running the generator", () => {
    it("writes nothing the second time for the same job and bucket", async () => {
      // The cron fires every six hours, so the same job sits in the same
      // window for up to twelve consecutive passes. This is the assertion that
      // stops the bell filling with twelve copies of one deadline.
      const jobId = await insertJob({
        title: "Repeatedly Seen",
        deadline: hoursFromNow(60),
      });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      expect((await generateNotifications(NOW)).deadlineReminders).toBe(1);
      const second = await generateNotifications(
        new Date(NOW.getTime() + 6 * 60 * 60 * 1000),
      );

      expect(second.deadlineReminders).toBe(0);
      expect(await notificationsFor()).toHaveLength(1);
    });

    it("announces the same job again once it crosses into the 24h bucket", async () => {
      const deadline = hoursFromNow(60);
      const jobId = await insertJob({ title: "Crossing Over", deadline });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      await generateNotifications(NOW);
      // 48 hours later the same deadline is 12 hours away.
      const later = await generateNotifications(
        new Date(NOW.getTime() + 48 * 60 * 60 * 1000),
      );

      expect(later.deadlineReminders).toBe(1);
      const rows = await notificationsFor();
      expect(rows.map((r) => r.dedupeKey).sort()).toEqual([
        `deadline:${jobId}:24h`,
        `deadline:${jobId}:72h`,
      ]);
    });

    it("does not resurrect a notification the user has already read", async () => {
      const jobId = await insertJob({
        title: "Already Acknowledged",
        deadline: hoursFromNow(60),
      });
      await db
        .insert(applicationsTable)
        .values({ clerkId: CLERK_ID, jobId, status: "saved" });

      await generateNotifications(NOW);
      await db.update(notificationsTable).set({ isRead: true });

      await generateNotifications(NOW);

      const rows = await notificationsFor();
      expect(rows).toHaveLength(1);
      expect(rows[0].isRead).toBe(true);
    });
  });

  // ─── New-job alerts ─────────────────────────────────────────────────────────

  describe("new-job alerts", () => {
    beforeEach(() => {
      vi.stubEnv("NOTIFY_NEW_JOB_MIN_SCORE", "70");
      vi.stubEnv("NOTIFY_NEW_JOB_LOOKBACK_HOURS", "48");
      vi.stubEnv("NOTIFY_NEW_JOB_MAX_PER_SEARCH", "10");
    });

    async function saveSearch(
      filters: Record<string, unknown> = { jobType: "internship" },
      clerkId = CLERK_ID,
    ) {
      const [row] = await db
        .insert(savedSearchesTable)
        .values({ clerkId, name: "Internships", filters })
        .returning();
      return row;
    }

    it("announces a high-scoring job that matches a saved search", async () => {
      const search = await saveSearch();
      const jobId = await insertJob({
        title: "Great Match",
        relevanceScore: 88,
        createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      });

      const report = await generateNotifications(NOW);

      expect(report.newJobAlerts).toBe(1);
      const [row] = await notificationsFor();
      expect(row.type).toBe("new_job");
      expect(row.title).toBe('New match for "Internships"');
      expect(row.message).toContain("Great Match");
      expect(row.relatedJobId).toBe(jobId);
      expect(row.dedupeKey).toBe(`new_job:${search.id}:${jobId}`);
    });

    it("stays silent about a job below the threshold", async () => {
      await saveSearch();
      await insertJob({
        title: "Mediocre Match",
        relevanceScore: 40,
        createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      });

      expect((await generateNotifications(NOW)).newJobAlerts).toBe(0);
    });

    it("stays silent about a job that is not new", async () => {
      // Without the lookback bound, the first ever run announces the whole
      // table — thousands of rows, all of them already on the Jobs page.
      await saveSearch();
      await insertJob({
        title: "Ancient But Excellent",
        relevanceScore: 95,
        createdAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000),
      });

      expect((await generateNotifications(NOW)).newJobAlerts).toBe(0);
    });

    it("respects the saved search's own filters", async () => {
      await saveSearch({ jobType: "full_time" });
      await insertJob({
        title: "An Internship, Not A Full-Time Role",
        relevanceScore: 95,
        createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      });

      expect((await generateNotifications(NOW)).newJobAlerts).toBe(0);
    });

    it("caps how many it announces per saved search in one pass", async () => {
      vi.stubEnv("NOTIFY_NEW_JOB_MAX_PER_SEARCH", "2");
      await saveSearch();
      for (let i = 0; i < 5; i++) {
        await insertJob({
          title: `Match ${i}`,
          relevanceScore: 90,
          createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        });
      }

      expect((await generateNotifications(NOW)).newJobAlerts).toBe(2);
    });

    it("announces nothing twice, across passes", async () => {
      await saveSearch();
      await insertJob({
        title: "Seen Once",
        relevanceScore: 90,
        createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      });

      expect((await generateNotifications(NOW)).newJobAlerts).toBe(1);
      expect((await generateNotifications(NOW)).newJobAlerts).toBe(0);
    });

    it("turns off entirely when the threshold is set above the classifier's ceiling", async () => {
      vi.stubEnv("NOTIFY_NEW_JOB_MIN_SCORE", "101");
      await saveSearch();
      await insertJob({
        title: "Perfect Score",
        relevanceScore: 100,
        createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      });

      expect((await generateNotifications(NOW)).newJobAlerts).toBe(0);
    });

    it("sends each user only their own saved search's matches", async () => {
      await saveSearch({ jobType: "internship" }, OTHER_CLERK_ID);
      await insertJob({
        title: "Theirs",
        relevanceScore: 90,
        createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      });

      await generateNotifications(NOW);

      expect(await notificationsFor(CLERK_ID)).toHaveLength(0);
      expect(await notificationsFor(OTHER_CLERK_ID)).toHaveLength(1);
    });

    it("does nothing at all when nobody has a saved search", async () => {
      await insertJob({
        title: "Unwatched",
        relevanceScore: 99,
        createdAt: new Date(NOW.getTime() - 60 * 60 * 1000),
      });

      expect((await generateNotifications(NOW)).newJobAlerts).toBe(0);
    });
  });

  // ─── Failure handling ───────────────────────────────────────────────────────

  it("reports a failure instead of throwing, so a sync is never marked failed", async () => {
    // A notification is a convenience; the sync that just imported hundreds of
    // jobs is not. The cron's .catch() must never be reached from here.
    const spy = vi.spyOn(db, "select").mockImplementationOnce(() => {
      throw new Error("connection terminated unexpectedly");
    });

    const report = await generateNotifications(NOW);

    expect(report.error).toContain("connection terminated");
    expect(report.deadlineReminders).toBe(0);
    spy.mockRestore();
  });
});
