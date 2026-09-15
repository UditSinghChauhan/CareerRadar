import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

// Real Postgres (PGlite), for the same reason as relevance-filters.test.ts.
// Everything this suite is about lives in SQL: a window function that collapses
// duplicates, two NOT EXISTS anti-joins, and a CASE ladder that has to produce
// the same numbers as the TypeScript in priority.ts. A mocked `db` could prove
// none of it.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import {
  applicationsTable,
  bookmarksTable,
  companiesTable,
  db,
  jobDismissalsTable,
  jobsTable,
  profilesTable,
  settingsTable,
} from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { dailyQueue, dreamCompanyIds } from "./daily-queue.repository";
import {
  dailyQueueDay,
  deadlineUrgency,
  freshness,
  normalizeTitleForDedupe,
  priorityFromComponents,
  tieBreakKey,
} from "./priority";
import { dailyProgress, streakFrom, shiftDay } from "./daily-target";
import { jobDismissalsRepository } from "../repositories/jobDismissals.repository";
import { jobsRepository } from "../repositories/jobs.repository";

const NOW = new Date("2026-09-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const CLERK_ID = "user_queue_test";
const OTHER_CLERK_ID = "user_someone_else";

let testDb: TestDb;
let profileId: string;

interface JobSpec {
  title: string;
  company: string;
  ageDays?: number;
  deadlineInDays?: number | null;
  relevanceScore?: number | null;
  isFresherEligible?: boolean;
  status?: "active" | "closed" | "draft";
}

async function insertCompany(name: string): Promise<string> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [existing] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.slug, slug));
  if (existing) return existing.id;
  const [row] = await db
    .insert(companiesTable)
    .values({ name, slug })
    .returning({ id: companiesTable.id });
  return row!.id;
}

async function insertJob(spec: JobSpec): Promise<string> {
  const companyId = await insertCompany(spec.company);
  const [row] = await db
    .insert(jobsTable)
    .values({
      companyId,
      title: spec.title,
      jobType: "internship",
      workMode: "onsite",
      status: spec.status ?? "active",
      relevanceScore:
        spec.relevanceScore === undefined ? 100 : spec.relevanceScore,
      relevanceTrack: "internship",
      isFresherEligible: spec.isFresherEligible ?? true,
      postedDate: new Date(NOW.getTime() - (spec.ageDays ?? 1) * DAY),
      deadline:
        spec.deadlineInDays == null
          ? null
          : new Date(NOW.getTime() + spec.deadlineInDays * DAY),
      // Each insert gets a distinct source_url, exactly like the live
      // Adzuna rows whose `?se=` token differs on every sync pass.
      sourcePlatform: "adzuna",
      sourceUrl: `https://example.test/ad/1?se=${Math.random()}`,
      applyUrl: "https://example.test/apply",
    })
    .returning({ id: jobsTable.id });
  return row!.id;
}

const QUEUE_DAY = "2026-09-15";

async function queue(limit = 10, queueDay = QUEUE_DAY) {
  return dailyQueue({
    clerkId: CLERK_ID,
    profileId,
    limit,
    now: NOW,
    queueDay,
  });
}

beforeAll(async () => {
  testDb = await getTestDb();
});

beforeEach(async () => {
  await truncateAll(testDb);
  const [profile] = await db
    .insert(profilesTable)
    .values({
      clerkId: CLERK_ID,
      name: "Queue Test",
      email: "queue@example.test",
      graduationYear: 2027,
      skills: [],
    })
    .returning({ id: profilesTable.id });
  profileId = profile!.id;
});

