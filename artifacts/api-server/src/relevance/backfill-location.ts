/**
 * Location backfill (Phase 2.0) — the runner shared by the tsx script and the
 * authenticated admin route.
 *
 * RECOMPUTE-ALL, BY DESIGN
 * ────────────────────────
 * `normalizeLocation` is deterministic, so this recomputes every row on every
 * run. There is no "skip rows already done" path: a rule improvement in
 * location.ts is picked up by simply running the backfill again, and a
 * half-finished run leaves nothing to repair — the rows it reached are right,
 * the rest are recomputed next time. Idempotent because re-running changes
 * nothing that the previous run did not already write.
 *
 * ONLY THE SIX LOCATION COLUMNS ARE WRITTEN. `location`, `country`,
 * `updatedAt` and everything else are untouched — this is a derived-column
 * refresh, not an edit, so it must not bump `updatedAt` or reorder anything
 * the user sees.
 *
 * MEMORY
 * ──────
 * Keyset pagination by primary key in batches of 500 — never `offset`, never
 * the whole table. The live instance has 512 MB and the table is past 2,800
 * rows and growing.
 *
 * NEVER READS `jobs.country`. The write-time path gets the provider's own
 * emitted value as a hint; a backfill only has the stored column, which is
 * exactly the unreliable one, so it passes nothing.
 */

import { asc, eq, gt, sql } from "drizzle-orm";
import { db, jobsTable } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  bucketOf,
  FEATURED_METROS,
  normalizeLocation,
  toLocationColumns,
  type LocationBucket,
} from "./location";

export const BACKFILL_BATCH_SIZE = 500;

/** One row per bucket, exclusive, summing to `scanned`. */
export type BucketCounts = Record<LocationBucket, number>;

export interface BackfillLocationReport {
  /** Rows read (every row in the table, whatever its status). */
  scanned: number;
  /** Rows whose six columns actually changed as a result. */
  updated: number;
  /** Bucket distribution over ALL rows scanned. */
  buckets: BucketCounts;
  /** The same distribution restricted to `status = 'active'` — the feed the user sees. */
  activeBuckets: BucketCounts;
  /** Rows with is_remote = true, any bucket (remote India rows count under their metro). */
  remoteTotal: number;
  /** The unknown share of active rows, 0–100. The number that decides whether the tables need another pass. */
  unknownActivePercent: number;
  /** Top raw `location` strings that landed in `unknown`, so the next pass knows what to add. */
  topUnknownLocations: Array<{ location: string | null; count: number }>;
  batches: number;
  durationMs: number;
}

const BUCKET_KEYS: LocationBucket[] = [
  ...FEATURED_METROS,
  "other_india",
  "remote",
  "unknown",
  "abroad",
];

function emptyCounts(): BucketCounts {
  return Object.fromEntries(BUCKET_KEYS.map((k) => [k, 0])) as BucketCounts;
}

type Row = {
  id: string;
  status: string;
  location: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  locationMetro: string | null;
  isIndia: boolean | null;
  isRemote: boolean;
};

function unchanged(
  row: Row,
  next: ReturnType<typeof toLocationColumns>,
): boolean {
  return (
    row.locationCity === next.locationCity &&
    row.locationRegion === next.locationRegion &&
    row.locationCountry === next.locationCountry &&
    row.locationMetro === next.locationMetro &&
    row.isIndia === next.isIndia &&
    row.isRemote === next.isRemote
  );
}

export interface BackfillLocationOptions {
  /** Report only — compute everything, write nothing. */
  dryRun?: boolean;
  /** Called after each batch; the script uses it to print progress. */
  onBatch?: (progress: {
    batch: number;
    scanned: number;
    updated: number;
  }) => void;
}

