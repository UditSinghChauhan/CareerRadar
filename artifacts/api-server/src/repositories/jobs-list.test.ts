import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Real Postgres (PGlite). Phase 7 moved the Jobs page's filtering, sorting and
// paging out of the browser and into SQL, and the whole question this suite
// answers — "does page 2 contain the rows page 1 left out, over the WHOLE
// result set?" — only has an answer against a real query planner.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { eq } from "drizzle-orm";
import {
  db,
  companiesTable,
  jobsTable,
  applicationsTable,
} from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { jobsRepository } from "./jobs.repository";
import { MAX_PAGE_SIZE, paginate } from "../lib/pagination";

const CLERK_ID = "user_jobs_list_spec";

/** Enough rows that a 20-row page is a window and not the whole table. */
const ROW_COUNT = 137;

async function seedMany(): Promise<string> {
  const [company] = await db
    .insert(companiesTable)
    .values({ name: "Bulk Corp", slug: "bulk-corp" })
    .returning();

  await db.insert(jobsTable).values(
    Array.from({ length: ROW_COUNT }, (_, i) => ({
      companyId: company.id,
      // Zero-padded so a lexical comparison in a test matches the numeric one.
      title: `Job ${String(i).padStart(3, "0")}`,
      jobType: "internship" as const,
      status: "active" as const,
      // Strictly decreasing, so "newest" has exactly one correct order.
      postedDate: new Date(Date.UTC(2026, 0, 1) - i * 86_400_000),
    })),
  );
  return company.id;
}

describe("Jobs list — server-side paging (Phase 7)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
  });

  it("counts the whole result set, not the page", async () => {
    await seedMany();
    const page1 = await jobsRepository.findAll(
      { status: "active" },
      paginate({}),
    );

    expect(page1.data).toHaveLength(20);
    expect(page1.meta.total).toBe(ROW_COUNT);
    // The bug this phase fixes: 137 rows at 20 a page is 7 pages. Before Phase 7
    // the server capped the response at 100 rows and the browser paged THOSE,
    // so this said 5 no matter how large the table grew.
    expect(page1.meta.totalPages).toBe(7);
  });

  it("every page is disjoint and together they cover the whole set", async () => {
    await seedMany();
    const seen: string[] = [];
    for (let page = 1; page <= 7; page++) {
      const result = await jobsRepository.findAll(
        { status: "active" },
        paginate({ page, limit: 20 }),
        "newest",
      );
      seen.push(...result.data.map((j) => j.id));
    }

    expect(seen).toHaveLength(ROW_COUNT);
    expect(new Set(seen).size).toBe(ROW_COUNT);
  });

  it("the last page is the remainder, not a full page", async () => {
    await seedMany();
    const last = await jobsRepository.findAll(
      { status: "active" },
      paginate({ page: 7, limit: 20 }),
    );
    expect(last.data).toHaveLength(ROW_COUNT - 6 * 20);
  });

  it("serves a page of 200 — the raised cap — in one response", async () => {
    await seedMany();
    const result = await jobsRepository.findAll(
      { status: "active" },
      paginate({ limit: MAX_PAGE_SIZE }),
    );
    expect(result.data).toHaveLength(ROW_COUNT);
    expect(result.meta.totalPages).toBe(1);
  });

  it("a page past the end is empty rather than an error", async () => {
    await seedMany();
    const result = await jobsRepository.findAll(
      { status: "active" },
      paginate({ page: 99, limit: 20 }),
    );
    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(ROW_COUNT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/** [title, workMode, eligibleBatch, eligibleBranches, skills, platform, deadline, salaryMax, stipend] */
type Row = [
  string,
  "remote" | "hybrid" | "onsite",
  number[],
  string[],
  string[],
  string,
  Date | null,
  number | null,
  number | null,
];

const FILTER_FIXTURE: Row[] = [
  [
    "remote-2027-cse",
    "remote",
    [2027],
    ["CSE"],
    ["Go"],
    "greenhouse",
    new Date("2026-10-01"),
    900000,
    null,
  ],
  [
    "hybrid-2026-it",
    "hybrid",
    [2026],
    ["IT"],
    ["Python"],
    "lever",
    new Date("2026-11-01"),
    500000,
    null,
  ],
  [
    "onsite-nobatch",
    "onsite",
    [],
    [],
    ["Go", "Rust"],
    "greenhouse",
    null,
    null,
    40000,
  ],
  [
    "remote-nobranch",
    "remote",
    [2027],
    [],
    [],
    "remotive",
    new Date("2026-09-20"),
    null,
    null,
  ],
];

async function seedFilters(): Promise<void> {
  const [alpha, beta] = await db
    .insert(companiesTable)
    .values([
      { name: "Alpha Systems", slug: "alpha-systems" },
      { name: "Beta Labs", slug: "beta-labs" },
    ])
    .returning();

  await db.insert(jobsTable).values(
    FILTER_FIXTURE.map(
      (
        [
          title,
          workMode,
          eligibleBatch,
          eligibleBranches,
          requiredSkills,
          sourcePlatform,
          deadline,
          salaryMax,
          stipend,
        ],
        i,
      ) => ({
        // Two companies so the company sort has something to order.
        companyId: i % 2 === 0 ? alpha.id : beta.id,
        title,
        jobType: "internship" as const,
        status: "active" as const,
        workMode,
        eligibleBatch,
        eligibleBranches,
        requiredSkills,
        sourcePlatform,
        deadline,
        salaryMax,
        stipend,
        postedDate: new Date(Date.UTC(2026, 0, 10 - i)),
      }),
    ),
  );
}

async function titles(
  filters: Parameters<typeof jobsRepository.findAll>[0],
  sort?: Parameters<typeof jobsRepository.findAll>[2],
): Promise<string[]> {
  const result = await jobsRepository.findAll(
    { status: "active", ...filters },
    paginate({ limit: 100 }),
    sort,
  );
  return result.data.map((j) => j.title);
}

describe("Jobs list — the filters that used to run in the browser", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    await seedFilters();
  });

  it("workModes ORs the selected modes", async () => {
    expect((await titles({ workModes: ["remote"] })).sort()).toEqual([
      "remote-2027-cse",
      "remote-nobranch",
    ]);
    expect((await titles({ workModes: ["hybrid", "onsite"] })).sort()).toEqual([
      "hybrid-2026-it",
      "onsite-nobatch",
    ]);
  });

  it("batches match the year OR name no batch at all", async () => {
    // "names no batch" is the part that matters: most real postings state
    // nothing, and excluding them would empty the default view.
    expect((await titles({ batches: [2027] })).sort()).toEqual([
      "onsite-nobatch",
      "remote-2027-cse",
      "remote-nobranch",
    ]);
  });

  it("branches match the branch OR name none", async () => {
    expect((await titles({ branches: ["CSE"] })).sort()).toEqual([
      "onsite-nobatch",
      "remote-2027-cse",
      "remote-nobranch",
    ]);
  });

  it("skills have NO empty-allowance — a posting listing none matches nothing", async () => {
    expect((await titles({ skills: ["Go"] })).sort()).toEqual([
      "onsite-nobatch",
      "remote-2027-cse",
    ]);
    expect(await titles({ skills: ["COBOL"] })).toEqual([]);
  });

  it("sourcePlatform is an exact match", async () => {
    expect((await titles({ sourcePlatform: "greenhouse" })).sort()).toEqual([
      "onsite-nobatch",
      "remote-2027-cse",
    ]);
  });

  it("deadlineBefore excludes rows with no deadline", async () => {
    expect(
      (await titles({ deadlineBefore: new Date("2026-10-15") })).sort(),
    ).toEqual(["remote-2027-cse", "remote-nobranch"]);
  });

  it("filters compose as AND", async () => {
    expect(
      await titles({ workModes: ["remote"], sourcePlatform: "remotive" }),
    ).toEqual(["remote-nobranch"]);
  });

  it("an absent filter narrows nothing", async () => {
    expect(await titles({})).toHaveLength(4);
    expect(
      await titles({ workModes: [], batches: [], skills: [] }),
    ).toHaveLength(4);
  });

  it("hideApplied hides only this user's applications, and only when asked", async () => {
    const [applied] = await db
      .select({ id: jobsTable.id })
      .from(jobsTable)
      .where(eq(jobsTable.title, "remote-2027-cse"));
    const appliedId = applied.id;

    await db.insert(applicationsTable).values({
      clerkId: CLERK_ID,
      jobId: appliedId,
      status: "applied",
    });

    expect(await titles({})).toHaveLength(4);
    expect(
      (await titles({ excludeAppliedForClerkId: CLERK_ID })).sort(),
    ).toEqual(["hybrid-2026-it", "onsite-nobatch", "remote-nobranch"]);
    // Someone else's application is not this user's business.
    expect(
      await titles({ excludeAppliedForClerkId: "user_somebody_else" }),
    ).toHaveLength(4);
  });
});