describe("dailyQueue — exclusions (§3.1)", () => {
  it("returns active, fresher-eligible rows", async () => {
    await insertJob({ title: "SDE Intern", company: "Acme" });
    const { items } = await queue();
    expect(items).toHaveLength(1);
    expect(items[0]!.job.title).toBe("SDE Intern");
  });

  it("excludes closed and draft rows", async () => {
    await insertJob({
      title: "Closed Intern",
      company: "Acme",
      status: "closed",
    });
    await insertJob({
      title: "Draft Intern",
      company: "Acme",
      status: "draft",
    });
    await insertJob({ title: "Live Intern", company: "Acme" });
    const { items } = await queue();
    expect(items.map((i) => i.job.title)).toEqual(["Live Intern"]);
  });

  it("excludes rows the classifier ruled out", async () => {
    await insertJob({
      title: "Senior Staff Engineer",
      company: "Acme",
      isFresherEligible: false,
      relevanceScore: 0,
    });
    await insertJob({ title: "Live Intern", company: "Acme" });
    const { items } = await queue();
    expect(items.map((i) => i.job.title)).toEqual(["Live Intern"]);
  });

  it("excludes anything already applied to, whatever the application status", async () => {
    const appliedId = await insertJob({
      title: "Applied Intern",
      company: "Acme",
    });
    const savedId = await insertJob({ title: "Saved Intern", company: "Acme" });
    await insertJob({ title: "Untouched Intern", company: "Acme" });

    await db.insert(applicationsTable).values([
      {
        clerkId: CLERK_ID,
        jobId: appliedId,
        status: "applied",
        appliedDate: NOW,
      },
      // "saved" counts too: the user has seen it and acted, so the queue
      // should not assign it again as new work.
      { clerkId: CLERK_ID, jobId: savedId, status: "saved" },
    ]);

    const { items } = await queue();
    expect(items.map((i) => i.job.title)).toEqual(["Untouched Intern"]);
  });

  it("does not let another user's application hide a job from this one", async () => {
    const jobId = await insertJob({ title: "Shared Intern", company: "Acme" });
    await db.insert(applicationsTable).values({
      clerkId: OTHER_CLERK_ID,
      jobId,
      status: "applied",
      appliedDate: NOW,
    });
    const { items } = await queue();
    expect(items.map((i) => i.job.title)).toEqual(["Shared Intern"]);
  });

  it("excludes dismissed rows, and restores them when the dismissal is undone", async () => {
    const dismissedId = await insertJob({
      title: "Nope Intern",
      company: "Acme",
    });
    await insertJob({ title: "Yes Intern", company: "Acme" });

    await jobDismissalsRepository.add(profileId, dismissedId, "wrong stack");
    expect((await queue()).items.map((i) => i.job.title)).toEqual([
      "Yes Intern",
    ]);

    await jobDismissalsRepository.remove(profileId, dismissedId);
    expect((await queue()).items.map((i) => i.job.title).sort()).toEqual([
      "Nope Intern",
      "Yes Intern",
    ]);
  });

  it("ignores dismissals belonging to a different profile", async () => {
    const [other] = await db
      .insert(profilesTable)
      .values({
        clerkId: OTHER_CLERK_ID,
        name: "Other",
        email: "other@example.test",
        skills: [],
      })
      .returning({ id: profilesTable.id });
    const jobId = await insertJob({
      title: "Contested Intern",
      company: "Acme",
    });
    await jobDismissalsRepository.add(other!.id, jobId);

    const { items } = await queue();
    expect(items.map((i) => i.job.title)).toEqual(["Contested Intern"]);
  });

  it("works for a user with no profile row — they can have no dismissals", async () => {
    await insertJob({ title: "Anon Intern", company: "Acme" });
    const { items } = await dailyQueue({
      clerkId: CLERK_ID,
      profileId: null,
      limit: 10,
      now: NOW,
      queueDay: QUEUE_DAY,
    });
    expect(items.map((i) => i.job.title)).toEqual(["Anon Intern"]);
  });

  it("honours the limit and reports what it chose from", async () => {
    for (let i = 0; i < 15; i += 1) {
      await insertJob({
        title: `Intern Role ${i}`,
        company: "Acme",
        ageDays: i + 1,
      });
    }
    const { items, eligibleCount, distinctCount } = await queue(10);
    expect(items).toHaveLength(10);
    expect(eligibleCount).toBe(15);
    expect(distinctCount).toBe(15);
  });

  it("returns an empty queue rather than failing when nothing is eligible", async () => {
    const { items, eligibleCount, distinctCount } = await queue();
    expect(items).toEqual([]);
    expect(eligibleCount).toBe(0);
    expect(distinctCount).toBe(0);
  });
});

