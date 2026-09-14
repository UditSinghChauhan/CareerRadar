import { describe, it, expect, beforeAll, vi } from "vitest";
import { sql } from "drizzle-orm";

// Real Postgres (PGlite) with the real schema DDL, so the check is proved
// against the exact table layout the code expects — and against a copy of it
// with a column deliberately dropped, which is the Phase 1.5 / 2.0 failure.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { db } from "@workspace/db";
import {
  checkSchema,
  describeDrift,
  diffSchema,
  expectedColumns,
  MIGRATION_HINT,
  resetSchemaCheckForTests,
  currentSchemaStatus,
} from "./schema-check";

describe("expectedColumns — derived from the Drizzle schema, not hand-listed", () => {
  it("knows every table and the Phase 2.0 columns", () => {
    const expected = expectedColumns();
    expect([...expected.keys()]).toEqual(
      expect.arrayContaining([
        "jobs",
        "companies",
        "applications",
        "bookmarks",
      ]),
    );
    expect(expected.get("jobs")).toEqual(
      expect.arrayContaining([
        "location_city",
        "location_region",
        "location_country",
        "location_metro",
        "is_india",
        "is_remote",
        "last_seen_at",
      ]),
    );
  });
});

describe("diffSchema — pure comparison", () => {
  const expected = new Map([
    ["jobs", ["id", "title", "is_india"]],
    ["companies", ["id", "name"]],
  ]);

  it("reports nothing when every expected column is present", () => {
    expect(
      diffSchema(expected, [
        { table: "jobs", column: "id" },
        { table: "jobs", column: "title" },
        { table: "jobs", column: "is_india" },
        { table: "companies", column: "id" },
        { table: "companies", column: "name" },
      ]),
    ).toEqual([]);
  });

  it("names the missing columns per table", () => {
    const drift = diffSchema(expected, [
      { table: "jobs", column: "id" },
      { table: "jobs", column: "title" },
      { table: "companies", column: "id" },
      { table: "companies", column: "name" },
    ]);
    expect(drift).toEqual([
      { table: "jobs", missingColumns: ["is_india"], missingTable: false },
    ]);
    expect(describeDrift(drift)).toBe('"jobs" is missing "is_india"');
  });

  it("reports a missing table as such", () => {
    const drift = diffSchema(expected, [
      { table: "jobs", column: "id" },
      { table: "jobs", column: "title" },
      { table: "jobs", column: "is_india" },
    ]);
    expect(drift).toEqual([
      { table: "companies", missingColumns: [], missingTable: true },
    ]);
  });

  it("ignores columns the database has that the code does not (additive-only means the DB may be ahead)", () => {
    expect(
      diffSchema(expected, [
        { table: "jobs", column: "id" },
        { table: "jobs", column: "title" },
        { table: "jobs", column: "is_india" },
        { table: "jobs", column: "future_column" },
        { table: "companies", column: "id" },
        { table: "companies", column: "name" },
        { table: "unrelated", column: "x" },
      ]),
    ).toEqual([]);
  });
});

describe("checkSchema — against real rows", () => {
  beforeAll(() => resetSchemaCheckForTests());

  it("passes on the freshly generated schema", async () => {
    const result = await checkSchema();
    expect(result.status).toBe("ok");
    expect(result.drift).toEqual([]);
  });

  it("detects a dropped column and says exactly what to do", async () => {
    // Replay the Phase 2.0 incident on a throwaway column set: drop two of the
    // six, then check.
    await db.execute(sql`ALTER TABLE jobs DROP COLUMN location_metro`);
    await db.execute(sql`ALTER TABLE jobs DROP COLUMN is_india`);
    try {
      const result = await checkSchema();
      expect(result.status).toBe("drift");
      expect(result.drift).toEqual([
        {
          table: "jobs",
          missingColumns: ["location_metro", "is_india"],
          missingTable: false,
        },
      ]);
      expect(result.hint).toContain(
        '"jobs" is missing "location_metro", "is_india"',
      );
      expect(result.hint).toContain(MIGRATION_HINT);

      // The cached status re-checks while not ok, so it sees the drift…
      resetSchemaCheckForTests();
      expect((await currentSchemaStatus()).status).toBe("drift");
    } finally {
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN location_metro text`);
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN is_india boolean`);
    }
    // …and recovers on its own once the columns are back, without a restart.
    expect((await currentSchemaStatus()).status).toBe("ok");
  });
});
