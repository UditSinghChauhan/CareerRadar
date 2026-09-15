import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/**
 * Phase 6.1's "Awaiting follow-up" filter, against real Postgres.
 *
 * The cutoff is `now()` evaluated by the DATABASE, and the exclusion list is a
 * `NOT IN` over an enum. Both are properties of the emitted SQL, so this suite
 * runs the real query against real rows rather than asserting on a mock.
 */
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import {
  db,
  applicationsTable,
  companiesTable,
  jobsTable,
} from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { applicationsRepository } from "./applications.repository";
import { applicationsService } from "../services/applications.service";

const CLERK_ID = "user_follow_up_spec";
const PAGE = { page: 1, limit: 20 };

let companyId: string;

const HOUR = 60 * 60 * 1000;

async function makeApplication(opts: {
  title: string;
  followUpDate: Date | null;
  status?: (typeof applicationsTable.$inferInsert)["status"];
}) {
  const [job] = await db
    .insert(jobsTable)
    .values({
      companyId,
      title: opts.title,
      workMode: "hybrid",
      jobType: "internship",
    })
    .returning();
  const [application] = await db
    .insert(applicationsTable)
    .values({
      clerkId: CLERK_ID,
      jobId: job.id,
      status: opts.status ?? "applied",
      followUpDate: opts.followUpDate,
    })
    .returning();
  return application;
}

async function awaitingTitles(): Promise<string[]> {
  const page = await applicationsRepository.findAll(
    CLERK_ID,
    { awaitingFollowUp: true },
    PAGE,
  );
  return page.data.map((a) => a.job.title);
}

describe("awaiting follow-up filter", () => {
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

  it("returns a row whose follow-up date has come due", async () => {
    await makeApplication({
      title: "Due Yesterday",
      followUpDate: new Date(Date.now() - 24 * HOUR),
    });

    expect(await awaitingTitles()).toEqual(["Due Yesterday"]);
  });

  it("excludes a follow-up date still in the future", async () => {
    await makeApplication({
      title: "Due Next Week",
      followUpDate: new Date(Date.now() + 7 * 24 * HOUR),
    });

    expect(await awaitingTitles()).toEqual([]);
  });

  it("excludes a row with no follow-up date at all", async () => {
    await makeApplication({ title: "Never Scheduled", followUpDate: null });

    expect(await awaitingTitles()).toEqual([]);
  });

  it.each(["rejected", "withdrawn"] as const)(
    "excludes a %s application even when its follow-up date is overdue",
    async (status) => {
      await makeApplication({
        title: "Nothing Left To Chase",
        followUpDate: new Date(Date.now() - 24 * HOUR),
        status,
      });

      expect(await awaitingTitles()).toEqual([]);
    },
  );

  it("INCLUDES an overdue offer — the most urgent row, not the least", async () => {
    // Pinned as its own test rather than folded into the list below, because
    // this is the entry most likely to be swept back into TERMINAL_STATUSES by
    // mistake: "offered" sits next to "rejected" and "withdrawn" in the status
    // order and reads like a happy ending. An unanswered offer has an accept-by
    // date the student did not choose and a pipeline to unwind once they
    // decide, so it needs chasing more than anything else in the tracker.
    await makeApplication({
      title: "Offer Awaiting A Decision",
      followUpDate: new Date(Date.now() - 24 * HOUR),
      status: "offered",
    });

    expect(await awaitingTitles()).toEqual(["Offer Awaiting A Decision"]);
  });

  it.each([
    "saved",
    "applied",
    "oa_pending",
    "oa_completed",
    "interview_pending",
    "interview_completed",
    "offered",
  ] as const)("includes a %s application that is overdue", async (status) => {
    await makeApplication({
      title: "Still Live",
      followUpDate: new Date(Date.now() - HOUR),
      status,
    });

    expect(await awaitingTitles()).toEqual(["Still Live"]);
  });

  it("leaves the unfiltered list exactly as it was", async () => {
    // The pre-6.1 behaviour has to be byte-identical when the filter is off,
    // which is what lets the "All" tab reuse the existing cache entry.
    await makeApplication({ title: "A", followUpDate: null });
    await makeApplication({
      title: "B",
      followUpDate: new Date(Date.now() - HOUR),
    });
    await makeApplication({
      title: "C",
      followUpDate: null,
      status: "rejected",
    });

    const unfiltered = await applicationsRepository.findAll(CLERK_ID, {}, PAGE);
    expect(unfiltered.data).toHaveLength(3);
    expect(unfiltered.meta.total).toBe(3);
  });

  it("counts only the filtered rows, so pagination is not a lie", async () => {
    await makeApplication({ title: "A", followUpDate: null });
    await makeApplication({
      title: "B",
      followUpDate: new Date(Date.now() - HOUR),
    });

    const page = await applicationsRepository.findAll(
      CLERK_ID,
      { awaitingFollowUp: true },
      PAGE,
    );
    expect(page.meta.total).toBe(1);
    expect(page.meta.totalPages).toBe(1);
  });

  describe("query-string parsing", () => {
    beforeEach(async () => {
      await makeApplication({
        title: "Overdue",
        followUpDate: new Date(Date.now() - HOUR),
      });
      await makeApplication({ title: "Unscheduled", followUpDate: null });
    });

    it('filters on the literal string "true"', async () => {
      const page = await applicationsService.list(CLERK_ID, {
        awaitingFollowUp: "true",
      });
      expect(page.data.map((a) => a.job.title)).toEqual(["Overdue"]);
    });

    it.each(["false", "0", "no", "", undefined])(
      "treats %o as off rather than on",
      async (value) => {
        const page = await applicationsService.list(CLERK_ID, {
          awaitingFollowUp: value,
        });
        expect(page.data).toHaveLength(2);
      },
    );
  });
});

