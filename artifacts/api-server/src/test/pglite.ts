/**
 * In-process Postgres for tests.
 * ───────────────────────────────
 * The staleness sweeps are the only thing standing between a guard bug and a
 * mass-closed job table, so their tests assert real row state: they run the real
 * `UPDATE ... WHERE` against real rows in PGlite (Postgres compiled to WASM) and
 * read the rows back. A mocked `db` could only prove that a function was called
 * with some object, which is exactly the kind of test that stays green while the
 * predicate underneath it is wrong.
 *
 * The DDL is generated from `lib/db/src/schema` by drizzle-kit rather than
 * hand-written here, so the test database cannot drift from the real one.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import * as schema from "@workspace/db/schema";

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let cached: Promise<TestDb> | null = null;

async function create(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  const { generateDrizzleJson, generateMigration } =
    await import("drizzle-kit/api");
  const statements = await generateMigration(
    generateDrizzleJson({}),
    generateDrizzleJson(schema),
  );

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }

  return db;
}

/**
 * One database per worker process, created lazily. Booting the WASM engine costs
 * seconds, so suites share it and clean up their own rows instead.
 */
export function getTestDb(): Promise<TestDb> {
  cached ??= create();
  return cached;
}

/** Empty every table a suite might have written. Cheap; call it in beforeEach. */
export async function truncateAll(db: TestDb): Promise<void> {
  await db.execute(
    sql.raw(
      "TRUNCATE notifications, saved_searches, applications, bookmarks, job_dismissals, jobs, companies, job_sources, profiles, settings, provider_sync_logs RESTART IDENTITY CASCADE",
    ),
  );
}
