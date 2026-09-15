import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { desc, eq } from "drizzle-orm";

// Real Postgres (PGlite) standing in for the pool. The point of this suite is to
// compare what two different SELECT formulations actually return, so a mocked
// `db` would prove nothing at all.
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
} from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { applicationsRepository } from "./applications.repository";
import { bookmarksRepository } from "./bookmarks.repository";
import { jobsRepository } from "./jobs.repository";

/**
 * The exact `jobs` column set the API returned before Phase 1.5, in the order a
 * bare `db.select()` produced it. CLAUDE.md forbids changing an existing response
 * shape, so the explicit column lists must still reproduce this list — plus
 * `lastSeenAt`, which this phase adds deliberately and declares in openapi.yaml.
 */
const JOB_KEYS_BEFORE_PHASE_1_5 = [
  "id",
  "companyId",
  "sourceId",
  "title",
  "department",
  "location",
  "country",
  "workMode",
  "jobType",
  "salaryMin",
  "salaryMax",
  "stipend",
  "currency",
  "eligibleBatch",
  "eligibleBranches",
  "minCgpa",
  "requiredSkills",
  "experienceMin",
  "experienceMax",
  "deadline",
  "applyUrl",
  "sourcePlatform",
  "sourceUrl",
  "postedDate",
  "status",
  "description",
  "requirements",
  "benefits",
  "selectionProcess",
  "createdAt",
  "updatedAt",
];

const CLERK_ID = "user_columns_spec";

/**
 * Columns that exist on `jobs` but are deliberately NOT part of any API
 * response, and so must be subtracted from the bare-select baseline below.
 *
 * `searchVector` (Phase 7) is the first of these: a generated tsvector, tens of
 * kilobytes on a long posting, meaningless to the browser. It is the case these
 * explicit column lists were written for — before them, a bare select would have
 * put it into `/api/applications` and `/api/bookmarks` the moment the column
 * landed, with nobody having decided that.
 *
 * Adding a name here is a deliberate act. The "a column added to the schema does
 * not reach the API until it is listed" test below still has to pass, so a column
 * cannot be quietly excluded from both the payload and this baseline without the
 * exclusion being visible.
 */
const JOB_COLUMNS_NEVER_EXPOSED = ["searchVector"] as const;

function withoutInternalColumns<T extends Record<string, unknown>>(job: T) {
  const copy = { ...job };
  for (const key of JOB_COLUMNS_NEVER_EXPOSED) delete copy[key];
  return copy;
}

/**
 * The pre-Phase-1.5 read, reproduced verbatim: a bare select over the same join,
 * reassembled the same way, minus the columns that are not API surface. This is
 * the baseline the explicit lists must match.
 */
async function legacyApplicationRead(testDb: TestDb) {
  const rows = await testDb
    .select()
    .from(applicationsTable)
    .innerJoin(jobsTable, eq(applicationsTable.jobId, jobsTable.id))
    .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
    .where(eq(applicationsTable.clerkId, CLERK_ID))
    .orderBy(desc(applicationsTable.createdAt));

  return rows.map((r) => ({
    ...r.applications,
    job: { ...withoutInternalColumns(r.jobs), company: r.companies },
  }));
}

async function legacyBookmarkRead(testDb: TestDb) {
  const rows = await testDb
    .select()
    .from(bookmarksTable)
    .innerJoin(jobsTable, eq(bookmarksTable.jobId, jobsTable.id))
    .innerJoin(companiesTable, eq(jobsTable.companyId, companiesTable.id))
    .where(eq(bookmarksTable.clerkId, CLERK_ID))
    .orderBy(desc(bookmarksTable.createdAt));

  return rows.map((r) => ({
    ...r.bookmarks,
    job: { ...withoutInternalColumns(r.jobs), company: r.companies },
  }));
}

