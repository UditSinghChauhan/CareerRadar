import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { asc, eq } from "drizzle-orm";

// Real Postgres (PGlite). The location buckets are WHERE clauses over three
// nullable columns with three-valued logic, which is exactly where a mocked
// `db` would prove nothing: `is_india = false` and `is_india IS NULL` are
// different rows, and the point of rule 6 is that they stay different.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { db, companiesTable, jobsTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { jobsRepository } from "../repositories/jobs.repository";
import { jobsService } from "../services/jobs.service";
import {
  backfillLocations,
  locationBucketCountsFromDb,
} from "./backfill-location";

const PAGE = { page: 1, limit: 100 };

/** title → raw location string, one row per shape the filter must separate. */
const FIXTURE: Array<[string, string | null]> = [
  ["ncr-1", "Gurugram, Haryana"],
  ["ncr-2", "Noida, Ghaziabad"],
  ["blr-1", "Bangalore, Karnataka"],
  ["blr-remote", "Remote - Bengaluru"],
  ["hyd-1", "Hyderabad, TS"],
  ["pune-1", "Pune"],
  ["mmr-1", "Navi Mumbai, MH"],
  ["other-india-1", "Jaipur, RJ"],
  ["other-india-bare", "India"],
  ["remote-worldwide", "Worldwide"],
  ["remote-us", "Remote - US"],
  ["abroad-toronto", "Toronto, "],
  ["unknown-1", "Posts, "],
  ["unknown-null", null],
];

async function titles(filters: Parameters<typeof jobsRepository.findAll>[0]) {
  const { data } = await jobsRepository.findAll(filters, PAGE);
  return data.map((j) => j.title).sort();
}

