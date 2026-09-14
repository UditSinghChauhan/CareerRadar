import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/**
 * Phase 5.2 — the boot-sync guard, against real rows.
 *
 * The guard exists to stop a free-tier instance that wakes five times in an
 * afternoon from running five full syncs and burning the Adzuna / JSearch
 * quotas. What it reads is a `provider_sync_logs` query, so the test writes
 * real log rows into real Postgres (PGlite) and reads the decision back.
 * A mocked `db` could only prove a query builder was called.
 */
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { db, providerSyncLogsTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import {
  BOOT_SYNC_MIN_GAP_MS,
  decideBootSync,
  lastSuccessfulSyncAt,
} from "./scheduler";

const NOW = new Date("2026-09-14T12:00:00.000Z");

function minutesBefore(base: Date, minutes: number): Date {
  return new Date(base.getTime() - minutes * 60_000);
}

async function writeLog(entry: {
  status: "success" | "failure" | "skipped";
  startedAt: Date;
  providerName?: string;
  companySlug?: string;
}): Promise<void> {
  await db.insert(providerSyncLogsTable).values({
    providerName: entry.providerName ?? "greenhouse",
    companySlug: entry.companySlug ?? "acme",
    status: entry.status,
    startedAt: entry.startedAt,
    finishedAt: entry.startedAt,
  });
}

describe("boot-sync guard", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
  });

  it("is a two-hour gap", () => {
    expect(BOOT_SYNC_MIN_GAP_MS).toBe(2 * 60 * 60 * 1000);
  });

  it("runs the boot sync when provider_sync_logs is empty", async () => {
    // First boot after a fresh deploy — nothing to skip on.
    const decision = await decideBootSync(NOW);

    expect(decision.run).toBe(true);
    expect(decision.reason).toBe("no-successful-run-recorded");
    expect(decision.lastSuccessAt).toBeNull();
  });

  it("skips the boot sync when the last success was under two hours ago", async () => {
    await writeLog({ status: "success", startedAt: minutesBefore(NOW, 30) });

    const decision = await decideBootSync(NOW);

    expect(decision.run).toBe(false);
    expect(decision.reason).toBe("last-success-is-recent");
    expect(decision.ageMs).toBe(30 * 60_000);
  });

  it("runs the boot sync when the last success was over two hours ago", async () => {
    await writeLog({ status: "success", startedAt: minutesBefore(NOW, 180) });

    const decision = await decideBootSync(NOW);

    expect(decision.run).toBe(true);
    expect(decision.reason).toBe("last-success-is-old");
    expect(decision.ageMs).toBe(180 * 60_000);
  });

  it("treats exactly two hours as old enough to run", async () => {
    // The 6-hour cron cadence must never be suppressed by a boundary case.
    await writeLog({ status: "success", startedAt: minutesBefore(NOW, 120) });

    const decision = await decideBootSync(NOW);

    expect(decision.run).toBe(true);
    expect(decision.reason).toBe("last-success-is-old");
  });

  it("ignores failed and skipped runs when finding the last success", async () => {
    // The whole point is quota protection: a run that failed consumed little
    // and proves nothing, so it must not suppress the next boot sync.
    await writeLog({ status: "success", startedAt: minutesBefore(NOW, 400) });
    await writeLog({ status: "failure", startedAt: minutesBefore(NOW, 10) });
    await writeLog({ status: "skipped", startedAt: minutesBefore(NOW, 5) });

    const decision = await decideBootSync(NOW);

    expect(decision.run).toBe(true);
    expect(decision.reason).toBe("last-success-is-old");
    expect(decision.lastSuccessAt?.toISOString()).toBe(
      minutesBefore(NOW, 400).toISOString(),
    );
  });

  it("picks the most recent success out of many rows", async () => {
    // A real run writes one row per config, so the table has dozens of
    // successes per pass and the guard has to find the newest.
    await writeLog({ status: "success", startedAt: minutesBefore(NOW, 900) });
    await writeLog({ status: "success", startedAt: minutesBefore(NOW, 45) });
    await writeLog({ status: "success", startedAt: minutesBefore(NOW, 600) });

    const decision = await decideBootSync(NOW);

    expect(decision.run).toBe(false);
    expect(decision.lastSuccessAt?.toISOString()).toBe(
      minutesBefore(NOW, 45).toISOString(),
    );
  });

  it("treats a future-stamped success as recent rather than negative-age", async () => {
    // Clock skew between the app instance and Neon. The conservative read of
    // "the last sync is in the future" is that one just happened.
    await writeLog({ status: "success", startedAt: minutesBefore(NOW, -30) });

    const decision = await decideBootSync(NOW);

    expect(decision.run).toBe(false);
    expect(decision.reason).toBe("last-success-is-recent");
  });

  it("honours an injected gap, so the threshold is not hardcoded in the caller", async () => {
    await writeLog({ status: "success", startedAt: minutesBefore(NOW, 30) });

    expect((await decideBootSync(NOW, 10 * 60_000)).run).toBe(true);
    expect((await decideBootSync(NOW, 60 * 60_000)).run).toBe(false);
  });

  it("lastSuccessfulSyncAt returns null on an empty table", async () => {
    expect(await lastSuccessfulSyncAt()).toBeNull();
  });
});