describe("dailyQueue — the SQL and the TypeScript agree", () => {
  /**
   * The formula exists twice: rendered into SQL by `priorityComponentsSql`
   * and computed in `priorityFromComponents`. They are generated from the
   * same constants, but "generated from the same constants" is a claim, and
   * a CASE ladder or a rounding cast can still drift from its JavaScript
   * twin. This recomputes every component from the row's own dates and
   * asserts Postgres produced the same number.
   */
  it("matches component-for-component across the whole age and deadline range", async () => {
    const ages = [0, 1, 2, 3, 7, 16, 29, 30, 45, 120];
    const deadlines: Array<number | null> = [null, -5, 1, 2, 5, 10, 29, 60];

    for (const ageDays of ages) {
      for (const deadlineInDays of deadlines) {
        await insertJob({
          title: `Intern a${ageDays} d${deadlineInDays ?? "none"}`,
          company: "Acme",
          ageDays,
          deadlineInDays,
          relevanceScore: 100,
        });
      }
    }

    const { items } = await queue(ages.length * deadlines.length);
    expect(items.length).toBe(ages.length * deadlines.length);

    for (const item of items) {
      const expected = {
        relevanceScore: item.job.relevanceScore ?? 0,
        deadlineUrgency: deadlineUrgency(
          item.job.deadline ? new Date(item.job.deadline) : null,
          NOW,
        ),
        freshness: freshness(
          item.job.postedDate ? new Date(item.job.postedDate) : null,
          NOW,
        ),
        dreamCompanyBoost: 0,
      };
      expect({ title: item.job.title, ...item.components }).toEqual({
        title: item.job.title,
        ...expected,
      });
      expect(item.priority).toBe(priorityFromComponents(expected));
    }
  });

  it("treats a NULL relevance_score as 0 rather than dropping the row", async () => {
    await insertJob({
      title: "Unclassified Intern",
      company: "Acme",
      relevanceScore: null,
    });
    const { items } = await queue();
    expect(items).toHaveLength(1);
    expect(items[0]!.components.relevanceScore).toBe(0);
  });

  it("orders strictly by priority descending", async () => {
    await insertJob({ title: "Stale Intern", company: "Acme", ageDays: 40 });
    await insertJob({ title: "Fresh Intern", company: "Acme", ageDays: 1 });
    await insertJob({ title: "Middling Intern", company: "Acme", ageDays: 15 });

    const { items } = await queue();
    expect(items.map((i) => i.job.title)).toEqual([
      "Fresh Intern",
      "Middling Intern",
      "Stale Intern",
    ]);
    const priorities = items.map((i) => i.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
  });

  it("puts a real deadline above pure freshness, once one exists", async () => {
    // The single most valuable thing the deadline term will do when the data
    // finally carries deadlines: 0.30 × 100 beats 0.20 × 100.
    await insertJob({
      title: "Fresh No Deadline",
      company: "Acme",
      ageDays: 0,
    });
    await insertJob({
      title: "Old Closing Tomorrow",
      company: "Acme",
      ageDays: 25,
      deadlineInDays: 1,
    });
    const { items } = await queue();
    expect(items[0]!.job.title).toBe("Old Closing Tomorrow");
  });
});

describe("dailyQueue — dream companies", () => {
  it("boosts a company the user has bookmarked from", async () => {
    const bookmarkedJobId = await insertJob({
      title: "Bookmarked Intern",
      company: "Dreamco",
      ageDays: 20,
    });
    await db
      .insert(bookmarksTable)
      .values({ clerkId: CLERK_ID, jobId: bookmarkedJobId });

    // A second, different role at the same company — the boost is per
    // company, not per bookmarked job.
    await insertJob({
      title: "Another Dreamco Intern",
      company: "Dreamco",
      ageDays: 20,
    });
    await insertJob({ title: "Plain Intern", company: "Acme", ageDays: 20 });

    const { items } = await queue();
    const byTitle = new Map(items.map((i) => [i.job.title, i]));
    expect(
      byTitle.get("Another Dreamco Intern")!.components.dreamCompanyBoost,
    ).toBe(100);
    expect(byTitle.get("Plain Intern")!.components.dreamCompanyBoost).toBe(0);
    // The bookmarked job itself is still in the queue — a bookmark is not an
    // application.
    expect(byTitle.get("Bookmarked Intern")!.components.dreamCompanyBoost).toBe(
      100,
    );
    expect(items[0]!.job.company.name).toBe("Dreamco");
  });

  it("counts each dream company once, however many bookmarks it has", async () => {
    const a = await insertJob({ title: "One", company: "Dreamco" });
    const b = await insertJob({ title: "Two", company: "Dreamco" });
    await db.insert(bookmarksTable).values([
      { clerkId: CLERK_ID, jobId: a },
      { clerkId: CLERK_ID, jobId: b },
    ]);
    expect(await dreamCompanyIds(CLERK_ID)).toHaveLength(1);
  });

  it("does not boost from another user's bookmarks", async () => {
    const jobId = await insertJob({ title: "Solo Intern", company: "Dreamco" });
    await db.insert(bookmarksTable).values({ clerkId: OTHER_CLERK_ID, jobId });
    const { items } = await queue();
    expect(items[0]!.components.dreamCompanyBoost).toBe(0);
  });
});

describe("dailyQueue — duplicate collapse", () => {
  it("collapses the live Sadbhav cluster: six rows, six URLs, one advert", async () => {
    for (let i = 0; i < 6; i += 1) {
      await insertJob({
        title: "Web Developer",
        company: "Sadbhav Futuretech Limited",
        ageDays: 3,
      });
    }
    const { items, eligibleCount, distinctCount } = await queue();
    expect(eligibleCount).toBe(6);
    expect(distinctCount).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]!.duplicateCount).toBe(6);
    expect(items[0]!.reasons.join(" ")).toMatch(/6 identical listings/);
  });

  it("collapses across punctuation and case, not just exact strings", async () => {
    await insertJob({ title: "Web Developer", company: "Dupco", ageDays: 5 });
    await insertJob({ title: "web  developer", company: "Dupco", ageDays: 5 });
    await insertJob({ title: "Web-Developer!", company: "Dupco", ageDays: 5 });

    const { items } = await queue();
    expect(items).toHaveLength(1);
    expect(items[0]!.duplicateCount).toBe(3);
  });

  it("keeps the highest-priority instance of a duplicate group", async () => {
    // Same advert ingested three times; only the freshest has full freshness.
    await insertJob({ title: "Web Developer", company: "Dupco", ageDays: 25 });
    await insertJob({ title: "Web Developer", company: "Dupco", ageDays: 1 });
    await insertJob({ title: "Web Developer", company: "Dupco", ageDays: 12 });

    const { items } = await queue();
    expect(items).toHaveLength(1);
    // The 1-day-old row is the one kept: freshness 100.
    expect(items[0]!.components.freshness).toBe(100);
    expect(items[0]!.priority).toBe(
      priorityFromComponents({
        relevanceScore: 100,
        deadlineUrgency: 10,
        freshness: 100,
        dreamCompanyBoost: 0,
      }),
    );
  });

  it("does not collapse the same title at two different companies", async () => {
    await insertJob({ title: "Web Developer", company: "Alpha", ageDays: 4 });
    await insertJob({ title: "Web Developer", company: "Beta", ageDays: 4 });
    const { items, distinctCount } = await queue();
    expect(distinctCount).toBe(2);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.duplicateCount === 1)).toBe(true);
  });

  it("does not collapse genuinely different roles at one company", async () => {
    await insertJob({ title: "Web Developer", company: "Alpha", ageDays: 4 });
    await insertJob({
      title: "Web Developer Internship Ahmedabad",
      company: "Alpha",
      ageDays: 4,
    });
    const { items } = await queue();
    expect(items).toHaveLength(2);
  });

  it("frees the slots the duplicates were eating — the top ten gains real rows", async () => {
    // Twelve adverts, one of them ingested six times: without collapse the
    // ten-row queue is half one advert.
    for (let i = 0; i < 6; i += 1) {
      await insertJob({ title: "Web Developer", company: "Dupco", ageDays: 2 });
    }
    for (let i = 0; i < 11; i += 1) {
      await insertJob({
        title: `Distinct Intern ${i}`,
        company: "Acme",
        ageDays: 3 + i,
      });
    }

    const { items } = await queue(10);
    expect(items).toHaveLength(10);
    const titles = items.map((i) => i.job.title);
    expect(titles.filter((t) => t === "Web Developer")).toHaveLength(1);
    expect(new Set(titles).size).toBe(10);
  });

  it("agrees with the TypeScript dedupe key for every title it collapses", async () => {
    const titles = [
      "Web Developer",
      "web  developer",
      "WEB-DEVELOPER",
      "Frontend Intern",
      "frontend intern!!",
      "Data Analyst/Data Engineer Intern",
      "data analyst data engineer intern",
    ];
    for (const title of titles) {
      await insertJob({ title, company: "Keyco", ageDays: 5 });
    }
    const { distinctCount } = await queue(50);
    const expected = new Set(titles.map(normalizeTitleForDedupe)).size;
    expect(distinctCount).toBe(expected);
    expect(expected).toBe(3);
  });
});

