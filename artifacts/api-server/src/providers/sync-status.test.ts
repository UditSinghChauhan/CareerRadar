import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

// Real Postgres (PGlite). The point of this module is a pair of aggregate
// queries with FILTER clauses and a DISTINCT ON — none of which a mocked `db`
// can get wrong, and all of which real Postgres can. Asserting against actual
// rows is the only way the "which provider stopped" answer is worth reading.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

// The registry and the config table are the app's real ones and would make
// every assertion here depend on which companies happen to be configured this
// month. Two providers is enough to prove every branch.
vi.mock("./registry", () => ({
  providerRegistry: {
    list: () => [
      { name: "greenhouse", displayName: "Greenhouse", hasPublicApi: true },
      { name: "adzuna", displayName: "Adzuna", hasPublicApi: true },
      { name: "unstop", displayName: "Unstop", hasPublicApi: false },
    ],
  },
}));

const enabledConfigs = vi.fn();
vi.mock("./config", () => ({ getEnabledConfigs: () => enabledConfigs() }));

import { db, providerSyncLogsTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import {
  classifyProvider,
  getSyncStatus,
  STALE_INTERVAL_MULTIPLIER,
} from "./sync-status";
import { schedulerService } from "./scheduler";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function ago(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR);
}

async function log(entry: {
  provider: string;
  status: "success" | "failure" | "skipped";
  startedAt: Date;
  inserted?: number;
  updated?: number;
  error?: string;
}) {
  await db.insert(providerSyncLogsTable).values({
    providerName: entry.provider,
    companySlug: "acme",
    status: entry.status,
    jobsFetched: 0,
    jobsInserted: entry.inserted ?? 0,
    jobsUpdated: entry.updated ?? 0,
    jobsSkipped: 0,
    errorMessage: entry.error,
    startedAt: entry.startedAt,
    finishedAt: entry.startedAt,
  });
}

function find(status: Awaited<ReturnType<typeof getSyncStatus>>, name: string) {
  const row = status.providers.find((p) => p.name === name);
  if (!row) throw new Error(`no provider row for ${name}`);
  return row;
}

describe("classifyProvider", () => {
  const staleAfterMs = 12 * HOUR;

  it("is disabled when no enabled config points at it — the ToS no-op stubs must not read as broken", () => {
    expect(
      classifyProvider({
        configuredCompanies: 0,
        aggregate: undefined,
        staleAfterMs,
        now: NOW,
      }),
    ).toBe("disabled");
  });

  it("is never_run — not failing — when it is configured but has no log rows", () => {
    expect(
      classifyProvider({
        configuredCompanies: 3,
        aggregate: undefined,
        staleAfterMs,
        now: NOW,
      }),
    ).toBe("never_run");
  });

  it("is failing when the newest run failed and nothing succeeded after it", () => {
    expect(
      classifyProvider({
        configuredCompanies: 1,
        aggregate: {
          lastRunAt: ago(1),
          lastSuccessAt: ago(5),
          runs24h: 2,
          failures24h: 1,
          jobsInserted24h: 0,
          jobsUpdated24h: 0,
        },
        staleAfterMs,
        now: NOW,
      }),
    ).toBe("failing");
  });

  it("is ok — not failing — when a success followed the failure", () => {
    expect(
      classifyProvider({
        configuredCompanies: 1,
        aggregate: {
          lastRunAt: ago(1),
          lastSuccessAt: ago(1),
          runs24h: 2,
          failures24h: 1,
          jobsInserted24h: 0,
          jobsUpdated24h: 0,
        },
        staleAfterMs,
        now: NOW,
      }),
    ).toBe("ok");
  });

  it("is stale once the last success is older than the window, not merely older than one interval", () => {
    const base = {
      configuredCompanies: 1,
      staleAfterMs,
      now: NOW,
      runs24h: 1,
      failures24h: 0,
    };
    const at = (hours: number) =>
      classifyProvider({
        configuredCompanies: base.configuredCompanies,
        staleAfterMs,
        now: NOW,
        aggregate: {
          lastRunAt: ago(hours),
          lastSuccessAt: ago(hours),
          runs24h: 1,
          failures24h: 0,
          jobsInserted24h: 0,
          jobsUpdated24h: 0,
        },
      });

    // One missed six-hourly firing is ordinary; two is not.
    expect(at(7)).toBe("ok");
    expect(at(11.9)).toBe("ok");
    expect(at(13)).toBe("stale");
  });
});

