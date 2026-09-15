import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Real Postgres (PGlite), for the same reason as location-filters.test.ts and
// more so: this suite is about a GENERATED tsvector column, Postgres's own
// tokeniser and `websearch_to_tsquery`. None of that has any meaning against a
// mocked `db` — a mock could only prove that some SQL string was assembled,
// which is exactly the part that was never in doubt.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { db, companiesTable, jobsTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { jobsRepository } from "./jobs.repository";

const PAGE = { page: 1, limit: 100 };

/** title → [companyName, description, requiredSkills]. */
const FIXTURE: Array<[string, string, string | null, string[]]> = [
  // Plain title hit.
  ["Backend Engineer Intern", "Acme Corp", "Work on our API.", ["Go"]],
  // The title says nothing about Kubernetes; the description does. Before
  // Phase 7 this row was unreachable by search.
  [
    "Platform Engineer",
    "Acme Corp",
    "You will run workloads on Kubernetes and Terraform.",
    ["Linux"],
  ],
  // Skills only.
  ["Associate Developer", "Acme Corp", "Join the team.", ["TypeScript", "SQL"]],
  // The slash case. Postgres's default parser reads "Developer/intern" as one
  // `file` token, so without the slash normalisation in the generated column
  // this row is invisible to a search for "intern" — eight real production
  // postings were in exactly this shape.
  ["Backend Developer/intern", "Acme Corp", "Build services.", []],
  // "Internship" only stems to `internship`, never to `intern`. The prefix arm
  // is what keeps it findable.
  ["Summer Internship Programme", "Acme Corp", "Twelve weeks.", []],
  // Company-name-only match: nothing in the job row says "Zomato".
  ["Product Analyst", "Zomato", "Numbers.", []],
];

async function seed() {
  const names = [...new Set(FIXTURE.map(([, company]) => company))];
  const companies = await db
    .insert(companiesTable)
    .values(
      names.map((name) => ({
        name,
        slug: name.toLowerCase().replace(/ /g, "-"),
      })),
    )
    .returning();
  const byName = new Map(companies.map((c) => [c.name, c.id]));

  await db.insert(jobsTable).values(
    FIXTURE.map(([title, company, description, requiredSkills]) => ({
      companyId: byName.get(company)!,
      title,
      jobType: "internship" as const,
      description,
      requiredSkills,
      status: "active" as const,
    })),
  );
}

async function titlesMatching(search: string): Promise<string[]> {
  const result = await jobsRepository.findAll(
    { search, status: "active" },
    PAGE,
  );
  return result.data.map((j) => j.title).sort();
}

describe("job search (Phase 7 full-text)", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    await seed();
  });

  it("the generated column really is generated — no code writes it", async () => {
    const [{ is_generated }] = (
      await testDb.execute<{ is_generated: string }>(
        `select is_generated from information_schema.columns
          where table_name = 'jobs' and column_name = 'search_vector'`,
      )
    ).rows;
    expect(is_generated).toBe("ALWAYS");
  });

  // ── The acceptance criterion UPGRADE.md §7 names explicitly ───────────────
  it("company-name search still works exactly as it did", async () => {
    // Nothing in this job's own columns contains "Zomato"; the only route to
    // it is the company-name arm of the predicate.
    expect(await titlesMatching("Zomato")).toEqual(["Product Analyst"]);
    // Case-insensitive substring, the pre-Phase-7 ILIKE semantics.
    expect(await titlesMatching("zomat")).toEqual(["Product Analyst"]);
    expect(await titlesMatching("omato")).toEqual(["Product Analyst"]);
  });

  it("a company-name match and a text match both appear for one query", async () => {
    // "Acme" matches five jobs by company name and none by text.
    expect(await titlesMatching("Acme")).toHaveLength(5);
  });

  it("finds a job by words that only appear in its description", async () => {
    expect(await titlesMatching("kubernetes")).toEqual(["Platform Engineer"]);
    expect(await titlesMatching("terraform")).toEqual(["Platform Engineer"]);
  });

  it("finds a job by its required skills", async () => {
    expect(await titlesMatching("typescript")).toEqual(["Associate Developer"]);
  });

  it("'intern' still finds Internship and Developer/intern", async () => {
    // The regression guard for the two ways stemming loses an ILIKE match:
    // a longer word with the same prefix, and a slash-joined title.
    expect(await titlesMatching("intern")).toEqual([
      "Backend Developer/intern",
      "Backend Engineer Intern",
      "Summer Internship Programme",
    ]);
  });

  it("falls back to ILIKE below three characters", async () => {
    // "Pl" is a substring of "Platform" but not a word, so only the ILIKE
    // fallback can match it — this is the §7 short-query fallback working.
    expect(await titlesMatching("Pl")).toEqual(["Platform Engineer"]);
  });

  it("supports websearch syntax: a quoted phrase and a negation", async () => {
    expect(await titlesMatching('"backend engineer"')).toEqual([
      "Backend Engineer Intern",
    ]);
    const withoutPlatform = await titlesMatching("engineer -platform");
    expect(withoutPlatform).not.toContain("Platform Engineer");
  });

  it("does not throw on input that would be a tsquery syntax error", async () => {
    // `to_tsquery('english', 'c++ &')` raises; reaching Postgres with that
    // string would be a 500 on the Jobs page for a stray keystroke.
    for (const query of ["c++ &", "!!!", "a | b &", "(", "&&&"]) {
      await expect(
        jobsRepository.findAll({ search: query, status: "active" }, PAGE),
      ).resolves.toBeDefined();
    }
  });

  it("an unmatched search returns nothing rather than everything", async () => {
    // The failure mode worth guarding: dropping an arm that matched nothing
    // and thereby widening the predicate to the whole table.
    expect(await titlesMatching("cobol")).toEqual([]);
    expect(await titlesMatching("zz")).toEqual([]);
  });

  it("the search narrows the count as well as the page", async () => {
    const all = await jobsRepository.findAll({ status: "active" }, PAGE);
    const narrowed = await jobsRepository.findAll(
      { search: "kubernetes", status: "active" },
      PAGE,
    );
    expect(all.meta.total).toBe(6);
    expect(narrowed.meta.total).toBe(1);
  });

  it("search composes with other filters rather than replacing them", async () => {
    const [company] = await db
      .insert(companiesTable)
      .values({ name: "Other Co", slug: "other-co" })
      .returning();
    await db.insert(jobsTable).values({
      companyId: company.id,
      title: "Backend Engineer Intern",
      jobType: "internship",
      status: "closed",
    });

    const active = await jobsRepository.findAll(
      { search: "backend", status: "active" },
      PAGE,
    );
    expect(active.data.every((j) => j.status === "active")).toBe(true);
    expect(active.meta.total).toBe(2);
  });
});
