/**
 * Source Registry
 * ───────────────
 * Merges four data sources into a unified SourceRecord view:
 *
 *   1. providers/config.ts    — enabled flag, providerId, maintainer note
 *   2. providers/catalog.ts   — name, careerUrl, industry, verificationStatus
 *   3. provider_sync_logs DB  — last sync timestamps, inserted counts, errors
 *   4. jobs + companies DB    — live job counts per company
 *
 * Adding a new source requires only changes to config.ts and catalog.ts.
 * No code in this file needs to be touched.
 */

import { eq, sql, and } from "drizzle-orm";
import { db, companiesTable, jobsTable, providerSyncLogsTable } from "@workspace/db";
import { getAllConfigs } from "../providers/config";
import { COMPANY_CATALOG } from "../providers/catalog";
import type { SourceRecord, SourceStatus, SourceHealth, SourceSummary } from "./types";

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Human-readable sync frequency label derived from the interval env var. */
function syncFrequencyLabel(): string {
  const ms = parseInt(process.env["PROVIDER_SYNC_INTERVAL_MS"] ?? "21600000", 10);
  const hours = ms / (1000 * 60 * 60);
  if (hours === 1) return "every hour";
  if (Number.isInteger(hours)) return `every ${hours} hours`;
  const minutes = ms / (1000 * 60);
  return `every ${Math.round(minutes)} minutes`;
}

/** Classify a disabled source into a more specific status. */
function classifyDisabled(
  providerName: string,
  note: string,
  verificationStatus: string,
): SourceStatus {
  if (providerName === "workday") return "no-public-api";
  const n = note.toLowerCase();
  if (n.includes("401")) return "auth-required";
  if (n.includes("404") || n.includes("broken")) return "broken";
  if (n.includes("0 active postings")) return "empty";
  if (verificationStatus === "verified") return "disabled";
  return "disabled";
}

// ─── DB queries ──────────────────────────────────────────────────────────────

interface SyncLogRow {
  providerName: string;
  companySlug: string;
  lastSync: Date | null;
  lastError: string | null;
  jobsImported: number;
  jobsLastRun: number;
}

/** Fetch per-source sync stats from the sync log table. */
async function fetchSyncStats(): Promise<Map<string, SyncLogRow>> {
  const rows = await db
    .select({
      providerName: providerSyncLogsTable.providerName,
      companySlug: providerSyncLogsTable.companySlug,
      lastSync: sql<Date | null>`
        max(${providerSyncLogsTable.finishedAt})
          FILTER (WHERE ${providerSyncLogsTable.status} = 'success')
      `,
      lastError: sql<string | null>`
        (array_agg(
          ${providerSyncLogsTable.errorMessage}
          ORDER BY ${providerSyncLogsTable.startedAt} DESC
        ) FILTER (WHERE ${providerSyncLogsTable.status} = 'failure'))[1]
      `,
      jobsImported: sql<number>`
        coalesce(sum(${providerSyncLogsTable.jobsInserted})
          FILTER (WHERE ${providerSyncLogsTable.status} = 'success'), 0)::int
      `,
      jobsLastRun: sql<number>`
        coalesce((array_agg(
          ${providerSyncLogsTable.jobsInserted}
          ORDER BY ${providerSyncLogsTable.startedAt} DESC
        ))[1], 0)::int
      `,
    })
    .from(providerSyncLogsTable)
    .groupBy(providerSyncLogsTable.providerName, providerSyncLogsTable.companySlug);

  const map = new Map<string, SyncLogRow>();
  for (const row of rows) {
    map.set(`${row.providerName}:${row.companySlug}`, {
      providerName: row.providerName,
      companySlug: row.companySlug,
      lastSync: row.lastSync,
      lastError: row.lastError,
      jobsImported: row.jobsImported ?? 0,
      jobsLastRun: row.jobsLastRun ?? 0,
    });
  }
  return map;
}

