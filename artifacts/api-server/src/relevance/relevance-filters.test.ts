import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

// Real Postgres (PGlite), for the same reason as location-filters.test.ts:
// the relevance filters are WHERE clauses over nullable columns, and the
// backfill's promise is about which columns it does NOT write. Neither is
// something a mocked `db` can prove.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { db, companiesTable, jobsTable, profilesTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { jobsRepository } from "../repositories/jobs.repository";
import { jobsService } from "../services/jobs.service";
import { backfillLocations } from "./backfill-location";
import {
  backfillRelevance,
  relevanceTrackCountsFromDb,
} from "./backfill-relevance";
import { resetGraduationYearCache } from "./graduation-year";

const PAGE = { page: 1, limit: 100 };
const NOW = new Date("2026-09-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

/**
 * title → [location, jobType, postedDate, eligibleBatch]. One row per shape
 * the filter and the sort must separate.
 */
const FIXTURE: Array<
  [string, string | null, "internship" | "full_time", Date, number[]]
> = [
  // internship, India, fresh → top of the feed
  [
    "intern-blr-fresh",
    "Bengaluru, Karnataka",
    "internship",
    new Date(NOW.getTime() - 2 * DAY),
    [],
  ],
  // internship, India, stale → demoted by −20
  [
    "intern-blr-stale",
    "Bengaluru, Karnataka",
    "internship",
    new Date(NOW.getTime() - 60 * DAY),
    [],
  ],
  // internship, on-site abroad → −25
  [
    "intern-toronto",
    "Toronto, ",
    "internship",
    new Date(NOW.getTime() - 2 * DAY),
    [],
  ],
  // internship whose provider batch excludes 2027 → −40
  [
    "intern-2026-batch",
    "Bengaluru, Karnataka",
    "internship",
    new Date(NOW.getTime() - 2 * DAY),
    [2026],
  ],
  // new grad by title
  [
    "sde-1-ncr",
    "Gurugram, Haryana",
    "full_time",
    new Date(NOW.getTime() - 2 * DAY),
    [],
  ],
  // early career
  [
    "backend-developer",
    "Pune",
    "full_time",
    new Date(NOW.getTime() - 2 * DAY),
    [],
  ],
  // excluded by level
  [
    "sde-ii",
    "Bengaluru, Karnataka",
    "full_time",
    new Date(NOW.getTime() - 2 * DAY),
    [],
  ],
  // excluded by seniority
  [
    "senior-engineer",
    "Bengaluru, Karnataka",
    "full_time",
    new Date(NOW.getTime() - 2 * DAY),
    [],
  ],
  // the substring bug: provider says internship, title says International
  [
    "international-voice",
    "Noida, Uttar Pradesh",
    "internship",
    new Date(NOW.getTime() - 2 * DAY),
    [],
  ],
  // no role noun at all
  [
    "office-maid",
    "Mumbai, MH",
    "full_time",
    new Date(NOW.getTime() - 2 * DAY),
    [],
  ],
];

const TITLE_OF: Record<string, string> = {
  "intern-blr-fresh": "Software Engineer Intern",
  "intern-blr-stale": "Backend Developer Intern",
  "intern-toronto": "Software Engineer Intern",
  "intern-2026-batch": "SDE Intern",
  "sde-1-ncr": "SDE 1",
  "backend-developer": "Backend Developer",
  "sde-ii": "SDE II",
  "senior-engineer": "Senior Software Engineer",
  "international-voice": "International Voice Process",
  "office-maid": "Office Maid",
};

async function keys(
  filters: Parameters<typeof jobsRepository.findAll>[0],
  sort?: Parameters<typeof jobsRepository.findAll>[2],
) {
  const { data } = await jobsRepository.findAll(filters, PAGE, sort);
  // department carries the fixture key so titles can be real strings.
  return data.map((j) => j.department);
}

describe("relevance filters — WHERE clauses over real rows", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    await db.delete(profilesTable);
    resetGraduationYearCache();
    delete process.env["RELEVANCE_GRADUATION_YEAR"];

    const [company] = await db
      .insert(companiesTable)
      .values({ name: "Acme", slug: "acme" })
      .returning();

    // The classifier scores against the profile's year — insert one so the
    // batch modifiers can be proved through the real lookup.
    await db.insert(profilesTable).values({
      clerkId: "user_test",
      name: "Test",
      email: "test@example.com",
      graduationYear: 2027,
    });

    // Inserted with the relevance columns UNSET, the way every pre-2.1 row
    // is, then filled by the backfill.
    await db.insert(jobsTable).values(
      FIXTURE.map(([key, location, jobType, postedDate, eligibleBatch]) => ({
        companyId: company.id,
        title: TITLE_OF[key]!,
        department: key,
        location,
        jobType,
        postedDate,
        eligibleBatch,
        sourceUrl: `https://example.test/${key}`,
      })),
    );
    await backfillLocations();
  });

  it("before the backfill every row is unclassified and the fresher filter matches nothing", async () => {
    expect(await keys({ isFresherEligible: true })).toEqual([]);
    expect(await keys({})).toHaveLength(FIXTURE.length);
    const stored = await relevanceTrackCountsFromDb();
    expect(stored.active.unclassified).toBe(FIXTURE.length);
    expect(stored.activeFresherEligible).toBe(0);
  });

  describe("after the backfill", () => {
    beforeEach(async () => {
      await backfillRelevance({ now: NOW });
    });

    it("no relevance params → every row, exactly the pre-2.1 behaviour", async () => {
      expect((await keys({})).sort()).toEqual(FIXTURE.map(([k]) => k).sort());
    });

    it("isFresherEligible=true is the three real tracks; false is the rest", async () => {
      expect((await keys({ isFresherEligible: true })).sort()).toEqual(
        [
          "intern-blr-fresh",
          "intern-blr-stale",
          "intern-toronto",
          "intern-2026-batch",
          "sde-1-ncr",
          "backend-developer",
        ].sort(),
      );
      expect((await keys({ isFresherEligible: false })).sort()).toEqual(
        [
          "sde-ii",
          "senior-engineer",
          "international-voice",
          "office-maid",
        ].sort(),
      );
    });

    it("relevanceTrack is an OR over tracks", async () => {
      expect((await keys({ relevanceTrack: ["new_grad"] })).sort()).toEqual([
        "sde-1-ncr",
      ]);
      expect(
        (await keys({ relevanceTrack: ["new_grad", "early_career"] })).sort(),
      ).toEqual(["backend-developer", "sde-1-ncr"]);
    });

    it("minRelevanceScore is a >= on the stored score", async () => {
      const all = await jobsRepository.findAll({}, PAGE);
      const byKey = Object.fromEntries(
        all.data.map((j) => [j.department, j.relevanceScore]),
      );
      // Sanity on the fixture's spread before asserting the filter.
      expect(byKey["intern-blr-fresh"]).toBe(100); // 90 + India + recent, capped
      expect(byKey["intern-blr-stale"]).toBe(80); // 90 + 10 − 20
      expect(byKey["intern-toronto"]).toBe(75); // 90 + 10 − 25
      expect(byKey["intern-2026-batch"]).toBe(70); // 90 + 10 + 10 − 40
      expect(byKey["backend-developer"]).toBe(80); // 60 + 10 + 10
      expect(byKey["sde-ii"]).toBe(0);

      expect((await keys({ minRelevanceScore: 80 })).sort()).toEqual([
        "backend-developer",
        "intern-blr-fresh",
        "intern-blr-stale",
        "sde-1-ncr", // 85 + 10 + 10 → 100
      ]);
      expect((await keys({ minRelevanceScore: 81 })).sort()).toEqual([
        "intern-blr-fresh",
        "sde-1-ncr",
      ]);
    });

    it("sort=relevance is score desc, then newest, unclassified last", async () => {
      const { data } = await jobsRepository.findAll(
        { isFresherEligible: true },
        PAGE,
        "relevance",
      );
      const scores = data.map((j) => j.relevanceScore ?? -1);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      // Tie groups, since equal scores with equal posted dates have no
      // further order the SQL promises.
      const ordered = data.map((j) => j.department);
      expect(ordered.slice(0, 2).sort()).toEqual([
        "intern-blr-fresh",
        "sde-1-ncr",
      ]);
      expect(ordered.slice(2, 4).sort()).toEqual([
        "backend-developer",
        "intern-blr-stale",
      ]);
      expect(ordered.slice(4)).toEqual(["intern-toronto", "intern-2026-batch"]);

      // With the filter off, the four score-0 rows come after every real one.
      const everything = await keys({}, "relevance");
      expect(everything.slice(-4).sort()).toEqual([
        "international-voice",
        "office-maid",
        "sde-ii",
        "senior-engineer",
      ]);
    });

    it("unclassified rows sort last under sort=relevance, not first", async () => {
      // Simulate a row synced before the column existed.
      await db
        .update(jobsTable)
        .set({ relevanceScore: null, relevanceTrack: null })
        .where(eq(jobsTable.department, "intern-blr-fresh"));
      const everything = await keys({}, "relevance");
      expect(everything[everything.length - 1]).toBe("intern-blr-fresh");
    });

    it("sort=newest (the default) is unchanged by the relevance columns", async () => {
      const newest = await keys({}, "newest");
      const implicit = await keys({});
      expect(implicit).toEqual(newest);
      // The stale intern was posted 60 days ago and is last regardless of score.
      expect(newest[newest.length - 1]).toBe("intern-blr-stale");
    });

    it("seniorityExcluded is set only for rows a seniority marker ruled out", async () => {
      const rows = await db
        .select({
          key: jobsTable.department,
          excluded: jobsTable.seniorityExcluded,
          track: jobsTable.relevanceTrack,
        })
        .from(jobsTable)
        .orderBy(asc(jobsTable.department));
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
      expect(byKey["sde-ii"]).toMatchObject({
        excluded: true,
        track: "not_relevant",
      });
      expect(byKey["senior-engineer"]).toMatchObject({ excluded: true });
      // Ruled out, but not by seniority.
      expect(byKey["office-maid"]).toMatchObject({
        excluded: false,
        track: "not_relevant",
      });
      expect(byKey["international-voice"]).toMatchObject({ excluded: false });
      expect(byKey["intern-blr-fresh"]).toMatchObject({ excluded: false });
    });

    it("the stored distribution agrees with the report", async () => {
      const report = await backfillRelevance({ now: NOW });
      const stored = await relevanceTrackCountsFromDb();
      expect(stored.active.internship).toBe(report.activeTracks.internship);
      expect(stored.active.new_grad).toBe(report.activeTracks.new_grad);
      expect(stored.active.early_career).toBe(report.activeTracks.early_career);
      expect(stored.active.not_relevant).toBe(report.activeTracks.not_relevant);
      expect(stored.active.unclassified).toBe(0);
      expect(stored.activeFresherEligible).toBe(report.activeFresherEligible);
    });
  });

  describe("the backfill itself", () => {
    it("is idempotent: a second run with the same clock changes nothing", async () => {
      const first = await backfillRelevance({ now: NOW });
      expect(first.scanned).toBe(FIXTURE.length);
      expect(first.updated).toBe(FIXTURE.length);
      const second = await backfillRelevance({ now: NOW });
      expect(second.scanned).toBe(FIXTURE.length);
      expect(second.updated).toBe(0);
      expect(second.activeTracks).toEqual(first.activeTracks);
    });

    it("dryRun computes the same report and writes nothing", async () => {
      const dry = await backfillRelevance({ now: NOW, dryRun: true });
      expect(dry.updated).toBe(FIXTURE.length);
      expect(await keys({ isFresherEligible: true })).toEqual([]);
      const wet = await backfillRelevance({ now: NOW });
      expect(wet.activeTracks).toEqual(dry.activeTracks);
      expect(wet.topActiveTitles.map((t) => t.title)).toEqual(
        dry.topActiveTitles.map((t) => t.title),
      );
    });

    it("writes only the six relevance columns — nothing pre-existing moves", async () => {
      const before = await db
        .select()
        .from(jobsTable)
        .orderBy(asc(jobsTable.id));
      await backfillRelevance({ now: NOW });
      const after = await db
        .select()
        .from(jobsTable)
        .orderBy(asc(jobsTable.id));

      const RELEVANCE = new Set([
        "relevanceTrack",
        "relevanceScore",
        "isFresherEligible",
        "seniorityExcluded",
        "relevanceSignals",
        "classifiedAt",
      ]);
      for (let i = 0; i < before.length; i += 1) {
        for (const key of Object.keys(before[i]!) as Array<
          keyof (typeof before)[number]
        >) {
          if (RELEVANCE.has(key)) continue;
          expect(after[i]![key], String(key)).toEqual(before[i]![key]);
        }
        expect(after[i]!.updatedAt).toBeNull();
        expect(after[i]!.classifiedAt).not.toBeNull();
      }
    });

    it("uses the profile's graduation year for the batch modifiers", async () => {
      const report = await backfillRelevance({ now: NOW });
      expect(report.graduationYear).toBe(2027);
      const [row] = await db
        .select({ signals: jobsTable.relevanceSignals })
        .from(jobsTable)
        .where(eq(jobsTable.department, "intern-2026-batch"));
      expect(row!.signals).toContain("batch excludes 2027 −40");
    });

    it("RELEVANCE_GRADUATION_YEAR overrides the profile", async () => {
      process.env["RELEVANCE_GRADUATION_YEAR"] = "2026";
      const report = await backfillRelevance({ now: NOW });
      expect(report.graduationYear).toBe(2026);
      const [row] = await db
        .select({ signals: jobsTable.relevanceSignals })
        .from(jobsTable)
        .where(eq(jobsTable.department, "intern-2026-batch"));
      expect(row!.signals).toContain("batch matches 2026 +10");
    });

    it("ranks the report the way the feed sorts", async () => {
      const report = await backfillRelevance({ now: NOW, topN: 3 });
      expect(report.topActiveTitles).toHaveLength(3);
      const scores = report.topActiveTitles.map((t) => t.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(report.topActiveTitles[0]!.signals.length).toBeGreaterThan(0);
    });
  });

  describe("write-time classification", () => {
    it("a job created through the service is classified on insert", async () => {
      const [company] = await db.select().from(companiesTable).limit(1);
      const job = await jobsService.create({
        companyId: company!.id,
        title: "Software Development Engineer Intern - 2027",
        location: "Hyderabad, TS",
        workMode: "onsite",
        jobType: "internship",
      });
      expect(job.relevanceTrack).toBe("internship");
      expect(job.isFresherEligible).toBe(true);
      expect(job.relevanceScore).toBeGreaterThanOrEqual(90);
      expect(job.relevanceSignals).toContain("batch matches 2027 +10");
      expect(job.classifiedAt).not.toBeNull();
    });

    it("a title edit through the service re-classifies", async () => {
      const [row] = await db
        .select({ id: jobsTable.id })
        .from(jobsTable)
        .where(eq(jobsTable.department, "intern-blr-fresh"));
      const updated = await jobsService.update(row!.id, { title: "SDE II" });
      expect(updated?.relevanceTrack).toBe("not_relevant");
      expect(updated?.seniorityExcluded).toBe(true);
      expect(updated?.isFresherEligible).toBe(false);

      const restored = await jobsService.update(row!.id, {
        title: "Software Engineer Intern",
      });
      expect(restored?.relevanceTrack).toBe("internship");
    });

    it("an edit to an unrelated field leaves the verdict alone", async () => {
      await backfillRelevance({ now: NOW });
      const [row] = await db
        .select({ id: jobsTable.id, at: jobsTable.classifiedAt })
        .from(jobsTable)
        .where(eq(jobsTable.department, "intern-blr-fresh"));
      const updated = await jobsService.update(row!.id, { stipend: 25000 });
      expect(updated?.classifiedAt?.toISOString()).toBe(row!.at?.toISOString());
    });
  });
});