describe("the jobs list hides dismissed rows (§3.2)", () => {
  it("drops a dismissed row from /api/jobs and restores it with showDismissed", async () => {
    const dismissedId = await insertJob({ title: "Hidden", company: "Acme" });
    await insertJob({ title: "Visible", company: "Acme" });
    await jobDismissalsRepository.add(profileId, dismissedId);

    const hidden = await jobsRepository.findAll(
      { status: "active", excludeDismissedForProfileId: profileId },
      { page: 1, limit: 50 },
    );
    expect(hidden.data.map((j) => j.title).sort()).toEqual(["Visible"]);
    expect(hidden.meta.total).toBe(1);

    // showDismissed = no profile id passed through = the pre-3.2 behaviour.
    const all = await jobsRepository.findAll(
      { status: "active" },
      { page: 1, limit: 50 },
    );
    expect(all.data.map((j) => j.title).sort()).toEqual(["Hidden", "Visible"]);
    expect(all.meta.total).toBe(2);
  });

  it("leaves the list untouched when the user has dismissed nothing", async () => {
    await insertJob({ title: "One", company: "Acme" });
    await insertJob({ title: "Two", company: "Acme" });
    const filtered = await jobsRepository.findAll(
      { status: "active", excludeDismissedForProfileId: profileId },
      { page: 1, limit: 50 },
    );
    expect(filtered.meta.total).toBe(2);
  });
});