describe("getSyncStatus", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    enabledConfigs.mockReturnValue([
      { providerName: "greenhouse", companySlug: "acme" },
      { providerName: "greenhouse", companySlug: "beta" },
      { providerName: "adzuna", companySlug: "adzuna-in" },
    ]);
    // A 6-hour interval, so the staleness window is 12 hours.
    vi.stubEnv("PROVIDER_INTERVAL_MS", String(6 * HOUR));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("reports the newest successful run across all providers as lastSyncAt", async () => {
    await log({ provider: "greenhouse", status: "success", startedAt: ago(3) });
    await log({ provider: "adzuna", status: "success", startedAt: ago(1) });

    const status = await getSyncStatus(NOW);

    expect(status.status).toBe("ok");
    expect(status.lastSyncAt).toBe(ago(1).toISOString());
    expect(status.lastSyncAgeSeconds).toBe(3600);
    expect(status.fresh).toBe(true);
    expect(status.staleAfterSeconds).toBe(
      (6 * HOUR * STALE_INTERVAL_MULTIPLIER) / 1000,
    );
  });

  it("lastRunAt counts a failure; lastSyncAt does not", async () => {
    await log({ provider: "greenhouse", status: "success", startedAt: ago(4) });
    await log({
      provider: "adzuna",
      status: "failure",
      startedAt: ago(1),
      error: "429 Too Many Requests",
    });

    const status = await getSyncStatus(NOW);

    expect(status.lastRunAt).toBe(ago(1).toISOString());
    expect(status.lastSyncAt).toBe(ago(4).toISOString());
  });

  it("surfaces the newest failure message for a failing provider, and only for one", async () => {
    await log({
      provider: "adzuna",
      status: "failure",
      startedAt: ago(9),
      error: "older failure",
    });
    await log({
      provider: "adzuna",
      status: "failure",
      startedAt: ago(1),
      error: "newest failure",
    });
    // Greenhouse failed too, but recovered — its old error is not news.
    await log({
      provider: "greenhouse",
      status: "failure",
      startedAt: ago(5),
      error: "transient greenhouse 500",
    });
    await log({ provider: "greenhouse", status: "success", startedAt: ago(2) });

    const status = await getSyncStatus(NOW);

    expect(find(status, "adzuna").state).toBe("failing");
    expect(find(status, "adzuna").lastError).toBe("newest failure");
    expect(find(status, "greenhouse").state).toBe("ok");
    expect(find(status, "greenhouse").lastError).toBeNull();
  });

  it("counts runs, failures and rows only inside the 24-hour window", async () => {
    await log({
      provider: "greenhouse",
      status: "success",
      startedAt: ago(2),
      inserted: 7,
      updated: 3,
    });
    await log({
      provider: "greenhouse",
      status: "failure",
      startedAt: ago(20),
      inserted: 0,
    });
    // 30 hours ago — outside the window, so its 999 rows must not be counted.
    await log({
      provider: "greenhouse",
      status: "success",
      startedAt: ago(30),
      inserted: 999,
      updated: 999,
    });

    const gh = find(await getSyncStatus(NOW), "greenhouse");

    expect(gh.runs24h).toBe(2);
    expect(gh.failures24h).toBe(1);
    expect(gh.jobsInserted24h).toBe(7);
    expect(gh.jobsUpdated24h).toBe(3);
    // Timestamps are all-time, deliberately — the window is for the counters.
    expect(gh.lastSuccessAt).toBe(ago(2).toISOString());
  });

  it("lists every registered provider, including one with no log rows at all", async () => {
    await log({ provider: "greenhouse", status: "success", startedAt: ago(1) });

    const status = await getSyncStatus(NOW);

    expect(status.providers.map((p) => p.name)).toEqual([
      "adzuna",
      "greenhouse",
      "unstop",
    ]);
    expect(find(status, "adzuna").state).toBe("never_run");
    // No enabled config points at unstop — that is the ToS stub, not a fault.
    expect(find(status, "unstop").state).toBe("disabled");
    expect(find(status, "greenhouse").configuredCompanies).toBe(2);
  });

  it("nothing has ever synced → nulls and fresh:false, not a throw", async () => {
    const status = await getSyncStatus(NOW);

    expect(status.status).toBe("ok");
    expect(status.lastSyncAt).toBeNull();
    expect(status.lastSyncAgeSeconds).toBeNull();
    expect(status.fresh).toBe(false);
  });

  it("an unreachable database is 'unchecked' with the reason — never a throw", async () => {
    const boom = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    const spy = vi.spyOn(db, "select").mockImplementation(() => {
      throw boom;
    });
    const distinct = vi.spyOn(db, "selectDistinctOn").mockImplementation(() => {
      throw boom;
    });

    try {
      const status = await getSyncStatus(NOW);
      expect(status.status).toBe("unchecked");
      expect(status.providers).toEqual([]);
      expect(status.error).toContain("ECONNREFUSED");
      // The scheduler block comes from memory, so it still answers.
      expect(status.scheduler.intervalMs).toBe(6 * HOUR);
    } finally {
      spy.mockRestore();
      distinct.mockRestore();
    }
  });

  it("reports the in-process scheduler separately from the durable log", async () => {
    await log({ provider: "greenhouse", status: "success", startedAt: ago(1) });

    const status = await getSyncStatus(NOW);

    // A freshly booted process has run nothing, which is the normal state on a
    // free instance that just woke up — and says nothing about lastSyncAt.
    expect(status.scheduler.runsThisProcess).toBe(0);
    expect(status.scheduler.lastRunAt).toBeNull();
    expect(status.scheduler.enabled).toBe(schedulerService.enabled);
    expect(status.lastSyncAt).not.toBeNull();
  });
});
