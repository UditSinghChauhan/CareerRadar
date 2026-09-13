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
 * It establishes which database it is aimed at BEFORE issuing a single query, so
 * a misaimed DATABASE_URL fails on a sentence naming the host rather than on a
 * select that got halfway to production. A non-local host is refused outright
 * unless `--allow-remote` is given; `--allow-remote` alone still only reports,
 * and `--allow-remote --yes` additionally requires the host name to be typed at
 * an interactive prompt. See ../lib/backfill-target.ts for the full policy.
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
 *   DATABASE_URL=<neon> pnpm --filter @workspace/api-server run backfill:stale-jobs -- --allow-remote
 */

import { createInterface } from "node:readline/promises";
import { count, eq } from "drizzle-orm";
import { db, jobsTable, pool } from "@workspace/db";
import { closeJobsOlderThan, findJobsOlderThan } from "../providers/staleness";
import {
  AbortedError,
  confirmationMatchesHost,
  resolveDatabaseTarget,
  UsageError,
  type DatabaseTarget,
} from "../lib/backfill-target";
import { formatError } from "../lib/describe-error";
import { logger } from "../lib/logger";

/** The spec's cutoff: a posting older than this is dead by any reasonable reading. */
const DEFAULT_DAYS = 60;

interface Options {
  days: number;
  confirmed: boolean;
  allowRemote: boolean;
}

function parseArgs(argv: string[]): Options {
  let days = DEFAULT_DAYS;
  let confirmed = false;
  let allowRemote = false;

  for (const arg of argv) {
    // `pnpm run <script> -- --days=90` forwards the separator itself.
    if (arg === "--") continue;
    if (arg === "--yes" || arg === "-y") {
      confirmed = true;
      continue;
    }
    if (arg === "--allow-remote") {
      allowRemote = true;
      continue;
    }
    const daysMatch = /^--days(?:=(.*))?$/.exec(arg);
    if (daysMatch) {
      const parsed = Number.parseInt(daysMatch[1] ?? "", 10);
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new UsageError(
          `--days needs a positive integer, e.g. --days=60 (got "${arg}")`,
        );
      }
      days = parsed;
      continue;
    }
    throw new UsageError(`Unrecognised argument "${arg}"`);
  }

  return { days, confirmed, allowRemote };
}

async function activeJobCount(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(jobsTable)
    .where(eq(jobsTable.status, "active"));
  return row?.value ?? 0;
}

/**
 * The banner for a run pointed at a database that is not this machine.
 *
 * Loud on purpose, and printed before anything else this run does: the operator
 * has just overridden the safety rail, and the two facts they need in order to
 * notice a mistake are which host they hit and how many live rows are on it.
 */
function warnRemoteTarget(host: string, activeBefore: number): void {
  const title = "!!  REMOTE DATABASE  —  --allow-remote was given  !!";
  const width = title.length + 4;
  console.error("");
  console.error(`  ╔${"═".repeat(width)}╗`);
  console.error(`  ║  ${title}  ║`);
  console.error(`  ╚${"═".repeat(width)}╝`);
  console.error("");
  console.error(`  Host              ${host}`);
  console.error(`  Active jobs       ${activeBefore}`);
  console.error("");
  console.error(
    "  These are live rows. The provider APIs cannot re-supply a posting",
  );
  console.error(
    "  that has already dropped out of their listings, so a close here is",
  );
  console.error("  effectively permanent.");
  console.error("");
}

/**
 * Ask for the host name, not for a keystroke.
 *
 * `y` is muscle memory; typing `ep-xxxx.aws.neon.tech` is not. Reaching this
 * function at all means `resolveDatabaseTarget` already established stdin is a
 * TTY, so there is no non-interactive path that can satisfy it.
 */
async function confirmRemoteWrite(
  host: string,
  toClose: number,
): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`  About to close ${toClose} job(s) on "${host}".`);
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
  const { days, confirmed, allowRemote } = parseArgs(process.argv.slice(2));

  // Before any query: establish what we are aimed at and whether that is allowed.
  const target: DatabaseTarget = resolveDatabaseTarget({
    databaseUrl: process.env["DATABASE_URL"],
    allowRemote,
    write: confirmed,
    interactive: process.stdin.isTTY === true,
  });

  const activeBefore = await activeJobCount();
  if (!target.isLocal) warnRemoteTarget(target.host, activeBefore);

  const { cutoff, count: staleCount } = await findJobsOlderThan(days);

  console.log("");
  console.log("  Backfill — close stale jobs");
  console.log("  ───────────────────────────");
  console.log(`  Database            ${target.host}`);
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
    if (target.isLocal) {
      console.log("  Re-run with --yes to close the rows above.");
    } else {
      console.log(
        "  Re-run with --allow-remote --yes to close the rows above;",
      );
      console.log("  you will be asked to type the host name first.");
    }
    console.log("");
    return;
  }

  if (staleCount === 0) {
    console.log("  Nothing to close. (Already clean — this script is safe to");
    console.log("  re-run; it only ever touches rows still marked active.)");
    console.log("");
    return;
  }

  if (target.requiresTypedConfirmation) {
    await confirmRemoteWrite(target.host, staleCount);
    console.log("");
  }

  // Logged before the write, with the count it is about to close: if this ever
  // misfires the log has to say why, not just that it happened.
  logger.info(
    {
      backfill: "close-stale-jobs",
      host: target.host,
      remote: !target.isLocal,
      days,
      cutoff,
      activeBefore,
      toClose: staleCount,
    },
    `Backfill closing ${staleCount} job(s) older than ${days} days on ${target.host}`,
  );

  console.log(`  --yes given — closing ${staleCount} job(s)...`);
  const { closed } = await closeJobsOlderThan(days);
  const activeAfter = await activeJobCount();

  // The exact number actually closed, which is not necessarily the number
  // predicted: a concurrent sync can close or insert rows in between.
  logger.info(
    {
      backfill: "close-stale-jobs",
      host: target.host,
      remote: !target.isLocal,
      days,
      predicted: staleCount,
      closed,
      activeBefore,
      activeAfter,
    },
    `Backfill closed ${closed} job(s) on ${target.host} — ${activeAfter} active remain`,
  );

  console.log("");
  console.log(`  Closed              ${closed}`);
  console.log(`  Active jobs now     ${activeAfter}`);
  if (closed !== staleCount) {
    console.log(
      `  (Predicted ${staleCount}; a concurrent sync changed the set in between.)`,
    );
  }
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
    if (err instanceof UsageError) {
      // Caused by the invocation or a declined confirmation, not by the system.
      // The sentence is the message.
      console.error(`\n  ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    // Everything else: the full chain, because the reason a backfill failed is
    // almost never in the top-level message — it is in cause.code.
    console.error("\n  Backfill failed.\n");
    console.error(formatError(err));
    console.error("");
    process.exitCode = 1;
  })
  .finally(() => {
    // node-postgres keeps the event loop alive until the pool is drained.
    void pool.end();
  });