describe("jobDismissalsRepository", () => {
  it("is idempotent — dismissing twice writes one row", async () => {
    const jobId = await insertJob({ title: "Nope", company: "Acme" });
    const first = await jobDismissalsRepository.add(profileId, jobId, "reason");
    const second = await jobDismissalsRepository.add(profileId, jobId);
    expect(second.id).toBe(first.id);
    // The original reason survives a bare re-dismissal.
    expect(second.reason).toBe("reason");
    expect(await jobDismissalsRepository.list(profileId)).toHaveLength(1);
  });

  it("reports whether there was anything to undo", async () => {
    const jobId = await insertJob({ title: "Nope", company: "Acme" });
    expect(await jobDismissalsRepository.remove(profileId, jobId)).toBe(false);
    await jobDismissalsRepository.add(profileId, jobId);
    expect(await jobDismissalsRepository.remove(profileId, jobId)).toBe(true);
  });

  it("never touches the job row — a dismissal is a hide, not a delete", async () => {
    const jobId = await insertJob({ title: "Still Here", company: "Acme" });
    await jobDismissalsRepository.add(profileId, jobId);
    const job = await jobsRepository.findById(jobId);
    expect(job).not.toBeNull();
    expect(job!.status).toBe("active");
    expect(job!.title).toBe("Still Here");
  });

  it("cascades away with the job, leaving no orphan", async () => {
    const jobId = await insertJob({ title: "Doomed", company: "Acme" });
    await jobDismissalsRepository.add(profileId, jobId);
    await db.execute(
      sql`delete from ${jobsTable} where ${jobsTable.id} = ${jobId}`,
    );
    const rows = await db.select().from(jobDismissalsTable);
    expect(rows).toHaveLength(0);
  });
});

