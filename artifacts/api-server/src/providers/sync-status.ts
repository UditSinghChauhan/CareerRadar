/**
 * Sync status for `GET /api/health?detail=1` (Phase 9)
 * ─────────────────────────────────────────────────────
 * Answers the one question the plain health check cannot: "is ingestion
 * actually happening, and if not, which provider stopped?"
 *
 * WHY THIS READS `provider_sync_logs` AND NOT `metrics.ts`
 * ────────────────────────────────────────────────────────
 * `providers/metrics.ts` is an in-memory Map. On a Render free instance that
 * spins down after 15 minutes idle, the process answering a health check is
 * almost always one that booted seconds earlier for that very request — so the
 * in-memory counters read zero, every time, for a service that is syncing
 * perfectly well. Reporting them as the headline would make this route worse
 * than useless: it would show a healthy service as having never synced.
 *
 * `provider_sync_logs` is written by the scheduler on every config run and
 * survives restarts, so it is the only source that can answer across a
 * spin-down. The in-memory numbers are still reported, but under `scheduler`
 * and explicitly scoped to "this process".
 *
 * COST (measured against the live Neon table, 2026-09-16)
 * ───────────────────────────────────────────────────────
 * 2,222 rows / 616 kB after 37 days, growing ~60 rows a day (nine providers'
 * worth of config rows per run, four runs a day). Two sequential scans with a
 * GROUP BY over that is sub-millisecond and stays that way for years, so this
 * adds no index and therefore needs no migration. Revisit past ~1M rows.
 *
 * WHY IT IS OPT-IN (`?detail=1`)
 * ───────────────────────────────
 * `GET /api/health` is both Render's deploy health check and the sync
 * workflow's wake step, and both hit a cold instance. Two extra aggregate
 * queries buy neither of them anything and spend latency on the 30–60 second
 * cold start the workflow is already straining against. The default body is
 * unchanged byte for byte; detail is asked for.
 */

import { sql } from "drizzle-orm";
import { db, providerSyncLogsTable } from "@workspace/db";
import { providerRegistry } from "./registry";
import { getEnabledConfigs } from "./config";
import { metrics } from "./metrics";
import { schedulerService } from "./scheduler";

/**
 * What one provider's ingestion looks like right now.
 *
 *   ok         — succeeded inside the staleness window.
 *   stale      — has succeeded before, but not recently enough. It is
 *                registered and configured, so this is a real regression:
 *                either the provider is failing silently or the cron stopped.
 *   failing    — its most recent run failed and nothing has succeeded since.
 *   never_run  — registered and enabled, but the log has no row for it. A
 *                newly added provider, or one the scheduler is not picking up.
 *   disabled   — registered, but no enabled config points at it. This covers
 *                the deliberate no-op stubs (internshala, unstop, wellfound),
 *                so their absence from the log is never read as a fault.
 */
export type ProviderState =
  | "ok"
  | "stale"
  | "failing"
  | "never_run"
  | "disabled";

export interface ProviderSyncStatus {
  name: string;
  displayName: string;
  state: ProviderState;
  /** How many company/provider configs the scheduler runs for this provider. */
  configuredCompanies: number;
  /** Most recent run of any status, ISO, or null. */
  lastRunAt: string | null;
  /** Most recent `success` run, ISO, or null. */
  lastSuccessAt: string | null;
  /** Runs in the last 24 hours, and how many of those failed. */
  runs24h: number;
  failures24h: number;
  /** Rows this provider inserted / updated in the last 24 hours. */
  jobsInserted24h: number;
  jobsUpdated24h: number;
  /** The newest failure's message. Only set while `state` is `failing`. */
  lastError: string | null;
}

export interface SyncStatus {
  /** `ok` once the log has been read; `unchecked` when the database was unreachable. */
  status: "ok" | "unchecked";
  /** Most recent successful run across every provider — the headline number. */
  lastSyncAt: string | null;
  /** Most recent run of any status across every provider. */
  lastRunAt: string | null;
  /** Age of `lastSyncAt` in seconds, or null when nothing has ever succeeded. */
  lastSyncAgeSeconds: number | null;
  /** True when `lastSyncAt` falls inside the staleness window. */
  fresh: boolean;
  /** The window `fresh` and `state: "stale"` are measured against. */
  staleAfterSeconds: number;
  /**
   * The in-process scheduler. Scoped to THIS process deliberately: on the free
   * tier it dies with every spin-down, so `lastRunAt: null` here is normal and
   * says nothing about whether ingestion works. `lastSyncAt` above says that.
   */
  scheduler: {
    enabled: boolean;
    intervalMs: number;
    running: boolean;
    runsThisProcess: number;
    lastRunAt: string | null;
    nextRunAt: string | null;
  };
  providers: ProviderSyncStatus[];
  /** Why `providers` is empty. Only set when `status` is `unchecked`. */
  error?: string;
}

