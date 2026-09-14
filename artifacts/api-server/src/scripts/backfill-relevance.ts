/**
 * Backfill: classify every job row for relevance (Phase 2.2).
 *
 * WHY THIS EXISTS
 * ────────────────
 * Phase 2.1 classifies each posting at ingest time into a track
 * (internship / new_grad / early_career / not_relevant) with a 0–100 score.
 * Every row that existed before that is unclassified — `is_fresher_eligible`
 * false — which makes the default Jobs-page filter show nothing. This fills
 * the columns in, and re-running it is how a rules change reaches old rows.
 *
 * RECOMPUTE-ALL
 * ──────────────
 * There is no "skip if already set". See ../relevance/backfill-relevance.ts.
 *
 * SAFETY
 * ───────
 * Report-only by default: prints the track distribution and the top-20
 * ranking it WOULD write and exits. Writing requires `--yes`. The
 * database-target rail from ../lib/backfill-target.ts applies unchanged — a
 * non-local DATABASE_URL is refused without `--allow-remote`, and a remote
 * write additionally requires typing the host name. This is the sanctioned
 * way to take a READ-ONLY projection from the deployed database:
 *
 *   DATABASE_URL=<neon direct url> pnpm --filter @workspace/api-server run backfill:relevance -- --allow-remote
 *
 * ON THE DEPLOYED DATABASE
 * ─────────────────────────
 * There is no shell on the Render box, so production is backfilled through
 * `POST /api/admin/backfill-relevance` (routes/admin.ts), which runs the
 * same function and returns the same report as JSON.
 *
 * NOT IMPORTED BY THE SERVER — run with tsx (esbuild CLI-guard rule, CLAUDE.md).
 *
 *   pnpm --filter @workspace/api-server run backfill:relevance
 *   pnpm --filter @workspace/api-server run backfill:relevance -- --yes
 *   pnpm --filter @workspace/api-server run backfill:relevance -- --year 2027
 */

import { createInterface } from "node:readline/promises";
import { pool } from "@workspace/db";
import {
  backfillRelevance,
  type BackfillRelevanceReport,
  type TrackCounts,
} from "../relevance/backfill-relevance";
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
  /** undefined = use the profile's; null = score without batch modifiers. */
  year: number | null | undefined;
  top: number;
}

function parseArgs(argv: string[]): Options {
  let confirmed = false;
  let allowRemote = false;
  let year: number | null | undefined = undefined;
  let top = 20;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    if (arg === "--yes" || arg === "-y") {
      confirmed = true;
      continue;
    }
    if (arg === "--allow-remote") {
      allowRemote = true;
      continue;
    }
    if (arg === "--year") {
      const raw = argv[i + 1];
      i += 1;
      if (raw === "none") {
        year = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 2000 || n > 2100) {
        throw new UsageError(
          `--year needs a four-digit year or "none", got "${raw}"`,
        );
      }
      year = n;
      continue;
    }
    if (arg === "--top") {
      const n = Number(argv[i + 1]);
      i += 1;
      if (!Number.isInteger(n) || n < 1 || n > 200) {
        throw new UsageError(`--top needs a number from 1 to 200`);
      }
      top = n;
      continue;
    }
    throw new UsageError(`Unrecognised argument "${arg}"`);
  }
  return { confirmed, allowRemote, year, top };
}

function printTracks(title: string, counts: TrackCounts, total: number) {
  console.log(`  ${title}`);
  const width = Math.max(...Object.keys(counts).map((k) => k.length));
  for (const [track, n] of Object.entries(counts)) {
    const pct = total === 0 ? 0 : Math.round((n / total) * 1000) / 10;
    console.log(
      `    ${track.padEnd(width)}  ${String(n).padStart(6)}  ${String(pct).padStart(5)}%`,
    );
  }
}

function printReport(report: BackfillRelevanceReport, wrote: boolean) {
  const activeTotal = Object.values(report.activeTracks).reduce(
    (a, b) => a + b,
    0,
  );
  console.log("");
  console.log(`  Rows scanned          ${report.scanned}`);
  console.log(
    `  Rows ${wrote ? "updated" : "that would change"}     ${report.updated}`,
  );
  console.log(
    `  Graduation year       ${report.graduationYear ?? "(none — no batch modifiers)"}`,
  );
  console.log(`  Batches               ${report.batches} × 500`);
  console.log(`  Duration              ${report.durationMs} ms`);
  console.log("");
  printTracks(
    `Active rows by track (${activeTotal})`,
    report.activeTracks,
    activeTotal,
  );
  console.log("");
  printTracks(
    `All rows by track (${report.scanned})`,
    report.tracks,
    report.scanned,
  );
  console.log("");
  console.log(`  Active fresher-eligible   ${report.activeFresherEligible}`);
  console.log(`  Active seniority-excluded ${report.activeSeniorityExcluded}`);
  console.log(
    `  Provider said internship, classifier did not: ${report.activeJobTypeDisagreements.providerInternshipNotTrack}`,
  );
  console.log(
    `  Classifier said internship, provider did not: ${report.activeJobTypeDisagreements.trackInternshipNotProvider}`,
  );
  console.log("");
  console.log("  Active fresher-eligible rows by score:");
  for (const [bucket, n] of Object.entries(report.activeScoreHistogram)) {
    const label =
      bucket === "90" ? "90-100" : `${bucket}-${Number(bucket) + 9}`;
    console.log(`    ${label.padEnd(7)} ${String(n).padStart(6)}`);
  }
  if (report.topActiveTitles.length > 0) {
    console.log("");
    console.log(
      `  Top ${report.topActiveTitles.length} active titles by score:`,
    );
    for (const [i, t] of report.topActiveTitles.entries()) {
      console.log(
        `    ${String(i + 1).padStart(2)}. ${String(t.score).padStart(3)}  ${t.track.padEnd(12)} ${t.title}` +
          (t.company ? `  — ${t.company}` : "") +
          (t.sourcePlatform ? `  [${t.sourcePlatform}]` : ""),
      );
    }
  }
  console.log("");
}

async function confirmRemoteWrite(host: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`  About to rewrite relevance columns on "${host}".`);
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
  const { confirmed, allowRemote, year, top } = parseArgs(
    process.argv.slice(2),
  );

  const target = resolveDatabaseTarget({
    databaseUrl: process.env["DATABASE_URL"],
    allowRemote,
    write: confirmed,
    interactive: process.stdin.isTTY === true,
  });

  console.log("");
  console.log("  Backfill — relevance classification");
  console.log("  ───────────────────────────────────");
  console.log(`  Database              ${target.host}`);
  console.log(`  Mode                  ${confirmed ? "WRITE" : "report only"}`);

  if (target.requiresTypedConfirmation) {
    console.log("");
    await confirmRemoteWrite(target.host);
  }

  const report = await backfillRelevance({
    dryRun: !confirmed,
    graduationYear: year,
    topN: top,
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