describe("repository column lists — response shape is unchanged", () => {
  let testDb: TestDb;
  let jobId: string;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);

    const [company] = await db
      .insert(companiesTable)
      .values({ name: "Acme Corp", slug: "acme", industry: "Software" })
      .returning();

    // Values chosen so every column type is exercised: nulls, arrays, enums,
    // timestamps. A shape comparison over all-null rows would prove very little.
    const [job] = await db
      .insert(jobsTable)
      .values({
        companyId: company.id,
        title: "SDE Intern",
        department: "Platform",
        location: "Bengaluru, KA",
        workMode: "hybrid",
        jobType: "internship",
        stipend: 60000,
        eligibleBatch: [2027],
        eligibleBranches: ["CSE", "IT"],
        minCgpa: 7.5,
        requiredSkills: ["TypeScript", "Postgres"],
        benefits: ["PPO"],
        deadline: new Date("2026-12-01T00:00:00.000Z"),
        applyUrl: "https://example.test/apply",
        sourcePlatform: "greenhouse",
        sourceUrl: "https://example.test/job/1",
        postedDate: new Date("2026-09-01T00:00:00.000Z"),
        lastSeenAt: new Date("2026-09-10T00:00:00.000Z"),
        description: "Build things.",
      })
      .returning();
    jobId = job.id;

    await db.insert(applicationsTable).values({
      clerkId: CLERK_ID,
      jobId,
      status: "applied",
      appliedDate: new Date("2026-09-05T00:00:00.000Z"),
      notes: "referred",
    });
    await db.insert(bookmarksTable).values({ clerkId: CLERK_ID, jobId });
  });

  it("applications: explicit select returns byte-identical JSON to the old bare select", async () => {
    const before = await legacyApplicationRead(testDb);
    const after = await applicationsRepository.findAll(
      CLERK_ID,
      {},
      { page: 1, limit: 20 },
    );

    expect(before).toHaveLength(1);
    expect(JSON.stringify(after.data)).toBe(JSON.stringify(before));
  });

  it("bookmarks: explicit select returns byte-identical JSON to the old bare select", async () => {
    const before = await legacyBookmarkRead(testDb);
    const after = await bookmarksRepository.findAll(CLERK_ID);

    expect(before).toHaveLength(1);
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("the only keys added since are lastSeenAt (1.5), the six location columns (2.0) and the six relevance columns (2.1)", async () => {
    const [application] = await applicationsRepository
      .findAll(CLERK_ID, {}, { page: 1, limit: 20 })
      .then((r) => r.data);

    // Phase 2.0's columns sit after `country` in the schema, and Phase 2.1's
    // directly after them, so that is where they appear. Every pre-existing
    // key keeps its position.
    const LOCATION_KEYS_PHASE_2_0 = [
      "locationCity",
      "locationRegion",
      "locationCountry",
      "locationMetro",
      "isIndia",
      "isRemote",
    ];
    const RELEVANCE_KEYS_PHASE_2_1 = [
      "relevanceTrack",
      "relevanceScore",
      "isFresherEligible",
      "seniorityExcluded",
      "relevanceSignals",
      "classifiedAt",
    ];
    const afterCountry = JOB_KEYS_BEFORE_PHASE_1_5.indexOf("country") + 1;
    const afterStatus = JOB_KEYS_BEFORE_PHASE_1_5.indexOf("status") + 1;

    expect(Object.keys(application.job).filter((k) => k !== "company")).toEqual(
      [
        ...JOB_KEYS_BEFORE_PHASE_1_5.slice(0, afterCountry),
        ...LOCATION_KEYS_PHASE_2_0,
        ...RELEVANCE_KEYS_PHASE_2_1,
        ...JOB_KEYS_BEFORE_PHASE_1_5.slice(afterCountry, afterStatus),
        "lastSeenAt",
        ...JOB_KEYS_BEFORE_PHASE_1_5.slice(afterStatus),
      ],
    );
  });

  it("search_vector never reaches an API payload", async () => {
    // The Phase 7 column, checked by name rather than only through the shape
    // comparison above: a tsvector is large, internal, and useless to the
    // browser, and it would have arrived on three endpoints unannounced.
    const [application] = await applicationsRepository
      .findAll(CLERK_ID, {}, { page: 1, limit: 20 })
      .then((r) => r.data);
    const [bookmark] = await bookmarksRepository.findAll(CLERK_ID);
    const [job] = await jobsRepository
      .findAll({ status: "active" }, { page: 1, limit: 20 })
      .then((r) => r.data);

    // It really is on the table — otherwise this test passes for the wrong reason.
    const [raw] = await testDb
      .select()
      .from(jobsTable)
      .where(eq(jobsTable.id, jobId));
    expect(raw).toHaveProperty("searchVector");
    expect(typeof raw.searchVector).toBe("string");

    expect(application.job).not.toHaveProperty("searchVector");
    expect(bookmark.job).not.toHaveProperty("searchVector");
    expect(job).not.toHaveProperty("searchVector");
  });

  it("a column added to the schema does not reach the API until it is listed", async () => {
    // Guards the reason these lists exist: the bare select this replaced would
    // have returned every jobs column, so Phase 2's twelve new columns would
    // have entered the payload unreviewed. `jobColumns` is the gate.
    const { jobColumns } = await import("./columns");
    const declared = Object.keys(jobColumns);
    const [application] = await applicationsRepository
      .findAll(CLERK_ID, {}, { page: 1, limit: 20 })
      .then((r) => r.data);

    expect(Object.keys(application.job).filter((k) => k !== "company")).toEqual(
      declared,
    );
  });
});