/**
 * A provider that has not succeeded within two scheduler intervals is stale.
 *
 * Two rather than one: production is driven by a GitHub Actions cron at
 * the six-hourly GitHub Actions cron, and one missed firing is ordinary — the free runner queue is
 * not punctual and Render's cold start eats up to a minute of the job's own
 * budget. Two consecutive misses is not ordinary.
 */
export const STALE_INTERVAL_MULTIPLIER = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface LogAggregate {
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  runs24h: number;
  failures24h: number;
  jobsInserted24h: number;
  jobsUpdated24h: number;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Postgres returns `count`/`sum` as strings (bigint/numeric), and pg parses
 * timestamps to Date while PGlite can hand back a string. Both are normalised
 * here so the JSON never carries a string where a number or an ISO date is
 * expected — the health route is read by scripts, not just by eye.
 */
function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One grouped pass over the log: per provider, both timestamps and the 24h counters. */
async function readAggregates(since: Date): Promise<Map<string, LogAggregate>> {
  const cutoff = sql`${since.toISOString()}::timestamptz`;
  const recent = sql`${providerSyncLogsTable.startedAt} >= ${cutoff}`;

  const rows = await db
    .select({
      providerName: providerSyncLogsTable.providerName,
      lastRunAt: sql`max(${providerSyncLogsTable.startedAt})`,
      lastSuccessAt: sql`max(${providerSyncLogsTable.startedAt}) filter (where ${providerSyncLogsTable.status} = 'success')`,
      runs24h: sql`count(*) filter (where ${recent})`,
      failures24h: sql`count(*) filter (where ${providerSyncLogsTable.status} = 'failure' and ${recent})`,
      jobsInserted24h: sql`coalesce(sum(${providerSyncLogsTable.jobsInserted}) filter (where ${recent}), 0)`,
      jobsUpdated24h: sql`coalesce(sum(${providerSyncLogsTable.jobsUpdated}) filter (where ${recent}), 0)`,
    })
    .from(providerSyncLogsTable)
    .groupBy(providerSyncLogsTable.providerName);

  return new Map(
    rows.map((r) => [
      r.providerName,
      {
        lastRunAt: toDate(r.lastRunAt),
        lastSuccessAt: toDate(r.lastSuccessAt),
        runs24h: num(r.runs24h),
        failures24h: num(r.failures24h),
        jobsInserted24h: num(r.jobsInserted24h),
        jobsUpdated24h: num(r.jobsUpdated24h),
      },
    ]),
  );
}

/**
 * The newest failure message per provider.
 *
 * A DISTINCT ON pass rather than another aggregate in the query above: the
 * message belongs to one specific row, and `max(error_message)` would return
 * the alphabetically largest message from any failed run ever — nonsense
 * dressed up as data.
 */
async function readLastErrors(): Promise<Map<string, string>> {
  const rows = await db
    .selectDistinctOn([providerSyncLogsTable.providerName], {
      providerName: providerSyncLogsTable.providerName,
      startedAt: providerSyncLogsTable.startedAt,
      errorMessage: providerSyncLogsTable.errorMessage,
    })
    .from(providerSyncLogsTable)
    .where(sql`${providerSyncLogsTable.status} = 'failure'`)
    .orderBy(
      providerSyncLogsTable.providerName,
      sql`${providerSyncLogsTable.startedAt} desc`,
    );

  return new Map(
    rows
      .filter((r): r is typeof r & { errorMessage: string } =>
        Boolean(r.errorMessage),
      )
      .map((r) => [r.providerName, r.errorMessage]),
  );
}

/**
 * Classify one provider. Order matters: `disabled` first, because a disabled
 * provider's stale log is expected rather than a fault; then `never_run`, so a
 * provider with no history is never reported as "failing".
 */
export function classifyProvider(args: {
  configuredCompanies: number;
  aggregate: LogAggregate | undefined;
  staleAfterMs: number;
  now: Date;
}): ProviderState {
  const { configuredCompanies, aggregate, staleAfterMs, now } = args;
  if (configuredCompanies === 0) return "disabled";
  if (!aggregate || aggregate.lastRunAt === null) return "never_run";

  const { lastRunAt, lastSuccessAt } = aggregate;
  // Nothing has ever succeeded, or the newest run is a failure that no later
  // success corrects.
  if (lastSuccessAt === null || lastSuccessAt < lastRunAt) return "failing";

  return now.getTime() - lastSuccessAt.getTime() <= staleAfterMs
    ? "ok"
    : "stale";
}

/**
 * Read the sync picture. Never throws: a database that cannot be reached comes
 * back as `status: "unchecked"`, mirroring the schema check's own rule that it
 * reports drift, never outages. The detail route is a diagnostic — it must not
 * be the thing that turns a degraded service into a failed health check.
 */
export async function getSyncStatus(
  now: Date = new Date(),
): Promise<SyncStatus> {
  const intervalMs = schedulerService.intervalMs;
  const staleAfterMs = intervalMs * STALE_INTERVAL_MULTIPLIER;

  // One config row per company+provider pair; a provider with none is not
  // scheduled at all, which is what `disabled` reports.
  const configured = new Map<string, number>();
  for (const config of getEnabledConfigs()) {
    configured.set(
      config.providerName,
      (configured.get(config.providerName) ?? 0) + 1,
    );
  }

  const schedulerMetrics = metrics.getSummary().scheduler;
  const scheduler: SyncStatus["scheduler"] = {
    enabled: schedulerService.enabled,
    intervalMs,
    running: schedulerMetrics.isRunning,
    runsThisProcess: schedulerMetrics.totalSchedulerRuns,
    lastRunAt: iso(toDate(schedulerMetrics.lastSchedulerRunAt)),
    nextRunAt: iso(toDate(schedulerMetrics.nextSchedulerRunAt)),
  };

  let aggregates: Map<string, LogAggregate>;
  let lastErrors: Map<string, string>;
  try {
    [aggregates, lastErrors] = await Promise.all([
      readAggregates(new Date(now.getTime() - DAY_MS)),
      readLastErrors(),
    ]);
  } catch (err) {
    return {
      status: "unchecked",
      lastSyncAt: null,
      lastRunAt: null,
      lastSyncAgeSeconds: null,
      fresh: false,
      staleAfterSeconds: Math.round(staleAfterMs / 1000),
      scheduler,
      providers: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const providers: ProviderSyncStatus[] = providerRegistry
    .list()
    .map(({ name, displayName }) => {
      const aggregate = aggregates.get(name);
      const configuredCompanies = configured.get(name) ?? 0;
      const state = classifyProvider({
        configuredCompanies,
        aggregate,
        staleAfterMs,
        now,
      });
      return {
        name,
        displayName,
        state,
        configuredCompanies,
        lastRunAt: iso(aggregate?.lastRunAt ?? null),
        lastSuccessAt: iso(aggregate?.lastSuccessAt ?? null),
        runs24h: aggregate?.runs24h ?? 0,
        failures24h: aggregate?.failures24h ?? 0,
        jobsInserted24h: aggregate?.jobsInserted24h ?? 0,
        jobsUpdated24h: aggregate?.jobsUpdated24h ?? 0,
        // Only while failing: a provider that failed last Tuesday and has
        // succeeded four times since does not need its old error surfaced on a
        // health page.
        lastError: state === "failing" ? (lastErrors.get(name) ?? null) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // The headline timestamps come from the aggregates rather than a third
  // query — every provider's maximum is already in hand.
  let lastSyncAt: Date | null = null;
  let lastRunAt: Date | null = null;
  for (const a of aggregates.values()) {
    if (a.lastSuccessAt && (!lastSyncAt || a.lastSuccessAt > lastSyncAt)) {
      lastSyncAt = a.lastSuccessAt;
    }
    if (a.lastRunAt && (!lastRunAt || a.lastRunAt > lastRunAt)) {
      lastRunAt = a.lastRunAt;
    }
  }

  const ageMs = lastSyncAt ? now.getTime() - lastSyncAt.getTime() : null;

  return {
    status: "ok",
    lastSyncAt: iso(lastSyncAt),
    lastRunAt: iso(lastRunAt),
    lastSyncAgeSeconds: ageMs === null ? null : Math.round(ageMs / 1000),
    fresh: ageMs !== null && ageMs <= staleAfterMs,
    staleAfterSeconds: Math.round(staleAfterMs / 1000),
    scheduler,
    providers,
  };
}
