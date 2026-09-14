import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/**
 * The JSearch frequency gate, against real rows.
 *
 * This gate is the only thing keeping the provider inside a 200-request MONTHLY
 * allowance at a 6-hourly cron cadence. Without it the measured cost is 1,946
 * requests/month and the quota is gone in 3.1 days, taking JSearch offline for
 * the remaining 27. Its input is a provider_sync_logs query, so the test writes
 * real log rows and reads the decision back.
 */
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { db, providerSyncLogsTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import {
  decideMeteredRun,
  intervalHoursFromEnv,
  lastSuccessfulRunOf,
  rotateBy,
} from "./metered-interval";

const NOW = new Date("2026-09-14T12:00:00.000Z");

function hoursBefore(base: Date, hours: number): Date {
  return new Date(base.getTime() - hours * 3_600_000);
}

async function log(entry: {
  providerName: string;
  status: "success" | "failure" | "skipped";
  startedAt: Date;
}): Promise<void> {
  await db.insert(providerSyncLogsTable).values({
    providerName: entry.providerName,
    companySlug: "__test__",
    status: entry.status,
    startedAt: entry.startedAt,
    finishedAt: entry.startedAt,
  });
}

describe("decideMeteredRun — JSearch monthly-quota gate", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
  });

  it("runs when the provider has never run", async () => {
    const d = await decideMeteredRun("jsearch", 24, NOW);
    expect(d.run).toBe(true);
    expect(d.reason).toBe("no-previous-run");
  });

  it("skips when the last successful run was under the interval", async () => {
    await log({
      providerName: "jsearch",
      status: "success",
      startedAt: hoursBefore(NOW, 6),
    });

    const d = await decideMeteredRun("jsearch", 24, NOW);
    expect(d.run).toBe(false);
    expect(d.reason).toBe("too-soon");
    expect(d.hoursSince).toBeCloseTo(6, 5);
  });

  it("runs once the interval has elapsed", async () => {
    await log({
      providerName: "jsearch",
      status: "success",
      startedAt: hoursBefore(NOW, 25),
    });

    const d = await decideMeteredRun("jsearch", 24, NOW);
    expect(d.run).toBe(true);
    expect(d.reason).toBe("interval-elapsed");
  });

  it("runs at exactly the interval boundary", async () => {
    // hoursSince === minIntervalHours is not "too soon". With a 6-hourly cron
    // the tick nearest 24h lands at 24h or 30h, so an exclusive boundary would
    // push the effective cadence out to 30h and waste a sixth of the month's
    // allowance.
    await log({
      providerName: "jsearch",
      status: "success",
      startedAt: hoursBefore(NOW, 24),
    });

    expect((await decideMeteredRun("jsearch", 24, NOW)).run).toBe(true);
  });

  it("ignores failed and skipped runs", async () => {
    // A failed run consumed little quota, so it must not suppress the next one.
    await log({
      providerName: "jsearch",
      status: "success",
      startedAt: hoursBefore(NOW, 40),
    });
    await log({
      providerName: "jsearch",
      status: "failure",
      startedAt: hoursBefore(NOW, 1),
    });

    const d = await decideMeteredRun("jsearch", 24, NOW);
    expect(d.run).toBe(true);
  });

  it("is scoped per provider — adzuna's runs do not gate jsearch", async () => {
    await log({
      providerName: "adzuna",
      status: "success",
      startedAt: hoursBefore(NOW, 1),
    });

    const d = await decideMeteredRun("jsearch", 24, NOW);
    expect(d.run).toBe(true);
    expect(d.reason).toBe("no-previous-run");
  });

  it("treats a future-stamped run as recent", async () => {
    await log({
      providerName: "jsearch",
      status: "success",
      startedAt: hoursBefore(NOW, -5),
    });

    expect((await decideMeteredRun("jsearch", 24, NOW)).run).toBe(false);
  });

  it("a zero interval disables the gate entirely", async () => {
    await log({
      providerName: "jsearch",
      status: "success",
      startedAt: hoursBefore(NOW, 0.1),
    });

    const d = await decideMeteredRun("jsearch", 0, NOW);
    expect(d.run).toBe(true);
    expect(d.reason).toBe("disabled");
  });

  it("lastSuccessfulRunOf returns null when the provider has no rows", async () => {
    expect(await lastSuccessfulRunOf("jsearch")).toBeNull();
  });
});

describe("intervalHoursFromEnv", () => {
  const VAR = "TEST_INTERVAL_VAR";

  beforeEach(() => {
    delete process.env[VAR];
  });

  it("reads a number, including a fractional one", () => {
    process.env[VAR] = "12.5";
    expect(intervalHoursFromEnv(VAR, 24)).toBe(12.5);
  });

  it("honours an explicit zero", () => {
    process.env[VAR] = "0";
    expect(intervalHoursFromEnv(VAR, 24)).toBe(0);
  });

  it("falls back rather than throwing on junk", () => {
    for (const bad of ["", "soon", "-3"]) {
      process.env[VAR] = bad;
      expect(intervalHoursFromEnv(VAR, 24)).toBe(24);
    }
    delete process.env[VAR];
    expect(intervalHoursFromEnv(VAR, 24)).toBe(24);
  });
});

describe("rotateBy — query rotation across runs", () => {
  const QUERIES = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("returns the requested number of items", () => {
    expect(rotateBy(QUERIES, 3, new Date("2026-09-14T00:00:00Z"))).toHaveLength(
      3,
    );
  });

  it("returns a different window on a different day", () => {
    const day1 = rotateBy(QUERIES, 3, new Date("2026-09-14T00:00:00Z"));
    const day2 = rotateBy(QUERIES, 3, new Date("2026-09-15T00:00:00Z"));
    expect(day1).not.toEqual(day2);
  });

  it("is stable within the same day, so retries do not re-roll the window", () => {
    const morning = rotateBy(QUERIES, 3, new Date("2026-09-14T02:00:00Z"));
    const evening = rotateBy(QUERIES, 3, new Date("2026-09-14T22:00:00Z"));
    expect(morning).toEqual(evening);
  });

  it("covers every query within a few days — nothing is starved", () => {
    // The point of rotation is breadth over time. If some query were never
    // selected, its postings would never be fetched at all.
    const seen = new Set<string>();
    for (let day = 0; day < 8; day++) {
      const when = new Date(Date.UTC(2026, 8, 14) + day * 86_400_000);
      for (const q of rotateBy(QUERIES, 3, when)) seen.add(q);
    }
    expect(seen.size).toBe(QUERIES.length);
  });

  it("returns everything when the window is at least the list size", () => {
    expect(rotateBy(QUERIES, 8)).toEqual(QUERIES);
    expect(rotateBy(QUERIES, 99)).toEqual(QUERIES);
  });

  it("handles empty input and non-positive counts", () => {
    expect(rotateBy([], 3)).toEqual([]);
    expect(rotateBy(QUERIES, 0)).toEqual([]);
    expect(rotateBy(QUERIES, -1)).toEqual([]);
  });
});