/** Fetch live job counts per company slug from the jobs table. */
async function fetchJobCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({
      slug: companiesTable.slug,
      count: sql<number>`count(${jobsTable.id})::int`,
    })
    .from(companiesTable)
    .leftJoin(jobsTable, eq(jobsTable.companyId, companiesTable.id))
    .groupBy(companiesTable.slug);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.slug, row.count ?? 0);
  }
  return map;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns all configured sources (enabled and disabled) as SourceRecord[].
 * Merges config + catalog + DB sync stats + DB job counts.
 */
export async function getSources(): Promise<SourceRecord[]> {
  const [syncStats, jobCounts] = await Promise.all([
    fetchSyncStats(),
    fetchJobCounts(),
  ]);

  const catalogMap = new Map(COMPANY_CATALOG.map((e) => [e.slug, e]));
  const frequency = syncFrequencyLabel();
  const configs = getAllConfigs();

  return configs.map((cfg) => {
    const id = `${cfg.providerName}:${cfg.companySlug}`;
    const catalog = catalogMap.get(cfg.companySlug);
    const stats = syncStats.get(id);
    const isEnabled = cfg.enabled !== false;

    let status: SourceStatus;
    if (isEnabled) {
      if (!stats) {
        status = "pending";
      } else if (stats.lastSync === null) {
        status = "failing";
      } else {
        status = "active";
      }
    } else {
      status = classifyDisabled(
        cfg.providerName,
        cfg.note ?? "",
        catalog?.verificationStatus ?? "unverified",
      );
    }

    return {
      id,
      name: catalog?.name ?? cfg.companySlug,
      companySlug: cfg.companySlug,
      providerName: cfg.providerName,
      providerId: cfg.providerId,
      status,
      enabled: isEnabled,
      verificationStatus: catalog?.verificationStatus ?? "unverified",
      lastSync: stats?.lastSync ?? null,
      lastError: stats?.lastError ?? null,
      jobsInDb: jobCounts.get(cfg.companySlug) ?? 0,
      jobsImported: stats?.jobsImported ?? 0,
      jobsLastRun: stats?.jobsLastRun ?? 0,
      syncFrequency: frequency,
      careerUrl: catalog?.careerUrl ?? "",
      industry: catalog?.industry ?? "",
      note: cfg.note,
    } satisfies SourceRecord;
  });
}

/** Returns a single source by its composite ID ("{providerName}:{companySlug}"). */
export async function getSourceById(id: string): Promise<SourceRecord | null> {
  const sources = await getSources();
  return sources.find((s) => s.id === id) ?? null;
}

/**
 * Builds the aggregated health report.
 * Classifies sources into buckets and computes job contribution stats.
 */
export async function getSourceHealth(): Promise<SourceHealth> {
  const sources = await getSources();
  const frequency = syncFrequencyLabel();

  const toSummary = (s: SourceRecord): SourceSummary => ({
    id: s.id,
    name: s.name,
    companySlug: s.companySlug,
    providerName: s.providerName,
    status: s.status,
    lastSync: s.lastSync,
    jobsInDb: s.jobsInDb,
    jobsImported: s.jobsImported,
    note: s.note,
  });

  const active = sources.filter((s) => s.status === "active").map(toSummary);
  const failing = sources.filter((s) => s.status === "failing").map(toSummary);
  const disabled = sources.filter((s) => s.status === "disabled").map(toSummary);
  const broken = sources.filter((s) => s.status === "broken").map(toSummary);
  const authRequired = sources.filter((s) => s.status === "auth-required").map(toSummary);
  const noPublicApi = sources.filter((s) => s.status === "no-public-api").map(toSummary);

  const jobsPerSource = [...sources]
    .sort((a, b) => b.jobsInDb - a.jobsInDb)
    .map(toSummary);

  return {
    generatedAt: new Date(),
    syncFrequency: frequency,
    totals: {
      configured: sources.length,
      active: active.length,
      failing: failing.length,
      pending: sources.filter((s) => s.status === "pending").length,
      empty: sources.filter((s) => s.status === "empty").length,
      disabled: disabled.length,
      broken: broken.length,
      authRequired: authRequired.length,
      noPublicApi: noPublicApi.length,
    },
    active,
    failing,
    disabled,
    broken,
    authRequired,
    noPublicApi,
    jobsPerSource,
  };
}