describe("Jobs list — the sorts that used to run in the browser", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    await seedFilters();
  });

  it("deadline: soonest first, and no-deadline LAST rather than first", async () => {
    // A row with no deadline is not "due today". The browser-side sort used
    // Infinity for exactly this; NULLS LAST is the SQL spelling of it.
    expect(await titles({}, "deadline")).toEqual([
      "remote-nobranch",
      "remote-2027-cse",
      "hybrid-2026-it",
      "onsite-nobatch",
    ]);
  });

  it("salary: the best of salaryMax / salaryMin / stipend, highest first", async () => {
    expect(await titles({}, "salary")).toEqual([
      "remote-2027-cse",
      "hybrid-2026-it",
      "onsite-nobatch",
      "remote-nobranch",
    ]);
  });

  it("company: A–Z by company name", async () => {
    const result = await jobsRepository.findAll(
      { status: "active" },
      paginate({ limit: 100 }),
      "company",
    );
    const names = result.data.map((j) => j.company.name);
    expect(names).toEqual([...names].sort());
  });

  it("an unknown sort falls back to newest rather than throwing", async () => {
    expect(await titles({}, "newest")).toEqual([
      "remote-2027-cse",
      "hybrid-2026-it",
      "onsite-nobatch",
      "remote-nobranch",
    ]);
  });

  it("the sort applies across pages, not within one", async () => {
    await truncateAll(testDb);
    await seedMany();
    const [first, second] = await Promise.all([
      jobsRepository.findAll(
        { status: "active" },
        paginate({ page: 1, limit: 20 }),
        "newest",
      ),
      jobsRepository.findAll(
        { status: "active" },
        paginate({ page: 2, limit: 20 }),
        "newest",
      ),
    ]);
    const lastOfFirst = first.data.at(-1)!.postedDate!;
    const firstOfSecond = second.data[0].postedDate!;
    expect(new Date(lastOfFirst).getTime()).toBeGreaterThan(
      new Date(firstOfSecond).getTime(),
    );
  });
});
