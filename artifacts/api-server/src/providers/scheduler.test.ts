import { describe, it, expect, vi, beforeEach } from "vitest";

// scheduler.ts (and its transitive imports normalizer.ts / deduplication.ts) all
// import @workspace/db, whose module throws at import time if DATABASE_URL isn't
// set. Mocking it here means the real DB module never loads for this test file —
// no DATABASE_URL, no network, no Postgres required.
vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    select: vi.fn().mockReturnValue({ from: vi.fn().mockResolvedValue([]) }),
  },
  providerSyncLogsTable: {},
  companiesTable: {},
  jobSourcesTable: {},
  jobsTable: {},
}));

// The scheduler only ever calls jobNormalizer.warmUp() before touching the DB
// further — mocking the whole module lets each test control warmUp() directly
// (reject it to simulate "DB unreachable", exactly like the CR-001 incident).
vi.mock("./normalizer", () => ({
  jobNormalizer: {
    warmUp: vi.fn(),
    normalize: vi.fn(),
  },
}));

import { jobNormalizer } from "./normalizer";
import { SchedulerService } from "./scheduler";

describe("SchedulerService.runAll — CR-001 regression", () => {
  const mockWarmUp = vi.mocked(jobNormalizer.warmUp);

  beforeEach(() => {
    mockWarmUp.mockReset();
  });

  it("does not throw when jobNormalizer.warmUp() rejects (DB unreachable) — returns an empty result instead", async () => {
    const scheduler = new SchedulerService();
    mockWarmUp.mockRejectedValueOnce(new Error("DB unreachable"));

    const result = await scheduler.runAll();

    expect(result.results).toEqual([]);
    expect(result.errors).toBe(0);
    expect(result.totalFetched).toBe(0);
  });

  it("resets isRunning after a warmUp failure, so the next run is not permanently blocked", async () => {
    const scheduler = new SchedulerService();
    mockWarmUp.mockRejectedValueOnce(new Error("DB unreachable"));
    await scheduler.runAll();

    mockWarmUp.mockRejectedValueOnce(new Error("still unreachable"));
    const secondResult = await scheduler.runAll();

    // Called twice = the second run actually attempted warmUp again, proving
    // isRunning was reset to false rather than left stuck true after the failure.
    expect(mockWarmUp).toHaveBeenCalledTimes(2);
    expect(secondResult.results).toEqual([]);
  });

  it("returns an empty result immediately, without a second warmUp call, when a run is already in flight", async () => {
    const scheduler = new SchedulerService();
    let rejectWarmUp!: (err: unknown) => void;
    mockWarmUp.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectWarmUp = reject;
      }),
    );

    // Not awaited: runAll() runs synchronously up to its first `await`, so
    // isRunning is already true by the time this line returns.
    const firstRun = scheduler.runAll();
    const secondRun = await scheduler.runAll();

    expect(secondRun.results).toEqual([]);
    expect(secondRun.errors).toBe(0);
    expect(mockWarmUp).toHaveBeenCalledTimes(1);

    // Let the first run finish so it doesn't leak into another test.
    rejectWarmUp(new Error("DB unreachable"));
    const firstResult = await firstRun;
    expect(firstResult.results).toEqual([]);
  });
});