describe("clearing a field", () => {
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

  it("erases a follow-up date when the caller sends null", async () => {
    // Before Phase 6.1 the service collapsed null to undefined and skipped the
    // column, so a follow-up date could be set but never unset — and the row
    // would then sit in "Awaiting follow-up" forever.
    const application = await makeApplication({
      title: "Scheduled Then Cancelled",
      followUpDate: new Date(Date.now() - HOUR),
    });
    expect(await awaitingTitles()).toEqual(["Scheduled Then Cancelled"]);

    const updated = await applicationsService.update(application.id, CLERK_ID, {
      followUpDate: null,
    });

    expect(updated?.followUpDate).toBeNull();
    expect(await awaitingTitles()).toEqual([]);
  });

  it("leaves a field untouched when the caller omits it", async () => {
    const followUpDate = new Date(Date.now() - HOUR);
    const application = await makeApplication({
      title: "Untouched",
      followUpDate,
    });

    const updated = await applicationsService.update(application.id, CLERK_ID, {
      status: "interview_pending",
    });

    expect(updated?.status).toBe("interview_pending");
    expect(updated?.followUpDate?.toISOString()).toBe(
      followUpDate.toISOString(),
    );
  });

  it("round-trips the referral fields, and clears them with null", async () => {
    const application = await makeApplication({
      title: "Referral Tracked",
      followUpDate: null,
    });

    const set = await applicationsService.update(application.id, CLERK_ID, {
      referralName: "A former teammate",
      contactUrl: "https://www.linkedin.com/in/example",
      referralStatus: "requested",
      outreachNotes: "Messaged on Monday.",
    });

    expect(set?.referralName).toBe("A former teammate");
    expect(set?.contactUrl).toBe("https://www.linkedin.com/in/example");
    expect(set?.referralStatus).toBe("requested");
    expect(set?.outreachNotes).toBe("Messaged on Monday.");

    const cleared = await applicationsService.update(application.id, CLERK_ID, {
      referralName: null,
      contactUrl: null,
      outreachNotes: null,
    });

    expect(cleared?.referralName).toBeNull();
    expect(cleared?.contactUrl).toBeNull();
    expect(cleared?.outreachNotes).toBeNull();
    // referralStatus is NOT NULL — omitted, so it keeps its value.
    expect(cleared?.referralStatus).toBe("requested");
  });

  it("defaults referralStatus to 'none' on a row that never set it", async () => {
    const application = await makeApplication({
      title: "Never Asked",
      followUpDate: null,
    });
    const found = await applicationsRepository.findById(
      application.id,
      CLERK_ID,
    );
    expect(found?.referralStatus).toBe("none");
  });
});