describe("dailyProgress — the counter and the streak (§3.3)", () => {
  async function logApplication(jobTitle: string, appliedAt: Date | null) {
    const jobId = await insertJob({ title: jobTitle, company: "Acme" });
    await db.insert(applicationsTable).values({
      clerkId: CLERK_ID,
      jobId,
      status: appliedAt ? "applied" : "saved",
      appliedDate: appliedAt,
    });
  }

  it("defaults to a target of 10 with no settings row", async () => {
    const progress = await dailyProgress(CLERK_ID);
    expect(progress.target).toBe(10);
    expect(progress.appliedToday).toBe(0);
    expect(progress.streakDays).toBe(0);
    expect(progress.timezone).toBe("Asia/Kolkata");
  });

  it("reads the configured target and timezone", async () => {
    await db.insert(settingsTable).values({
      clerkId: CLERK_ID,
      dailyApplicationTarget: 4,
      timezone: "UTC",
    });
    const progress = await dailyProgress(CLERK_ID);
    expect(progress.target).toBe(4);
    expect(progress.timezone).toBe("UTC");
  });

  it("counts today's applications and ignores saved rows with no applied date", async () => {
    await logApplication("Applied A", new Date());
    await logApplication("Applied B", new Date());
    await logApplication("Saved only", null);
    const progress = await dailyProgress(CLERK_ID);
    expect(progress.appliedToday).toBe(2);
  });

  it("does not count another user's applications", async () => {
    const jobId = await insertJob({ title: "Theirs", company: "Acme" });
    await db.insert(applicationsTable).values({
      clerkId: OTHER_CLERK_ID,
      jobId,
      status: "applied",
      appliedDate: new Date(),
    });
    expect((await dailyProgress(CLERK_ID)).appliedToday).toBe(0);
  });
});

