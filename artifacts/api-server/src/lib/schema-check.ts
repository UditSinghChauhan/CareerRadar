/**
 * Schema drift check
 * ──────────────────
 * Compares the columns the code expects (every table exported from
 * `@workspace/db/schema`) against the columns the live database actually has,
 * and says which are missing.
 *
 * WHY THIS EXISTS
 * ────────────────
 * Twice now a schema change has reached production before its migration did:
 * Phase 1.5 (`last_seen_at`) and Phase 2.0 (the six location columns). Both
 * times the symptom was the same — every `SELECT` that named the new column
 * 500'd, the Jobs page said "Could not connect to the server", and nothing in
 * the logs said *why* until someone read the raw Postgres error. Render's
 * deploy went green because `/api/healthz` never touched the database.
 *
 * This check runs at boot and is surfaced by `/api/healthz`, which returns 503
 * with the exact missing columns and the file that adds them. That turns a
 * silent failure into a red deploy with the fix in the message.
 *
 * WHAT IT DOES NOT DO
 * ───────────────────
 * It never changes the database. It only reports. Applying the migration is
 * a deliberate, documented step (CLAUDE.md → "Deploying a schema change").
 * It also only checks for MISSING columns, never extra ones: the deployed
 * database is allowed to be ahead of the code (additive-only rule), and a
 * column the code does not select cannot break a query.
 *
 * A database that cannot be reached is `unchecked`, not `drift`: a Neon
 * blip must not make a correctly-migrated service report itself broken.
 */

import { is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { db } from "@workspace/db";
import * as schema from "@workspace/db/schema";
import { logger } from "./logger";

export interface TableDrift {
  table: string;
  /** Empty when the whole table is missing. */
  missingColumns: string[];
  missingTable: boolean;
}

export type SchemaStatus = "ok" | "drift" | "unchecked";

export interface SchemaCheckResult {
  status: SchemaStatus;
  checkedAt: string | null;
  drift: TableDrift[];
  /** Why the check could not run, when status is "unchecked". */
  error?: string;
  /** One sentence the operator can act on, when status is "drift". */
  hint?: string;
}

/**
 * Where the DDL for the last additive change lives. Named in the drift message
 * so the person reading a 503 at 2am does not have to work out what to run.
 */
export const MIGRATION_HINT =
  "Apply the newest file in lib/db/sql/ with psql against the DIRECT Neon endpoint " +
  "(not the pooled one), then re-check /api/healthz. See CLAUDE.md → " +
  '"Deploying a schema change".';

/** `table name → column names` for every PgTable the schema module exports. */
export function expectedColumns(): Map<string, string[]> {
  const expected = new Map<string, string[]>();
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    expected.set(
      config.name,
      config.columns.map((column) => column.name),
    );
  }
  return expected;
}

/**
 * The comparison itself, separated from the query so it can be tested with a
 * plain list of what the database reported.
 */
export function diffSchema(
  expected: Map<string, string[]>,
  actual: Array<{ table: string; column: string }>,
): TableDrift[] {
  const present = new Map<string, Set<string>>();
  for (const { table, column } of actual) {
    let columns = present.get(table);
    if (!columns) {
      columns = new Set();
      present.set(table, columns);
    }
    columns.add(column);
  }

  const drift: TableDrift[] = [];
  for (const [table, columns] of expected) {
    const live = present.get(table);
    if (!live) {
      drift.push({ table, missingColumns: [], missingTable: true });
      continue;
    }
    const missing = columns.filter((c) => !live.has(c));
    if (missing.length > 0) {
      drift.push({ table, missingColumns: missing, missingTable: false });
    }
  }
  return drift;
}

export function describeDrift(drift: TableDrift[]): string {
  return drift
    .map((d) =>
      d.missingTable
        ? `table "${d.table}" is missing entirely`
        : `"${d.table}" is missing ${d.missingColumns.map((c) => `"${c}"`).join(", ")}`,
    )
    .join("; ");
}

/** One live comparison. Never throws — connectivity problems become `unchecked`. */
export async function checkSchema(): Promise<SchemaCheckResult> {
  const checkedAt = new Date().toISOString();
  try {
    const rows = await db.execute<{ table: string; column: string }>(sql`
      SELECT table_name AS "table", column_name AS "column"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
    `);
    const drift = diffSchema(expectedColumns(), rows.rows);
    if (drift.length === 0) return { status: "ok", checkedAt, drift: [] };
    return {
      status: "drift",
      checkedAt,
      drift,
      hint: `SCHEMA DRIFT: ${describeDrift(drift)}. ${MIGRATION_HINT}`,
    };
  } catch (err) {
    return {
      status: "unchecked",
      checkedAt,
      drift: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Cached state, shared by boot, /api/healthz and /api/sync/cron ────────────

/**
 * How long a result is trusted before healthz re-runs the query. Short enough
 * that applying the migration turns the health check green without a restart;
 * long enough that Render's polling does not hammer information_schema.
 */
const RECHECK_AFTER_MS = 30_000;

let current: SchemaCheckResult = {
  status: "unchecked",
  checkedAt: null,
  drift: [],
  error: "not yet checked",
};
let inFlight: Promise<SchemaCheckResult> | null = null;

/** Run the check now and log the outcome at the level it deserves. */
export async function runSchemaCheck(): Promise<SchemaCheckResult> {
  if (inFlight) return inFlight;
  inFlight = checkSchema()
    .then((result) => {
      current = result;
      if (result.status === "drift") {
        logger.error({ drift: result.drift }, result.hint);
      } else if (result.status === "unchecked") {
        logger.warn(
          { err: result.error },
          "Schema check could not reach the database — will retry on /api/healthz",
        );
      } else {
        logger.info("Schema check passed — every expected column is present");
      }
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * The latest result, refreshed when stale or when the last result was not a
 * clean pass — so a service that booted against a missing column recovers
 * on its own once the migration lands, and a transient DB error is retried.
 */
export async function currentSchemaStatus(): Promise<SchemaCheckResult> {
  const age = current.checkedAt
    ? Date.now() - new Date(current.checkedAt).getTime()
    : Number.POSITIVE_INFINITY;
  if (current.status !== "ok" || age > RECHECK_AFTER_MS) {
    return runSchemaCheck();
  }
  return current;
}

/** Test hook: forget the cached result. */
export function resetSchemaCheckForTests(): void {
  current = {
    status: "unchecked",
    checkedAt: null,
    drift: [],
    error: "not yet checked",
  };
  inFlight = null;
}