export async function backfillLocations(
  options: BackfillLocationOptions = {},
): Promise<BackfillLocationReport> {
  const started = Date.now();
  const buckets = emptyCounts();
  const activeBuckets = emptyCounts();
  const unknownByLocation = new Map<string | null, number>();
  let scanned = 0;
  let updated = 0;
  let remoteTotal = 0;
  let batches = 0;
  let cursor: string | null = null;

  for (;;) {
    const rows: Row[] = await db
      .select({
        id: jobsTable.id,
        status: jobsTable.status,
        location: jobsTable.location,
        locationCity: jobsTable.locationCity,
        locationRegion: jobsTable.locationRegion,
        locationCountry: jobsTable.locationCountry,
        locationMetro: jobsTable.locationMetro,
        isIndia: jobsTable.isIndia,
        isRemote: jobsTable.isRemote,
      })
      .from(jobsTable)
      .where(cursor ? gt(jobsTable.id, cursor) : undefined)
      .orderBy(asc(jobsTable.id))
      .limit(BACKFILL_BATCH_SIZE);

    if (rows.length === 0) break;
    batches += 1;

    for (const row of rows) {
      scanned += 1;
      const next = toLocationColumns(normalizeLocation(row.location));
      const bucket = bucketOf(next);

      buckets[bucket] += 1;
      if (row.status === "active") activeBuckets[bucket] += 1;
      if (next.isRemote) remoteTotal += 1;
      if (bucket === "unknown") {
        unknownByLocation.set(
          row.location,
          (unknownByLocation.get(row.location) ?? 0) + 1,
        );
      }

      if (unchanged(row, next)) continue;
      updated += 1;

      if (!options.dryRun) {
        // No `updatedAt` here on purpose — see the header.
        await db.update(jobsTable).set(next).where(eq(jobsTable.id, row.id));
      }
    }

    cursor = rows[rows.length - 1]!.id;
    options.onBatch?.({ batch: batches, scanned, updated });

    if (rows.length < BACKFILL_BATCH_SIZE) break;
  }

  const activeTotal = Object.values(activeBuckets).reduce((a, b) => a + b, 0);
  const unknownActivePercent =
    activeTotal === 0
      ? 0
      : Math.round((activeBuckets.unknown / activeTotal) * 1000) / 10;

  const topUnknownLocations = [...unknownByLocation.entries()]
    // Count desc, then the string itself so ties come out in a stable order
    // (null last — a missing location is the least actionable entry).
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        (a[0] === null ? 1 : b[0] === null ? -1 : a[0].localeCompare(b[0])),
    )
    .slice(0, 25)
    .map(([location, count]) => ({ location, count }));

  const report: BackfillLocationReport = {
    scanned,
    updated,
    buckets,
    activeBuckets,
    remoteTotal,
    unknownActivePercent,
    topUnknownLocations,
    batches,
    durationMs: Date.now() - started,
  };

  logger.info(
    {
      backfill: "location",
      dryRun: options.dryRun === true,
      scanned,
      updated,
      activeBuckets,
      unknownActivePercent,
    },
    options.dryRun
      ? `Location backfill (dry run) — ${updated} of ${scanned} rows would change`
      : `Location backfill — ${updated} of ${scanned} rows updated`,
  );

  return report;
}

/**
 * The bucket distribution of what is in the table right now, computed in SQL
 * from the stored columns rather than by re-normalising. This is what the
 * Jobs page filter actually sees; if it ever disagrees with the report from a
 * fresh backfill, the columns are stale and the backfill needs re-running.
 */
export async function locationBucketCountsFromDb(): Promise<{
  active: BucketCounts;
  activeTotal: number;
}> {
  const featured = [...FEATURED_METROS];
  const rows = await db
    .select({
      bucket: sql<string>`
        CASE
          WHEN ${jobsTable.isIndia} = true AND ${jobsTable.locationMetro} IN (${sql.join(
            featured.map((m) => sql`${m}`),
            sql`, `,
          )}) THEN ${jobsTable.locationMetro}
          WHEN ${jobsTable.isIndia} = true THEN 'other_india'
          WHEN ${jobsTable.isIndia} IS NULL AND ${jobsTable.isRemote} = true THEN 'remote'
          WHEN ${jobsTable.isIndia} IS NULL THEN 'unknown'
          ELSE 'abroad'
        END`,
      count: sql<number>`count(*)::int`,
    })
    .from(jobsTable)
    .where(eq(jobsTable.status, "active"))
    .groupBy(sql`1`);

  const active = emptyCounts();
  let activeTotal = 0;
  for (const r of rows) {
    if (r.bucket in active) active[r.bucket as LocationBucket] = r.count;
    activeTotal += r.count;
  }
  return { active, activeTotal };
}
