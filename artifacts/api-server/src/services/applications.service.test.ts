import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/**
 * The applications service, against real Postgres (Phase 9).
 *
 * Everything interesting in this service is a rule about what reaches the
 * database, and most of those rules are about the difference between
 * `undefined` and `null`: Drizzle drops an undefined key from `.set()` and
 * writes NULL for null, which is the only reason the drawer can erase a
 * follow-up date instead of being stuck with it. A mocked repository proves
 * the service passed an object along; only a real UPDATE proves the column
 * ended up NULL. The same goes for the unique (clerk_id, job_id) constraint,
 * the `applied` date default, and the referral-status allowlist.
 *
 * `routes/applications.test.ts` covers the HTTP layer with the service mocked;
 * this is the other half.
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
import { eq } from "drizzle-orm";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import {
  applicationsService,
  isReferralStatus,
  REFERRAL_STATUSES,
} from "./applications.service";

const CLERK_ID = "user_applications_service_spec";
const OTHER_CLERK_ID = "user_someone_else";

let companyId: string;

async function makeJob(
  title: string,
  jobType: "internship" | "full_time" = "internship",
): Promise<string> {
  const [job] = await db
    .insert(jobsTable)
    .values({ companyId, title, workMode: "hybrid", jobType })
    .returning();
  return job.id;
}

/** Read the row straight out of the table, bypassing the service entirely. */
async function rawRow(id: string) {
  const [row] = await db
    .select()
    .from(applicationsTable)
    .where(eq(applicationsTable.id, id));
  return row;
}