describe("streakFrom — the pure boundary rules", () => {
  it("counts consecutive days back from today", () => {
    const days = new Set(["2026-09-15", "2026-09-14", "2026-09-13"]);
    expect(streakFrom(days, "2026-09-15")).toBe(3);
  });

  it("keeps a streak alive on a day that has not been used yet", () => {
    // 09-15 is still in progress with nothing logged. Zeroing the number at
    // every midnight would make it worthless.
    const days = new Set(["2026-09-14", "2026-09-13"]);
    expect(streakFrom(days, "2026-09-15")).toBe(2);
  });

  it("breaks the streak once a whole day has been missed", () => {
    const days = new Set(["2026-09-13", "2026-09-12"]);
    expect(streakFrom(days, "2026-09-15")).toBe(0);
  });

  it("is 0 with no applications at all", () => {
    expect(streakFrom(new Set(), "2026-09-15")).toBe(0);
  });

  it("counts a lone application today as a streak of 1", () => {
    expect(streakFrom(new Set(["2026-09-15"]), "2026-09-15")).toBe(1);
  });

  it("crosses month and year boundaries", () => {
    const days = new Set(["2027-01-01", "2026-12-31", "2026-12-30"]);
    expect(streakFrom(days, "2027-01-01")).toBe(3);
    expect(shiftDay("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("the tie rotation — why the queue is not the same ten forever", () => {
  /**
   * The measurement this exists for (live table, 2026-09-15): every row in
   * the top ten scored an identical 63.00, and running the real query with
   * the clock advanced 1/2/3/5/7/14 days returned exactly the same ten rows
   * each time. Freshness is monotone in posted_date, so it scales the gap
   * between two rows but can never reorder them — which means the ranking
   * contributes no turnover at all, and the ~610 other rows sitting at
   * relevance 100 are unreachable.
   */

  /** 30 rows that all score exactly the same priority. */
  async function insertTiedBlock(n: number): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      await insertJob({
        title: `Tied Intern ${i}`,
        company: `Tieco ${i}`,
        // Same age, same relevance, no deadline → byte-identical priority.
        ageDays: 1,
        relevanceScore: 100,
      });
    }
  }

  it("really does produce an exact tie, not a near-one", async () => {
    await insertTiedBlock(30);
    const { items } = await queue(30);
    expect(new Set(items.map((i) => i.priority)).size).toBe(1);
    expect(items[0]!.priority).toBe(63);
  });

  it("is stable within a day — refreshing returns the same ten in the same order", async () => {
    await insertTiedBlock(30);
    const first = await queue(10, "2026-09-15");
    const second = await queue(10, "2026-09-15");
    expect(second.items.map((i) => i.job.id)).toEqual(
      first.items.map((i) => i.job.id),
    );
  });

  it("rotates between days — the set genuinely changes", async () => {
    await insertTiedBlock(30);
    const day1 = new Set(
      (await queue(10, "2026-09-15")).items.map((i) => i.job.id),
    );
    const day2 = new Set(
      (await queue(10, "2026-09-16")).items.map((i) => i.job.id),
    );
    const day3 = new Set(
      (await queue(10, "2026-09-17")).items.map((i) => i.job.id),
    );

    // Not identical to the previous day — the whole point.
    expect([...day2].filter((id) => day1.has(id)).length).toBeLessThan(10);
    expect([...day3].filter((id) => day1.has(id)).length).toBeLessThan(10);
    expect(day2).not.toEqual(day1);
    expect(day3).not.toEqual(day2);
  });

  it("makes the whole tied block reachable over a month of rotations", async () => {
    // The defect being fixed: before the rotation, 20 of these 30 rows could
    // never appear, however long the user waited.
    await insertTiedBlock(30);
    const seen = new Set<string>();
    // 31 days keeps this deterministic in CI despite random job ids.
    for (let d = 15; d <= 45; d += 1) {
      const day = `2026-09-${String(d).padStart(2, "0")}`;
      for (const item of (await queue(10, day)).items) seen.add(item.job.id);
    }
    expect(seen.size).toBe(30);
  });

  it("never reorders rows that differ in priority", async () => {
    // The rotation is a TIE-break. If it could outrank priority it would be a
    // reordering, and the spec's formula would no longer decide anything.
    await insertJob({ title: "Fresh", company: "A", ageDays: 0 });
    await insertJob({ title: "Middling", company: "B", ageDays: 14 });
    await insertJob({ title: "Stale", company: "C", ageDays: 40 });

    for (let d = 15; d <= 28; d += 1) {
      const day = `2026-09-${String(d).padStart(2, "0")}`;
      const { items } = await queue(10, day);
      expect(items.map((i) => i.job.title)).toEqual([
        "Fresh",
        "Middling",
        "Stale",
      ]);
    }
  });

  it("does not let the rotation resurrect a dismissed row on a later day", async () => {
    await insertTiedBlock(30);
    const target = (await queue(10, "2026-09-15")).items[0]!.job.id;
    await jobDismissalsRepository.add(profileId, target);
    for (let d = 15; d <= 25; d += 1) {
      const day = `2026-09-${String(d).padStart(2, "0")}`;
      const ids = (await queue(30, day)).items.map((i) => i.job.id);
      expect(ids).not.toContain(target);
    }
  });

  it("agrees with Postgres's md5 on the shuffle key", async () => {
    // The key exists twice — tieBreakKey() in TypeScript and md5() in SQL.
    // If they drifted, the ordering the tests assert and the ordering
    // production serves would be different.
    const id = await insertJob({ title: "Keyed", company: "A" });
    const [row] = await db
      .select({ key: sql<string>`md5(${jobsTable.id}::text || ${QUEUE_DAY})` })
      .from(jobsTable)
      .where(eq(jobsTable.id, id));
    expect(row!.key).toBe(tieBreakKey(id, QUEUE_DAY));
  });
});

describe("dailyQueueDay — the rotation boundary is the user's midnight", () => {
  it("renders the local date, not the UTC one", () => {
    // 20:00 UTC on the 15th is 01:30 on the 16th in Asia/Kolkata.
    const late = new Date("2026-09-15T20:00:00Z");
    expect(dailyQueueDay(late, "Asia/Kolkata")).toBe("2026-09-16");
    expect(dailyQueueDay(late, "UTC")).toBe("2026-09-15");
  });

  it("does not flip mid-morning in Asia/Kolkata", () => {
    // The bug a UTC seed would cause: the queue reshuffling at 05:30 local,
    // in the middle of the hour someone is working through it.
    const beforeUtcMidnight = new Date("2026-09-15T23:00:00Z"); // 04:30 IST 16th
    const afterUtcMidnight = new Date("2026-09-16T01:00:00Z"); // 06:30 IST 16th
    expect(dailyQueueDay(beforeUtcMidnight, "Asia/Kolkata")).toBe(
      dailyQueueDay(afterUtcMidnight, "Asia/Kolkata"),
    );
  });

  it("falls back to the UTC date for an unknown zone rather than failing", () => {
    expect(
      dailyQueueDay(new Date("2026-09-15T12:00:00Z"), "Mars/Olympus"),
    ).toBe("2026-09-15");
  });
});
