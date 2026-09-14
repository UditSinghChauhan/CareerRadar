/**
 * Minimum interval between runs of a metered provider.
 * ─────────────────────────────────────────────────────
 * Some provider quotas are billed per MONTH, not per day, and are small enough
 * that the sync cadence — not the per-run budget — is the binding constraint.
 *
 * JSearch is the case that forced this. Its free tier is 200 requests/month.
 * The cron workflow fires every 6 hours, so ~122 runs/month. Eight queries at
 * two pages each is 16 requests per run, which is 1,946 requests/month — 9.7x
 * the allowance, exhausting the month in 3.1 days. Every subsequent sync for
 * the remaining 27 days would then fail on quota.
 *
 * A per-run request budget cannot fix that: capping a run at 16 requests is
 * exactly what already happens. The only lever is running the provider less
 * often than the scheduler runs.
 *
 * 200 / 30.4 days = 6.6 requests per day. So a once-daily run of ~6 requests
 * fits, while a 6-hourly run of any useful size does not.
 *
 * WHY THIS READS provider_sync_logs RATHER THAN HOLDING STATE IN MEMORY
 * ─────────────────────────────────────────────────────────────────────
 * The Render free tier spins the instance down after 15 minutes idle, so any
 * in-process "last run" timestamp is lost on nearly every cycle and the gate
 * would never fire. The sync log is the only durable record of when a provider
 * last ran, and it is already written on every run.
 *
 * FAILS OPEN, like the boot-sync guard: if the lookup throws, the provider
 * runs. A throttle is an optimisation, and an unreachable database is already
 * fatal to the run for other reasons.
 */

import { and, desc, eq } from "drizzle-orm";
import { db, providerSyncLogsTable } from "@workspace/db";
import { logger } from "../lib/logger";

export interface IntervalDecision {
  run: boolean;
  reason:
    | "no-previous-run"
    | "interval-elapsed"
    | "too-soon"
    | "lookup-failed"
    | "disabled";
  lastRunAt: Date | null;
  hoursSince: number | null;
}

/**
 * Most recent successful run of one provider, across all its configs.
 *
 * Successful only: a failed run consumed little or no quota and proves nothing
 * about when the provider was last actually exercised, so it must not suppress
 * the next attempt.
 */
export async function lastSuccessfulRunOf(
  providerName: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: providerSyncLogsTable.startedAt })
    .from(providerSyncLogsTable)
    .where(
      and(
        eq(providerSyncLogsTable.providerName, providerName),
        eq(providerSyncLogsTable.status, "success"),
      ),
    )
    .orderBy(desc(providerSyncLogsTable.startedAt))
    .limit(1);

  return row?.startedAt ?? null;
}

/**
 * Should this metered provider run now?
 *
 * @param minIntervalHours Zero or negative disables the gate entirely, which is
 *   the escape hatch for local development and for anyone on a paid tier.
 */
export async function decideMeteredRun(
  providerName: string,
  minIntervalHours: number,
  now: Date = new Date(),
): Promise<IntervalDecision> {
  if (minIntervalHours <= 0) {
    return {
      run: true,
      reason: "disabled",
      lastRunAt: null,
      hoursSince: null,
    };
  }

  let lastRunAt: Date | null;
  try {
    lastRunAt = await lastSuccessfulRunOf(providerName);
  } catch (err) {
    logger.warn(
      { err, providerName },
      "Metered-interval lookup failed — running the provider anyway",
    );
    return {
      run: true,
      reason: "lookup-failed",
      lastRunAt: null,
      hoursSince: null,
    };
  }

  if (lastRunAt === null) {
    return {
      run: true,
      reason: "no-previous-run",
      lastRunAt: null,
      hoursSince: null,
    };
  }

  const hoursSince = (now.getTime() - lastRunAt.getTime()) / 3_600_000;

  // A negative value means the row is stamped in the future — clock skew
  // between the instance and Neon. Treat it as recent, which is the
  // quota-preserving reading.
  if (hoursSince < minIntervalHours) {
    return { run: false, reason: "too-soon", lastRunAt, hoursSince };
  }

  return { run: true, reason: "interval-elapsed", lastRunAt, hoursSince };
}

/**
 * Read a minimum-interval setting from an env var.
 *
 * A missing or unparseable value uses the fallback rather than throwing — this
 * runs inside the scheduler. Zero is honoured exactly and means "no gate".
 */
export function intervalHoursFromEnv(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  const parsed =
    raw !== undefined && raw !== "" ? Number.parseFloat(raw) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0) {
    if (raw !== undefined && raw !== "") {
      logger.warn(
        { [envVar]: raw, fallback },
        `${envVar} is not a non-negative number — using the default`,
      );
    }
    return fallback;
  }

  return parsed;
}

/**
 * Which slice of a query list this run should use.
 *
 * With a small per-run budget the provider cannot cover every query on every
 * run, so runs rotate through the list and the set is covered over several
 * days. The offset is derived from the calendar day rather than stored, because
 * the ephemeral filesystem and frequent restarts make any persisted cursor
 * unreliable — and a deterministic function of the date is reproducible when
 * debugging why a given posting was or was not fetched.
 */
export function rotateBy<T>(
  items: T[],
  count: number,
  now: Date = new Date(),
): T[] {
  if (items.length === 0 || count <= 0) return [];
  if (count >= items.length) return [...items];

  const dayNumber = Math.floor(now.getTime() / 86_400_000);
  const start = (dayNumber * count) % items.length;

  const slice: T[] = [];
  for (let i = 0; i < count; i++) {
    slice.push(items[(start + i) % items.length] as T);
  }
  return slice;
}