describe("applicationsService", () => {
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

  describe("create", () => {
    it("defaults to 'saved' with no applied date", async () => {
      const jobId = await makeJob("SDE Intern");
      const app = await applicationsService.create(CLERK_ID, { jobId });

      expect(app.status).toBe("saved");
      expect(app.appliedDate).toBeNull();
      expect(app.job.company.name).toBe("Acme Corp");
    });

    it("stamps appliedDate when status is 'applied' and the caller sent none — one-click apply must never land undated", async () => {
      const jobId = await makeJob("SDE Intern");
      const before = Date.now();

      const app = await applicationsService.create(CLERK_ID, {
        jobId,
        status: "applied",
      });

      expect(app.appliedDate).toBeInstanceOf(Date);
      expect(app.appliedDate!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it("honours an explicit appliedDate over the default", async () => {
      const jobId = await makeJob("SDE Intern");
      const iso = "2026-08-01T09:30:00.000Z";

      const app = await applicationsService.create(CLERK_ID, {
        jobId,
        status: "applied",
        appliedDate: iso,
      });

      expect(app.appliedDate!.toISOString()).toBe(iso);
    });

    it("rejects a second application to the same job before the unique index has to", async () => {
      const jobId = await makeJob("SDE Intern");
      await applicationsService.create(CLERK_ID, { jobId });

      await expect(
        applicationsService.create(CLERK_ID, { jobId }),
      ).rejects.toThrow(/already applied/i);
    });

    it("is scoped per user — another user may apply to the same job", async () => {
      const jobId = await makeJob("SDE Intern");
      await applicationsService.create(CLERK_ID, { jobId });

      const other = await applicationsService.create(OTHER_CLERK_ID, { jobId });
      expect(other.clerkId).toBe(OTHER_CLERK_ID);
    });

    it("rejects an unknown job id rather than writing a dangling row", async () => {
      await expect(
        applicationsService.create(CLERK_ID, {
          jobId: "00000000-0000-0000-0000-000000000000",
        }),
      ).rejects.toThrow(/not found/i);
    });

    it("leaves referralStatus to the column default instead of writing 'none' from code", async () => {
      const jobId = await makeJob("SDE Intern");
      const app = await applicationsService.create(CLERK_ID, { jobId });

      expect((await rawRow(app.id)).referralStatus).toBe("none");
    });
  });

  describe("update", () => {
    async function seed(): Promise<string> {
      const jobId = await makeJob("SDE Intern");
      const app = await applicationsService.create(CLERK_ID, {
        jobId,
        status: "applied",
        notes: "first pass",
      });
      await applicationsService.update(app.id, CLERK_ID, {
        followUpDate: "2026-09-20T00:00:00.000Z",
      });
      return app.id;
    }

    it("null clears the column; undefined leaves it alone", async () => {
      const id = await seed();
      expect((await rawRow(id)).followUpDate).toBeInstanceOf(Date);

      // notes not mentioned at all — must survive untouched.
      await applicationsService.update(id, CLERK_ID, { followUpDate: null });

      const row = await rawRow(id);
      expect(row.followUpDate).toBeNull();
      expect(row.notes).toBe("first pass");
    });

    it("an unparseable date is dropped rather than written as an invalid timestamp", async () => {
      const id = await seed();
      const before = (await rawRow(id)).followUpDate;

      await applicationsService.update(id, CLERK_ID, {
        followUpDate: "not a date",
      });

      expect((await rawRow(id)).followUpDate).toEqual(before);
    });

    it("returns null for another user's application and does not modify it", async () => {
      const id = await seed();

      const result = await applicationsService.update(id, OTHER_CLERK_ID, {
        status: "rejected",
      });

      expect(result).toBeNull();
      expect((await rawRow(id)).status).toBe("applied");
    });

    it("writes the referral fields through to the row", async () => {
      const id = await seed();

      const updated = await applicationsService.update(id, CLERK_ID, {
        referralStatus: "requested",
        referralName: "A teammate",
        contactUrl: "https://example.com/in/someone",
        outreachNotes: "Asked on 12 Sep",
      });

      expect(updated!.referralStatus).toBe("requested");
      expect(updated!.contactUrl).toBe("https://example.com/in/someone");
    });
  });

  describe("list", () => {
    it("filters by status and by the job's type, and paginates", async () => {
      const a = await makeJob("SDE Intern", "internship");
      const b = await makeJob("Backend Engineer", "full_time");
      await applicationsService.create(CLERK_ID, {
        jobId: a,
        status: "applied",
      });
      await applicationsService.create(CLERK_ID, { jobId: b, status: "saved" });

      const applied = await applicationsService.list(CLERK_ID, {
        status: "applied",
      });
      expect(applied.data.map((r) => r.job.title)).toEqual(["SDE Intern"]);

      const fullTime = await applicationsService.list(CLERK_ID, {
        jobType: "full_time",
      });
      expect(fullTime.data.map((r) => r.job.title)).toEqual([
        "Backend Engineer",
      ]);

      const paged = await applicationsService.list(CLERK_ID, { limit: "1" });
      expect(paged.data).toHaveLength(1);
      expect(paged.meta.total).toBe(2);
    });

    it("only 'true' turns on awaitingFollowUp — a stray ?awaitingFollowUp=0 must not filter", async () => {
      const jobId = await makeJob("SDE Intern");
      // No follow-up date, so the filter would exclude it if it were on.
      await applicationsService.create(CLERK_ID, { jobId });

      for (const value of ["0", "no", "1", undefined]) {
        const page = await applicationsService.list(CLERK_ID, {
          awaitingFollowUp: value,
        });
        expect(page.data, String(value)).toHaveLength(1);
      }

      const on = await applicationsService.list(CLERK_ID, {
        awaitingFollowUp: "true",
      });
      expect(on.data).toHaveLength(0);
    });

    it("never returns another user's rows", async () => {
      const jobId = await makeJob("SDE Intern");
      await applicationsService.create(OTHER_CLERK_ID, { jobId });

      const page = await applicationsService.list(CLERK_ID, {});
      expect(page.data).toHaveLength(0);
    });
  });

  describe("getStatusMap and getStats", () => {
    it("maps jobId to status for the jobs list", async () => {
      const a = await makeJob("SDE Intern");
      const b = await makeJob("Backend Engineer");
      await applicationsService.create(CLERK_ID, {
        jobId: a,
        status: "applied",
      });
      await applicationsService.create(CLERK_ID, { jobId: b, status: "saved" });

      expect(await applicationsService.getStatusMap(CLERK_ID)).toEqual({
        [a]: "applied",
        [b]: "saved",
      });
    });

    it("counts by status, omitting statuses with no rows", async () => {
      const a = await makeJob("SDE Intern");
      const b = await makeJob("Backend Engineer");
      await applicationsService.create(CLERK_ID, {
        jobId: a,
        status: "applied",
      });
      await applicationsService.create(CLERK_ID, {
        jobId: b,
        status: "applied",
      });

      expect(await applicationsService.getStats(CLERK_ID)).toEqual({
        total: 2,
        byStatus: { applied: 2 },
      });
    });
  });

  describe("delete", () => {
    it("removes the row and reports true; a second delete reports false", async () => {
      const jobId = await makeJob("SDE Intern");
      const app = await applicationsService.create(CLERK_ID, { jobId });

      expect(await applicationsService.delete(app.id, CLERK_ID)).toBe(true);
      expect(await applicationsService.delete(app.id, CLERK_ID)).toBe(false);
    });

    it("will not delete another user's application", async () => {
      const jobId = await makeJob("SDE Intern");
      const app = await applicationsService.create(CLERK_ID, { jobId });

      expect(await applicationsService.delete(app.id, OTHER_CLERK_ID)).toBe(
        false,
      );
      expect(await rawRow(app.id)).toBeDefined();
    });
  });

  describe("isReferralStatus", () => {
    it("accepts exactly the four values the OpenAPI enum lists", () => {
      expect([...REFERRAL_STATUSES]).toEqual([
        "none",
        "requested",
        "received",
        "declined",
      ]);
      for (const value of REFERRAL_STATUSES) {
        expect(isReferralStatus(value)).toBe(true);
      }
    });

    it("rejects anything else, so the drawer's select is never handed a value it has no label for", () => {
      for (const value of ["", "None", "pending", null, undefined, 3, {}]) {
        expect(isReferralStatus(value)).toBe(false);
      }
    });
  });
});
