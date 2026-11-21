import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The demo account, filled on the server from real rows (PGlite): it has
 * answered onboarding, it has a board's worth of history, and nothing
 * belonging to anyone else is touched.
 */
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { eq } from "drizzle-orm";
import {
  applicationsTable,
  bookmarksTable,
  companiesTable,
  db,
  jobsTable,
  profilesTable,
} from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { ensureDemoAccount, REFRESH_AFTER_MS } from "./demo-seed";

const DEMO = "user_demo_account";
const OTHER = "user_real_student";
const NOW = new Date("2026-11-21T10:00:00Z");
let testDb: TestDb;

beforeAll(async () => {
  testDb = await getTestDb();
});

beforeEach(async () => {
  await truncateAll(testDb);
  const companies = await db
    .insert(companiesTable)
    .values(
      Array.from({ length: 60 }, (_, i) => ({
        name: `Invented Co ${i}`,
        slug: `invented-co-${i}`,
      })),
    )
    .returning({ id: companiesTable.id });
  await db.insert(jobsTable).values(
    companies.map((c, i) => ({
      companyId: c.id,
      title: `Software Engineer ${i}`,
      jobType: "full_time" as const,
      workMode: "onsite" as const,
      status: "active" as const,
      isFresherEligible: true,
      relevanceScore: 100 - i,
      postedDate: new Date(NOW.getTime() - (i % 7) * 86_400_000),
      sourcePlatform: "greenhouse",
      sourceUrl: `https://example.test/${i}`,
      applyUrl: `https://example.test/${i}/apply`,
    })),
  );
});

const appsOf = (clerkId: string) =>
  db
    .select()
    .from(applicationsTable)
    .where(eq(applicationsTable.clerkId, clerkId));

describe("ensureDemoAccount", () => {
  it("answers onboarding, so the demo never lands on /welcome", async () => {
    await ensureDemoAccount(DEMO, NOW);
    const [profile] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, DEMO));
    expect(profile?.rolePreference).toBe("both");
    expect(profile?.preferredLocations).toEqual(["anywhere"]);
    expect(profile?.graduationYear).toBe(2027);
  });

  it("fills every board stage, two applied today, and three dream companies", async () => {
    expect(await ensureDemoAccount(DEMO, NOW)).toBe("seeded");
    const apps = await appsOf(DEMO);
    expect(new Set(apps.map((a) => a.status))).toEqual(
      new Set([
        "saved",
        "applied",
        "oa_pending",
        "oa_completed",
        "interview_pending",
        "interview_completed",
        "offered",
        "rejected",
      ]),
    );
    const today = apps.filter(
      (a) =>
        a.appliedDate &&
        NOW.getTime() - a.appliedDate.getTime() < 12 * 3_600_000,
    );
    expect(today).toHaveLength(2);
    const marks = await db
      .select()
      .from(bookmarksTable)
      .where(eq(bookmarksTable.clerkId, DEMO));
    expect(marks).toHaveLength(3);
  });

  it("leaves the strongest roles for Today's ten", async () => {
    await ensureDemoAccount(DEMO, NOW);
    const used = new Set((await appsOf(DEMO)).map((a) => a.jobId));
    const top = await db
      .select({ id: jobsTable.id, score: jobsTable.relevanceScore })
      .from(jobsTable);
    const best = top.filter((j) => (j.score ?? 0) > 75).map((j) => j.id);
    expect(best.some((id) => used.has(id))).toBe(false);
  });

  it("keeps a fresh history, and rebuilds a stale one", async () => {
    await ensureDemoAccount(DEMO, NOW);
    const first = (await appsOf(DEMO)).map((a) => a.id).sort();
    expect(
      await ensureDemoAccount(DEMO, new Date(NOW.getTime() + 3_600_000)),
    ).toBe("fresh");
    expect((await appsOf(DEMO)).map((a) => a.id).sort()).toEqual(first);

    const later = new Date(NOW.getTime() + REFRESH_AFTER_MS + 3_600_000);
    expect(await ensureDemoAccount(DEMO, later)).toBe("seeded");
    const second = await appsOf(DEMO);
    expect(second.map((a) => a.id).sort()).not.toEqual(first);
    expect(second).toHaveLength(first.length);
  });

  it("touches no one else's rows", async () => {
    const [job] = await db
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .limit(1);
    await db.insert(profilesTable).values({
      clerkId: OTHER,
      name: "Real Student",
      email: "real@example.test",
    });
    await db
      .insert(applicationsTable)
      .values({ clerkId: OTHER, jobId: job!.id, status: "applied" });
    await db.insert(bookmarksTable).values({ clerkId: OTHER, jobId: job!.id });

    await ensureDemoAccount(DEMO, NOW);
    await ensureDemoAccount(
      DEMO,
      new Date(NOW.getTime() + 2 * REFRESH_AFTER_MS),
    );

    expect(await appsOf(OTHER)).toHaveLength(1);
    const [other] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.clerkId, OTHER));
    expect(other?.name).toBe("Real Student");
    expect(other?.rolePreference).toBeNull();
  });
});
