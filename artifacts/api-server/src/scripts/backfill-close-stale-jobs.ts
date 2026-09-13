/**
 * One-off backfill: close job postings that are old enough to be certainly dead.
 *
 * WHY THIS EXISTS
 * ────────────────
 * Nothing ever closed a job before Phase 1.5, so the table starts as 100% active
 * — including postings from months ago. The last-seen sweep cannot fix that on
 * its own: it only closes rows for companies a provider actually re-fetches, and
 * the aggregator rows (RemoteOK, Remotive, Adzuna, JSearch) are never re-listed
 * at all. This script clears that backlog once.
 *
 * SAFETY
 * ───────
 * Report-only by default. It prints the number of rows it WOULD close and exits
 * without writing. Closing requires `--yes`, which is the explicit confirmation
 * the spec asks for. There is no "assume yes because it's non-interactive" path.
 *
 * IDEMPOTENT
 * ───────────
 * Every statement is scoped to `status = 'active'`, so a second run re-selects
 * nothing that the first run already closed. Re-running is a no-op, not a
 * double-close, and interrupting it half-way just means the rest is still
 * pending — there is no partial state to repair.
 *
 * NOT IMPORTED BY THE SERVER. This file is run with tsx and is deliberately
 * absent from the import graph of src/index.ts: esbuild inlines the whole
 * bundle into one dist/index.mjs, so a CLI entry point that lives inside that
 * graph would execute on every server boot (see CLAUDE.md).
 *
 *   pnpm --filter @workspace/api-server run backfill:stale-jobs
 *   pnpm --filter @workspace/api-server run backfill:stale-jobs -- --days=90
 *   pnpm --filter @workspace/api-server run backfill:stale-jobs -- --yes
 */

import { count, eq } from "drizzle-orm";
import { db, jobsTable, pool } from "@workspace/db";
import { closeJobsOlderThan, findJobsOlderThan } from "../providers/staleness";

/** The spec's cutoff: a posting older than this is dead by any reasonable reading. */
const DEFAULT_DAYS = 60;

interface Options {
  days: number;
  confirmed: boolean;
}

function parseArgs(argv: string[]): Options {
  let days = DEFAULT_DAYS;
  let confirmed = false;

  for (const arg of argv) {
    // `pnpm run <script> -- --days=90` forwards the separator itself.
    if (arg === "--") continue;
    if (arg === "--yes" || arg === "-y") {
      confirmed = true;
      continue;
    }
    const daysMatch = /^--days(?:=(.*))?$/.exec(arg);
    if (daysMatch) {
      const parsed = Number.parseInt(daysMatch[1] ?? "", 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(
          `--days needs a positive integer, e.g. --days=60 (got "${arg}")`,
        );
      }
      days = parsed;
      continue;
    }
    throw new Error(`Unrecognised argument "${arg}"`);
  }

  return { days, confirmed };
}

async function activeJobCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(jobsTable)
    .where(eq(jobsTable.status, "active"));
  return row?.value ?? 0;
}

async function main(): Promise<void> {
  const { days, confirmed } = parseArgs(process.argv.slice(2));

  const activeBefore = await activeJobCount();
  const { cutoff, count: staleCount } = await findJobsOlderThan(days);

  console.log("");
  console.log("  Backfill — close stale jobs");
  console.log("  ───────────────────────────");
  console.log(`  Cutoff              postedDate older than ${days} days`);
  console.log(`                      (${cutoff.toISOString()})`);
  console.log(`  Active jobs now     ${activeBefore}`);
  console.log(`  Would close         ${staleCount}`);
  console.log(
    `  Active after        ${activeBefore - staleCount}${
      activeBefore > 0
        ? ` (${Math.round(((activeBefore - staleCount) / activeBefore) * 100)}% of current)`
        : ""
    }`,
  );
  console.log("");

  if (!confirmed) {
    console.log("  REPORT ONLY — nothing was changed.");
    console.log("  Re-run with --yes to close the rows above.");
    console.log("");
    return;
  }

  if (staleCount === 0) {
    console.log("  Nothing to close. (Already clean — this script is safe to");
    console.log("  re-run; it only ever touches rows still marked active.)");
    console.log("");
    return;
  }

  console.log(`  --yes given — closing ${staleCount} job(s)...`);
  const { closed } = await closeJobsOlderThan(days);
  const activeAfter = await activeJobCount();

  console.log("");
  console.log(`  Closed              ${closed}`);
  console.log(`  Active jobs now     ${activeAfter}`);
  console.log("");

  if (activeAfter === 0 && activeBefore > 0) {
    // The spec's own sanity check: a backfill that empties the table is a bug,
    // not a success. Exit non-zero so this cannot pass unnoticed in a pipeline.
    console.error(
      "  WARNING: every active job was closed. That is almost certainly wrong —\n" +
        "  check jobs.posted_date before trusting this result.",
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    // node-postgres keeps the event loop alive until the pool is drained.
    void pool.end();
  });