describe("location filters — WHERE clauses over real rows", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    const [company] = await db
      .insert(companiesTable)
      .values({ name: "Acme", slug: "acme" })
      .returning();

    // Inserted with the six columns UNSET, the way every pre-2.0 row is, then
    // filled by the backfill — so this suite also proves the backfill is what
    // makes the filter work.
    await db.insert(jobsTable).values(
      FIXTURE.map(([title, location]) => ({
        companyId: company.id,
        title,
        location,
        jobType: "internship" as const,
        sourceUrl: `https://example.test/${title}`,
      })),
    );
    await backfillLocations();
  });

  it("no location params → every row, exactly the pre-2.0 behaviour", async () => {
    expect(await titles({})).toEqual(FIXTURE.map(([t]) => t).sort());
  });

  it("the default buckets: NCR + Bengaluru + Hyderabad + Pune + remote", async () => {
    expect(
      await titles({
        locations: ["NCR", "Bengaluru", "Hyderabad", "Pune", "remote"],
      }),
    ).toEqual(
      [
        "ncr-1",
        "ncr-2",
        "blr-1",
        "blr-remote",
        "hyd-1",
        "pune-1",
        "remote-worldwide",
      ].sort(),
    );
  });

  it("a single metro matches location_metro exactly", async () => {
    expect(await titles({ locations: ["NCR"] })).toEqual(["ncr-1", "ncr-2"]);
    expect(await titles({ locations: ["MMR"] })).toEqual(["mmr-1"]);
  });

  it("remote excludes remote-elsewhere but keeps unknown-country remote", async () => {
    expect(await titles({ locations: ["remote"] })).toEqual([
      "blr-remote",
      "remote-worldwide",
    ]);
  });

  it("other_india is India rows naming a non-featured city; bare 'India' is india_unspecified", async () => {
    expect(await titles({ locations: ["other_india"] })).toEqual([
      "other-india-1",
    ]);
    expect(await titles({ locations: ["india_unspecified"] })).toEqual([
      "other-india-bare",
    ]);
    // Together they are exactly the old other_india.
    expect(
      await titles({ locations: ["other_india", "india_unspecified"] }),
    ).toEqual(["other-india-1", "other-india-bare"]);
  });

  it("the default buckets include india_unspecified", async () => {
    expect(
      await titles({
        locations: [
          "NCR",
          "Bengaluru",
          "Hyderabad",
          "Pune",
          "remote",
          "india_unspecified",
        ],
      }),
    ).toContain("other-india-bare");
  });

  it("unknown is is_india IS NULL — and never contains a row that names another country", async () => {
    const unknown = await titles({ locations: ["unknown"] });
    expect(unknown).toEqual(["remote-worldwide", "unknown-1", "unknown-null"]);
    expect(unknown).not.toContain("abroad-toronto");
    expect(unknown).not.toContain("remote-us");
  });

  it("isIndia=true drops both abroad AND unknown rows", async () => {
    const rows = await titles({ isIndia: true });
    expect(rows).not.toContain("unknown-1");
    expect(rows).not.toContain("remote-worldwide");
    expect(rows).not.toContain("abroad-toronto");
    expect(rows).toContain("other-india-bare");
    expect(rows).toHaveLength(9);
  });

  it("isIndia=false is only rows that name somewhere else", async () => {
    expect(await titles({ isIndia: false })).toEqual([
      "abroad-toronto",
      "remote-us",
    ]);
  });

  it("isRemote=true is literal — includes remote-elsewhere", async () => {
    expect(await titles({ isRemote: true })).toEqual([
      "blr-remote",
      "remote-us",
      "remote-worldwide",
    ]);
  });

  it("buckets OR together; isIndia ANDs on top", async () => {
    expect(
      await titles({ locations: ["remote", "unknown"], isIndia: true }),
    ).toEqual(["blr-remote"]);
  });

  it("the service parses the query string the generated client sends", async () => {
    // ?locations=NCR&locations=remote → array; ?locations=NCR → string;
    // ?locations=NCR,MMR → comma form for hand-typed URLs.
    const asArray = await jobsService.list({
      locations: ["NCR", "remote"],
      limit: "100",
    });
    expect(asArray.data.map((j) => j.title).sort()).toEqual(
      ["ncr-1", "ncr-2", "blr-remote", "remote-worldwide"].sort(),
    );

    const asString = await jobsService.list({ locations: "NCR", limit: "100" });
    expect(asString.data.map((j) => j.title).sort()).toEqual([
      "ncr-1",
      "ncr-2",
    ]);

    const asCsv = await jobsService.list({
      locations: "NCR,MMR",
      limit: "100",
    });
    expect(asCsv.data.map((j) => j.title).sort()).toEqual([
      "mmr-1",
      "ncr-1",
      "ncr-2",
    ]);

    const india = await jobsService.list({ isIndia: "true", limit: "100" });
    expect(india.data).toHaveLength(9);
  });
});

describe("jobsService — hand-entered jobs are normalised on the way in", () => {
  let testDb: TestDb;
  let companyId: string;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    const [company] = await db
      .insert(companiesTable)
      .values({ name: "Acme", slug: "acme" })
      .returning();
    companyId = company.id;
  });

  it("create: POST /jobs body with a location gets the six columns", async () => {
    const job = await jobsService.create({
      companyId,
      title: "Pasted in by hand",
      location: "Navi Mumbai, MH",
      workMode: "onsite",
      jobType: "internship",
    });
    expect(job).toMatchObject({
      locationCity: "Navi Mumbai",
      locationRegion: "Maharashtra",
      locationCountry: "IN",
      locationMetro: "MMR",
      isIndia: true,
      isRemote: false,
    });
  });

  it("update: changing location re-normalises; changing something else leaves it alone", async () => {
    const job = await jobsService.create({
      companyId,
      title: "Editable",
      location: "Gurugram",
      workMode: "onsite",
      jobType: "internship",
    });
    expect(job.locationMetro).toBe("NCR");

    const retitled = await jobsService.update(job.id, { title: "Renamed" });
    expect(retitled?.locationMetro).toBe("NCR");

    const moved = await jobsService.update(job.id, { location: "Posts, " });
    expect(moved).toMatchObject({
      locationMetro: null,
      locationCountry: null,
      isIndia: null,
    });
    expect(moved?.isIndia).not.toBe(false);
  });
});

