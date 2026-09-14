/**
 * Backfill: recompute the six normalised location columns for every job row.
 *
 * WHY THIS EXISTS
 * ────────────────
 * Phase 2.0 derives `location_city / _region / _country / _metro / is_india /
 * is_remote` from the free-text `location` at write time. Every row that
 * existed before that has all six unset, which puts the entire table in the
 * 'Unknown location' bucket and makes the default Jobs-page filter show
 * nothing. This fills them in.
 *
 * RECOMPUTE-ALL
 * ──────────────
 * There is no "skip if already set". The normaliser is deterministic, so
 * recomputing every row is both idempotent and the way a rules improvement
 * reaches old rows — run it again. See ../relevance/backfill-location.ts.
 *
 * SAFETY
 * ───────
 * Report-only by default: prints the bucket distribution it WOULD write and
 * exits. Writing requires `--yes`. The database-target rail from
 * ../lib/backfill-target.ts applies unchanged — a non-local DATABASE_URL is
 * refused without `--allow-remote`, and a remote write additionally requires
 * typing the host name. This backfill only touches derived columns, but the
 * rail is a property of the script family, not of what any one script writes.
 *
 * ON THE DEPLOYED DATABASE
 * ─────────────────────────
 * There is no shell on the Render box, so production is backfilled through
 * `POST /api/admin/backfill-location` (routes/admin.ts), which runs the same
 * function and returns the same report as JSON.
 *
 * NOT IMPORTED BY THE SERVER — run with tsx (esbuild CLI-guard rule, CLAUDE.md).
 *
 *   pnpm --filter @workspace/api-server run backfill:location
 *   pnpm --filter @workspace/api-server run backfill:location -- --yes
 */

import { createInterface } from "node:readline/promises";
import { pool } from "@workspace/db";
import {
  backfillLocations,
  type BackfillLocationReport,
  type BucketCounts,
} from "../relevance/backfill-location";
import {
  AbortedError,
  confirmationMatchesHost,
  resolveDatabaseTarget,
  UsageError,
} from "../lib/backfill-target";
import {
  diagnoseConnection,
  formatDiagnosis,
  isConnectionFailure,
} from "../lib/connection-diagnosis";
import { formatError } from "../lib/describe-error";

interface Options {
  confirmed: boolean;
  allowRemote: boolean;
}

function parseArgs(argv: string[]): Options {
  let confirmed = false;
  let allowRemote = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--yes" || arg === "-y") {
      confirmed = true;
      continue;
    }
    if (arg === "--allow-remote") {
      allowRemote = true;
      continue;
    }
    throw new UsageError(`Unrecognised argument "${arg}"`);
  }
  return { confirmed, allowRemote };
}

function printBuckets(title: string, counts: BucketCounts, total: number) {
  console.log(`  ${title}`);
  const width = Math.max(...Object.keys(counts).map((k) => k.length));
  for (const [bucket, n] of Object.entries(counts)) {
    const pct = total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
    console.log(
      `    ${bucket.padEnd(width)}  ${String(n).padStart(6)}  ${String(pct).padStart(5)}%`,
    );
  }
}

function printReport(report: BackfillLocationReport, wrote: boolean) {
  const activeTotal = Object.values(report.activeBuckets).reduce(
    (a, b) => a + b,
    0,
  );
  console.log("");
  console.log(`  Rows scanned        ${report.scanned}`);
  console.log(
    `  Rows ${wrote ? "updated" : "that would change"}   ${report.updated}`,
  );
  console.log(`  Remote (any bucket) ${report.remoteTotal}`);
  console.log(`  Batches             ${report.batches} × 500`);
  console.log(`  Duration            ${report.durationMs} ms`);
  console.log("");
  printBuckets(
    `Active rows by bucket (${activeTotal})`,
    report.activeBuckets,
    activeTotal,
  );
  console.log("");
  printBuckets(
    `All rows by bucket (${report.scanned})`,
    report.buckets,
    report.scanned,
  );
  console.log("");
  console.log(
    `  Unknown share of active rows: ${report.unknownActivePercent}%` +
      (report.unknownActivePercent > 10
        ? "  — above the 10% line; the tables need another pass"
        : ""),
  );
  if (report.topUnknownLocations.length > 0) {
    console.log("");
    console.log("  Most common raw strings in 'unknown':");
    for (const { location, count } of report.topUnknownLocations) {
      console.log(
        `    ${String(count).padStart(5)}  ${JSON.stringify(location)}`,
      );
    }
  }
  console.log("");
}

async function confirmRemoteWrite(host: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`  About to rewrite location columns on "${host}".`);
    const typed = await rl.question(
      `  Type the host name exactly to proceed: `,
    );
    if (!confirmationMatchesHost(typed, host)) {
      throw new AbortedError(
        `Aborted — "${typed.trim()}" does not match "${host}". Nothing was changed.`,
      );
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const { confirmed, allowRemote } = parseArgs(process.argv.slice(2));

  const target = resolveDatabaseTarget({
    databaseUrl: process.env["DATABASE_URL"],
    allowRemote,
    write: confirmed,
    interactive: process.stdin.isTTY === true,
  });

  console.log("");
  console.log("  Backfill — normalised location columns");
  console.log("  ──────────────────────────────────────");
  console.log(`  Database            ${target.host}`);
  console.log(`  Mode                ${confirmed ? "WRITE" : "report only"}`);

  if (target.requiresTypedConfirmation) {
    console.log("");
    await confirmRemoteWrite(target.host);
  }

  const report = await backfillLocations({
    dryRun: !confirmed,
    onBatch: ({ batch, scanned }) =>
      console.log(`  batch ${batch}: ${scanned} rows scanned`),
  });

  printReport(report, confirmed);

  if (!confirmed) {
    console.log(
      "  REPORT ONLY — nothing was changed. Re-run with --yes to write.",
    );
    console.log("");
  }
}

main()
  .catch(async (err: unknown) => {
    if (err instanceof UsageError) {
      console.error(`\n  ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    console.error("\n  Backfill failed.\n");
    console.error(formatError(err));
    console.error("");
    if (isConnectionFailure(err)) {
      const diagnosis = await diagnoseConnection(
        process.env["DATABASE_URL"] ?? "",
      );
      if (diagnosis) {
        console.error(formatDiagnosis(diagnosis));
        console.error("");
      }
    }
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
