import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";

// Real Postgres (PGlite). These three acceptance criteria are the only thing
// between a guard bug and a mass-closed job table, so every assertion below
// reads actual rows back out of an actual database. Asserting "the mock was
// called" would stay green for precisely the bug that matters.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { db, companiesTable, jobsTable, type InsertJob } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { deduplicationService } from "./deduplication";
import {
  DEFAULT_MAX_AGE_DAYS,
  closeAggregatorJobsOlderThan,
  closeExpiredDeadlineJobs,
  closeStaleAggregatorJobs,
  closeUnseenJobs,
  getMaxAgeDays,
  surveyJobsOlderThan,
} from "./staleness";

const T0 = new Date("2026-09-01T00:00:00.000Z");
const T1 = new Date("2026-09-02T00:00:00.000Z");
const T2 = new Date("2026-09-03T00:00:00.000Z");

describe("staleness sweeps", () => {
  let testDb: TestDb;
  let acmeId: string;
  let otherId: string;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    const [acme, other] = await db
      .insert(companiesTable)
      .values([
        { name: "Acme Corp", slug: "acme" },
        { name: "Other Co", slug: "other" },
      ])
      .returning();
    acmeId = acme.id;
    otherId = other.id;
  });

  /** A provider job as the normalizer would hand it over. */
  function providerJob(
    n: number,
    overrides: Partial<InsertJob> = {},
  ): InsertJob {
    return {
      companyId: acmeId,
      title: `SDE Intern ${n}`,
      jobType: "internship",
      workMode: "onsite",
      sourcePlatform: "greenhouse",
      sourceUrl: `https://boards.test/acme/${n}`,
      postedDate: T0,
      status: "active",
      ...overrides,
    };
  }

  /**
   * One full provider cycle: persist what the provider returned (stamping
   * lastSeenAt), then sweep. Mirrors exactly what scheduler.runAll does.
   */
  async function syncCycle(
    jobs: InsertJob[],
    runStartedAt: Date,
    opts: { sourcePlatform?: string; fetchedCountOverride?: number } = {},
  ) {
    const upserts = await deduplicationService.upsertBatch(jobs, {
      seenAt: runStartedAt,
    });
    return closeUnseenJobs({
      sourcePlatform: opts.sourcePlatform ?? "greenhouse",
      companyIds: jobs.map((j) => j.companyId),
      runStartedAt,
      fetchedCount: opts.fetchedCountOverride ?? jobs.length,
      persistedCount: upserts.length,
      companySlug: "acme",
    });
  }

  async function rows() {
    return db
      .select({
        title: jobsTable.title,
        status: jobsTable.status,
        lastSeenAt: jobsTable.lastSeenAt,
        sourceUrl: jobsTable.sourceUrl,
      })
      .from(jobsTable)
      .orderBy(jobsTable.title);
  }

  async function statuses(): Promise<Record<string, string>> {
    return Object.fromEntries((await rows()).map((r) => [r.title, r.status]));
  }

  // ── Acceptance criterion 1 ────────────────────────────────────────────────
  describe("a zero-result fetch closes nothing", () => {
    it("leaves every job active when the provider returns an empty array", async () => {
      await syncCycle([providerJob(1), providerJob(2), providerJob(3)], T0);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 2": "active",
        "SDE Intern 3": "active",
      });

      // The provider now returns []. Nothing is persisted, nothing is stamped.
      const sweep = await closeUnseenJobs({
        sourcePlatform: "greenhouse",
        companyIds: [],
        runStartedAt: T1,
        fetchedCount: 0,
        persistedCount: 0,
        companySlug: "acme",
      });

      expect(sweep.skipped).toBe("empty-fetch");
      expect(sweep.closed).toBe(0);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 2": "active",
        "SDE Intern 3": "active",
      });
    });

    it("leaves every job active when the fetch returned rows but none could be persisted", async () => {
      // Normalizer dropped everything (unknown company, no companyName to
      // auto-create it) — the fetch count is non-zero but nothing was stamped.
      await syncCycle([providerJob(1), providerJob(2)], T0);

      const sweep = await closeUnseenJobs({
        sourcePlatform: "greenhouse",
        companyIds: [acmeId],
        runStartedAt: T1,
        fetchedCount: 12,
        persistedCount: 0,
        companySlug: "acme",
      });

      expect(sweep.skipped).toBe("nothing-persisted");
      expect(sweep.closed).toBe(0);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 2": "active",
      });
    });

    it("never closes an entire catalogue across repeated empty fetches", async () => {
      await syncCycle([providerJob(1), providerJob(2), providerJob(3)], T0);

      // companyIds is deliberately populated: a provider that errors or returns
      // [] still ran against a known company, and it is the fetch count alone
      // that has to stop the sweep here.
      for (const at of [T1, T2, new Date("2026-10-01T00:00:00.000Z")]) {
        const sweep = await closeUnseenJobs({
          sourcePlatform: "greenhouse",
          companyIds: [acmeId],
          runStartedAt: at,
          fetchedCount: 0,
          persistedCount: 0,
        });
        expect(sweep.skipped).toBe("empty-fetch");
        expect(sweep.closed).toBe(0);
      }

      const all = await rows();
      expect(all.every((r) => r.status === "active")).toBe(true);
      expect(all).toHaveLength(3);
    });
  });

  // ── Acceptance criterion 2 ────────────────────────────────────────────────
  describe("a fetch missing one previously-seen job closes exactly that job", () => {
    it("closes the dropped posting and leaves the rest active", async () => {
      await syncCycle([providerJob(1), providerJob(2), providerJob(3)], T0);

      // Job 2 is gone from the listing.
      const sweep = await syncCycle([providerJob(1), providerJob(3)], T1);

      expect(sweep.skipped).toBeNull();
      expect(sweep.closed).toBe(1);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 2": "closed",
        "SDE Intern 3": "active",
      });
    });

    it("restamps the postings that are still listed, even when unchanged", async () => {
      await syncCycle([providerJob(1), providerJob(2), providerJob(3)], T0);
      await syncCycle([providerJob(1), providerJob(3)], T1);

      const seen = Object.fromEntries(
        (await rows()).map((r) => [r.title, r.lastSeenAt?.toISOString()]),
      );
      // 1 and 3 were "skip" decisions — unchanged — and must still be stamped,
      // or the next run would read them as unseen and close them.
      expect(seen["SDE Intern 1"]).toBe(T1.toISOString());
      expect(seen["SDE Intern 3"]).toBe(T1.toISOString());
      expect(seen["SDE Intern 2"]).toBe(T0.toISOString());
    });

    it("does not touch another company on the same platform", async () => {
      await syncCycle(
        [
          providerJob(1),
          providerJob(2, {
            companyId: otherId,
            title: "Other Co Role",
            sourceUrl: "https://boards.test/other/2",
          }),
        ],
        T0,
      );

      // Only Acme is re-fetched, and it no longer lists job 1.
      await closeUnseenJobs({
        sourcePlatform: "greenhouse",
        companyIds: [acmeId],
        runStartedAt: T1,
        fetchedCount: 5,
        persistedCount: 5,
        companySlug: "acme",
      });

      expect(await statuses()).toEqual({
        "SDE Intern 1": "closed",
        "Other Co Role": "active",
      });
    });

    it("does not touch the same company on a different platform", async () => {
      await syncCycle([providerJob(1)], T0);
      await syncCycle(
        [
          providerJob(2, {
            sourcePlatform: "lever",
            sourceUrl: "https://jobs.lever.co/acme/2",
          }),
        ],
        T0,
        { sourcePlatform: "lever" },
      );

      // A greenhouse run that lists nothing it recognises.
      await closeUnseenJobs({
        sourcePlatform: "greenhouse",
        companyIds: [acmeId],
        runStartedAt: T1,
        fetchedCount: 3,
        persistedCount: 3,
        companySlug: "acme",
      });

      expect(await statuses()).toEqual({
        "SDE Intern 1": "closed",
        "SDE Intern 2": "active",
      });
    });

    it("closes rows that predate the feature, where lastSeenAt is still NULL", async () => {
      // Every row in the live table looks like this on the first run after deploy.
      await db.insert(jobsTable).values(providerJob(9));
      const [before] = await db
        .select({ lastSeenAt: jobsTable.lastSeenAt })
        .from(jobsTable);
      expect(before.lastSeenAt).toBeNull();

      await syncCycle([providerJob(1)], T1);

      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 9": "closed",
      });
    });
  });

  // ── Acceptance criterion 3 ────────────────────────────────────────────────
  describe("running the sweep twice changes nothing the second time", () => {
    it("is a no-op when re-run for the same provider run", async () => {
      await syncCycle([providerJob(1), providerJob(2), providerJob(3)], T0);
      const first = await syncCycle([providerJob(1), providerJob(3)], T1);
      expect(first.closed).toBe(1);

      const snapshot = JSON.stringify(await rows());

      const second = await closeUnseenJobs({
        sourcePlatform: "greenhouse",
        companyIds: [acmeId],
        runStartedAt: T1,
        fetchedCount: 2,
        persistedCount: 2,
        companySlug: "acme",
      });

      expect(second.closed).toBe(0);
      expect(second.closedIds).toEqual([]);
      expect(JSON.stringify(await rows())).toBe(snapshot);
    });

    it("is a no-op when the next cycle returns the same listing", async () => {
      await syncCycle([providerJob(1), providerJob(2), providerJob(3)], T0);
      expect(
        (await syncCycle([providerJob(1), providerJob(3)], T1)).closed,
      ).toBe(1);

      const statusesAfterFirst = await statuses();

      const third = await syncCycle([providerJob(1), providerJob(3)], T2);

      expect(third.closed).toBe(0);
      expect(await statuses()).toEqual(statusesAfterFirst);
    });

    it("does not re-close or reopen an already-closed job", async () => {
      await syncCycle([providerJob(1), providerJob(2)], T0);
      await syncCycle([providerJob(1)], T1);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 2": "closed",
      });

      const again = await syncCycle([providerJob(1)], T2);
      expect(again.closed).toBe(0);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 2": "closed",
      });
    });
  });

  // ── Aggregator handling ───────────────────────────────────────────────────
  describe("aggregator platforms", () => {
    it("are never touched by the last-seen sweep, even with a healthy fetch", async () => {
      await db.insert(jobsTable).values([
        providerJob(1, {
          sourcePlatform: "remoteok",
          sourceUrl: "https://remoteok.test/1",
          lastSeenAt: T0,
        }),
        providerJob(2, {
          sourcePlatform: "remoteok",
          sourceUrl: "https://remoteok.test/2",
          lastSeenAt: T0,
        }),
      ]);

      const sweep = await closeUnseenJobs({
        sourcePlatform: "remoteok",
        companyIds: [acmeId],
        runStartedAt: T1,
        fetchedCount: 40,
        persistedCount: 40,
      });

      expect(sweep.skipped).toBe("aggregator-platform");
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 2": "active",
      });
    });

    it("are closed by the age fallback once past SYNC_MAX_AGE_DAYS", async () => {
      const now = new Date("2026-09-13T00:00:00.000Z");
      const old = new Date("2026-06-01T00:00:00.000Z"); // ~104 days
      const recent = new Date("2026-09-10T00:00:00.000Z");

      await db.insert(jobsTable).values([
        providerJob(1, {
          sourcePlatform: "remoteok",
          sourceUrl: "https://remoteok.test/1",
          postedDate: old,
        }),
        providerJob(2, {
          sourcePlatform: "adzuna",
          sourceUrl: "https://adzuna.test/2",
          postedDate: recent,
        }),
        // An ATS row of the same age must NOT be caught by the age fallback —
        // last-seen is authoritative there, and Greenhouse boards legitimately
        // carry roles open for months.
        providerJob(3, { postedDate: old }),
        // No postedDate is not evidence of staleness.
        providerJob(4, {
          sourcePlatform: "jsearch",
          sourceUrl: "https://jsearch.test/4",
          postedDate: null,
        }),
      ]);

      const sweep = await closeStaleAggregatorJobs({ maxAgeDays: 45, now });

      expect(sweep.closed).toBe(1);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "closed",
        "SDE Intern 2": "active",
        "SDE Intern 3": "active",
        "SDE Intern 4": "active",
      });
    });

    it("age fallback is idempotent", async () => {
      const now = new Date("2026-09-13T00:00:00.000Z");
      await db.insert(jobsTable).values(
        providerJob(1, {
          sourcePlatform: "remoteok",
          sourceUrl: "https://remoteok.test/1",
          postedDate: new Date("2026-06-01T00:00:00.000Z"),
        }),
      );

      expect(
        (await closeStaleAggregatorJobs({ maxAgeDays: 45, now })).closed,
      ).toBe(1);
      expect(
        (await closeStaleAggregatorJobs({ maxAgeDays: 45, now })).closed,
      ).toBe(0);
    });
  });

  // ── The backfill's age cutoff ─────────────────────────────────────────────
  describe("the backfill age cutoff excludes ATS platforms", () => {
    /**
     * The bug this pins down: the backfill applied its 60-day cutoff to every
     * platform. Against the live table all 84 candidates were Lever (58) and
     * Greenhouse (26) — ATS rows still listed upstream — so running it would
     * have closed 84 live postings. Age is only evidence of death where absence
     * is not, which is aggregators and nothing else.
     */
    const now = new Date("2026-09-13T00:00:00.000Z");
    const old = new Date("2026-05-01T00:00:00.000Z"); // ~135 days

    async function seedMixedBacklog() {
      await db.insert(jobsTable).values([
        providerJob(1, { sourcePlatform: "lever", postedDate: old }),
        providerJob(2, { sourcePlatform: "lever", postedDate: old }),
        providerJob(3, { sourcePlatform: "greenhouse", postedDate: old }),
        providerJob(4, {
          sourcePlatform: "remoteok",
          sourceUrl: "https://remoteok.test/4",
          postedDate: old,
        }),
        providerJob(5, {
          sourcePlatform: "adzuna",
          sourceUrl: "https://adzuna.test/5",
          postedDate: old,
        }),
        // Young enough to be outside the cutoff on any platform.
        providerJob(6, {
          sourcePlatform: "remotive",
          sourceUrl: "https://remotive.test/6",
          postedDate: new Date("2026-09-10T00:00:00.000Z"),
        }),
      ]);
    }

    it("closes aggregator rows and leaves every ATS row active", async () => {
      await seedMixedBacklog();

      const { closed } = await closeAggregatorJobsOlderThan(60, now);

      expect(closed).toBe(2);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active", // lever
        "SDE Intern 2": "active", // lever
        "SDE Intern 3": "active", // greenhouse
        "SDE Intern 4": "closed", // remoteok
        "SDE Intern 5": "closed", // adzuna
        "SDE Intern 6": "active", // remotive, too recent
      });
    });

    it("reports the ATS rows separately instead of counting them as closable", async () => {
      await seedMixedBacklog();

      const survey = await surveyJobsOlderThan(60, now);

      expect(survey.closableCount).toBe(2);
      expect(
        Object.fromEntries(survey.closable.map((c) => [c.platform, c.count])),
      ).toEqual({ remoteok: 1, adzuna: 1 });

      expect(survey.excludedCount).toBe(3);
      expect(
        Object.fromEntries(survey.excluded.map((c) => [c.platform, c.count])),
      ).toEqual({ lever: 2, greenhouse: 1 });
    });

    it("closes nothing at all when the backlog is entirely ATS", async () => {
      await db
        .insert(jobsTable)
        .values([
          providerJob(1, { sourcePlatform: "lever", postedDate: old }),
          providerJob(2, { sourcePlatform: "greenhouse", postedDate: old }),
        ]);

      const survey = await surveyJobsOlderThan(60, now);
      expect(survey.closableCount).toBe(0);
      expect(survey.excludedCount).toBe(2);

      const { closed } = await closeAggregatorJobsOlderThan(60, now);
      expect(closed).toBe(0);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 2": "active",
      });
    });

    it("leaves rows with no postedDate and no platform alone", async () => {
      await db.insert(jobsTable).values([
        providerJob(1, {
          sourcePlatform: "remoteok",
          sourceUrl: "https://remoteok.test/1",
          postedDate: null,
        }),
        providerJob(2, { sourcePlatform: null, postedDate: old }),
      ]);

      const survey = await surveyJobsOlderThan(60, now);
      expect(survey.closableCount).toBe(0);
      // The platform-less row is past the cutoff, so it is reported — as
      // excluded, never as closable.
      expect(survey.excluded).toEqual([{ platform: null, count: 1 }]);

      expect((await closeAggregatorJobsOlderThan(60, now)).closed).toBe(0);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "active",
        "SDE Intern 2": "active",
      });
    });

    it("is idempotent", async () => {
      await seedMixedBacklog();
      expect((await closeAggregatorJobsOlderThan(60, now)).closed).toBe(2);
      expect((await closeAggregatorJobsOlderThan(60, now)).closed).toBe(0);
      expect((await surveyJobsOlderThan(60, now)).closableCount).toBe(0);
    });
  });

  // ── Deadline sweep ────────────────────────────────────────────────────────
  describe("expired deadlines", () => {
    it("closes past-deadline jobs on any platform and leaves the rest alone", async () => {
      const now = new Date("2026-09-13T00:00:00.000Z");
      await db.insert(jobsTable).values([
        providerJob(1, { deadline: new Date("2026-09-01T00:00:00.000Z") }),
        providerJob(2, {
          sourcePlatform: "remoteok",
          sourceUrl: "https://remoteok.test/2",
          deadline: new Date("2026-08-01T00:00:00.000Z"),
        }),
        providerJob(3, { deadline: new Date("2026-12-01T00:00:00.000Z") }),
        providerJob(4, { deadline: null }),
      ]);

      const sweep = await closeExpiredDeadlineJobs({ now });

      expect(sweep.closed).toBe(2);
      expect(await statuses()).toEqual({
        "SDE Intern 1": "closed",
        "SDE Intern 2": "closed",
        "SDE Intern 3": "active",
        "SDE Intern 4": "active",
      });
    });

    it("is idempotent", async () => {
      const now = new Date("2026-09-13T00:00:00.000Z");
      await db
        .insert(jobsTable)
        .values(
          providerJob(1, { deadline: new Date("2026-09-01T00:00:00.000Z") }),
        );

      expect((await closeExpiredDeadlineJobs({ now })).closed).toBe(1);
      expect((await closeExpiredDeadlineJobs({ now })).closed).toBe(0);
    });
  });
});

describe("getMaxAgeDays", () => {
  const original = process.env["SYNC_MAX_AGE_DAYS"];
  afterEach(() => {
    if (original === undefined) delete process.env["SYNC_MAX_AGE_DAYS"];
    else process.env["SYNC_MAX_AGE_DAYS"] = original;
  });

  it("defaults to 45 when unset", () => {
    delete process.env["SYNC_MAX_AGE_DAYS"];
    expect(getMaxAgeDays()).toBe(45);
    expect(DEFAULT_MAX_AGE_DAYS).toBe(45);
  });

  it("reads a valid override", () => {
    process.env["SYNC_MAX_AGE_DAYS"] = "90";
    expect(getMaxAgeDays()).toBe(90);
  });

  it("falls back to the default rather than throwing on a bad value", () => {
    // A typo in an env var must not take ingestion down on a live deployment.
    for (const bad of ["", "nonsense", "0", "-5"]) {
      process.env["SYNC_MAX_AGE_DAYS"] = bad;
      expect(getMaxAgeDays()).toBe(45);
    }
  });
});