describe("backfillLocations — recompute-all, idempotent, derived columns only", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    const [company] = await db
      .insert(companiesTable)
      .values({ name: "Acme", slug: "acme" })
      .returning();
    await db.insert(jobsTable).values(
      FIXTURE.map(([title, location]) => ({
        companyId: company.id,
        title,
        location,
        // The unreliable column, set to the value the schema default writes for
        // every RemoteOK row. The backfill must not read it.
        country: "India",
        jobType: "internship" as const,
        sourceUrl: `https://example.test/${title}`,
        status:
          title === "unknown-null" ? ("closed" as const) : ("active" as const),
      })),
    );
  });

  it("first run fills every row; second run changes nothing", async () => {
    const first = await backfillLocations();
    expect(first.scanned).toBe(FIXTURE.length);
    // The two unknown rows normalise to all-null / not-remote, which is what a
    // fresh row already holds, so they are correctly reported as unchanged.
    expect(first.updated).toBe(FIXTURE.length - 2);

    const second = await backfillLocations();
    expect(second.scanned).toBe(FIXTURE.length);
    expect(second.updated).toBe(0);
  });

  it("reports the exclusive bucket distribution, active and all, summing to the totals", async () => {
    const report = await backfillLocations();

    expect(report.buckets).toEqual({
      NCR: 2,
      MMR: 1,
      Bengaluru: 2,
      Hyderabad: 1,
      Pune: 1,
      Chennai: 0,
      Kolkata: 0,
      other_india: 1,
      india_unspecified: 1,
      remote: 1,
      unknown: 2,
      abroad: 2,
    });
    expect(Object.values(report.buckets).reduce((a, b) => a + b, 0)).toBe(
      report.scanned,
    );
    // unknown-null is closed, so the active view has one fewer unknown.
    expect(report.activeBuckets.unknown).toBe(1);
    expect(report.remoteTotal).toBe(3);
    expect(report.unknownActivePercent).toBe(
      Math.round((1 / (FIXTURE.length - 1)) * 1000) / 10,
    );
    expect(report.topUnknownLocations).toEqual([
      { location: "Posts, ", count: 1 },
      { location: null, count: 1 },
    ]);
  });

  it("the SQL distribution over stored columns matches the report after a run", async () => {
    const report = await backfillLocations();
    const stored = await locationBucketCountsFromDb();
    expect(stored.active).toEqual(report.activeBuckets);
    expect(stored.activeTotal).toBe(FIXTURE.length - 1);
  });

  it("dry run computes the same report and writes nothing", async () => {
    const dry = await backfillLocations({ dryRun: true });
    expect(dry.updated).toBe(FIXTURE.length - 2);

    const [row] = await db
      .select({ isIndia: jobsTable.isIndia, metro: jobsTable.locationMetro })
      .from(jobsTable)
      .where(eq(jobsTable.title, "ncr-1"));
    expect(row).toEqual({ isIndia: null, metro: null });
  });

  it("ignores jobs.country entirely: 'Toronto, ' with country='India' is still not India", async () => {
    await backfillLocations();
    const [row] = await db
      .select({
        isIndia: jobsTable.isIndia,
        locationCountry: jobsTable.locationCountry,
        country: jobsTable.country,
      })
      .from(jobsTable)
      .where(eq(jobsTable.title, "abroad-toronto"));
    expect(row).toEqual({
      isIndia: false,
      locationCountry: "CA",
      country: "India",
    });
  });

  it("never touches updatedAt, location or country", async () => {
    const before = await db
      .select({
        id: jobsTable.id,
        location: jobsTable.location,
        country: jobsTable.country,
        updatedAt: jobsTable.updatedAt,
      })
      .from(jobsTable)
      .orderBy(asc(jobsTable.id));
    await backfillLocations();
    const after = await db
      .select({
        id: jobsTable.id,
        location: jobsTable.location,
        country: jobsTable.country,
        updatedAt: jobsTable.updatedAt,
      })
      .from(jobsTable)
      .orderBy(asc(jobsTable.id));
    expect(after).toEqual(before);
  });
});
