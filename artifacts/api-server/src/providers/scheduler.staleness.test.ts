import { describe, it, expect, vi, beforeEach } from "vitest";

// This suite is about WIRING: does runAll call the sweep, and with what. The
// sweep's own behaviour is proved against real rows in staleness.test.ts, so
// mocking it here is deliberate rather than a shortcut — what needs checking is
// that a provider error never reaches the sweep at all, and that an empty fetch
// reaches it carrying the zero that disarms it.
vi.mock("@workspace/db", () => ({
  db: {
    insert: vi
      .fn()
      .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  },
  providerSyncLogsTable: {},
  companiesTable: {},
  jobSourcesTable: {},
  jobsTable: {},
}));

vi.mock("./normalizer", () => ({
  jobNormalizer: {
    warmUp: vi.fn().mockResolvedValue(undefined),
    normalize: vi.fn(),
  },
}));

vi.mock("./deduplication", () => ({
  deduplicationService: { upsertBatch: vi.fn() },
}));

vi.mock("./staleness", () => ({
  closeUnseenJobs: vi.fn(),
  closeStaleAggregatorJobs: vi.fn(),
  closeExpiredDeadlineJobs: vi.fn(),
  getMaxAgeDays: vi.fn().mockReturnValue(45),
}));

vi.mock("./config", () => ({ getEnabledConfigs: vi.fn() }));

vi.mock("./registry", () => ({
  providerRegistry: { get: vi.fn() },
}));

import { jobNormalizer } from "./normalizer";
import { deduplicationService } from "./deduplication";
import {
  closeExpiredDeadlineJobs,
  closeStaleAggregatorJobs,
  closeUnseenJobs,
} from "./staleness";
import { getEnabledConfigs } from "./config";
import { providerRegistry } from "./registry";
import { SchedulerService } from "./scheduler";

const CONFIG = {
  companySlug: "acme",
  providerName: "greenhouse",
  providerId: "acme",
};

const noSweep = { closed: 0, closedIds: [], skipped: null };

function providerReturning(jobs: unknown[]) {
  return { fetchJobs: vi.fn().mockResolvedValue(jobs) };
}

describe("scheduler — staleness sweep wiring", () => {
  const mockConfigs = vi.mocked(getEnabledConfigs);
  const mockGet = vi.mocked(providerRegistry.get);
  const mockNormalize = vi.mocked(jobNormalizer.normalize);
  const mockUpsert = vi.mocked(deduplicationService.upsertBatch);
  const mockCloseUnseen = vi.mocked(closeUnseenJobs);
  const mockCloseAggregator = vi.mocked(closeStaleAggregatorJobs);
  const mockCloseDeadline = vi.mocked(closeExpiredDeadlineJobs);

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigs.mockReturnValue([CONFIG]);
    mockCloseUnseen.mockResolvedValue(noSweep);
    mockCloseAggregator.mockResolvedValue(noSweep);
    mockCloseDeadline.mockResolvedValue(noSweep);
    vi.mocked(jobNormalizer.warmUp).mockResolvedValue(undefined);
  });

  it("never reaches the sweep when the provider throws", async () => {
    mockGet.mockReturnValue({
      fetchJobs: vi.fn().mockRejectedValue(new Error("upstream 503")),
    } as never);

    const result = await new SchedulerService().runAll();

    expect(result.errors).toBe(1);
    expect(mockCloseUnseen).not.toHaveBeenCalled();
    expect(result.totalClosed).toBe(0);
  });

  it("passes a zero fetch count to the sweep when the provider returns an empty array", async () => {
    mockGet.mockReturnValue(providerReturning([]) as never);
    mockUpsert.mockResolvedValue([]);

    await new SchedulerService().runAll();

    expect(mockCloseUnseen).toHaveBeenCalledTimes(1);
    expect(mockCloseUnseen.mock.calls[0][0]).toMatchObject({
      sourcePlatform: "greenhouse",
      companySlug: "acme",
      fetchedCount: 0,
      persistedCount: 0,
    });
  });

  it("hands the sweep the real counts and the run's own start time on a healthy fetch", async () => {
    mockGet.mockReturnValue(providerReturning([{ a: 1 }, { a: 2 }]) as never);
    mockNormalize.mockImplementation(
      async () =>
        ({
          companyId: "company-1",
        }) as never,
    );
    mockUpsert.mockResolvedValue([
      { action: "insert", id: "j1" },
      { action: "skip", id: "j2" },
    ]);

    await new SchedulerService().runAll();

    const args = mockCloseUnseen.mock.calls[0][0];
    expect(args).toMatchObject({
      sourcePlatform: "greenhouse",
      companyIds: ["company-1", "company-1"],
      fetchedCount: 2,
      persistedCount: 2,
    });

    // The instant stamped onto the rows and the instant the sweep compares
    // against must be the same object, or a row saved during this run could be
    // read as stale by the sweep that follows it.
    expect(mockUpsert.mock.calls[0][1]).toEqual({ seenAt: args.runStartedAt });
  });

  it("runs both global sweeps once per run and counts what they closed", async () => {
    mockGet.mockReturnValue(providerReturning([]) as never);
    mockUpsert.mockResolvedValue([]);
    mockCloseAggregator.mockResolvedValue({
      closed: 7,
      closedIds: [],
      skipped: null,
    });
    mockCloseDeadline.mockResolvedValue({
      closed: 3,
      closedIds: [],
      skipped: null,
    });

    const result = await new SchedulerService().runAll();

    expect(mockCloseAggregator).toHaveBeenCalledTimes(1);
    expect(mockCloseDeadline).toHaveBeenCalledTimes(1);
    expect(result.totalClosed).toBe(10);
  });

  it("survives a global sweep that throws, without losing the ingestion result", async () => {
    mockGet.mockReturnValue(providerReturning([{ a: 1 }]) as never);
    mockNormalize.mockImplementation(
      async () =>
        ({
          companyId: "company-1",
        }) as never,
    );
    mockUpsert.mockResolvedValue([{ action: "insert", id: "j1" }]);
    mockCloseAggregator.mockRejectedValue(new Error("statement timeout"));
    mockCloseDeadline.mockResolvedValue({
      closed: 2,
      closedIds: [],
      skipped: null,
    });

    const result = await new SchedulerService().runAll();

    expect(result.totalInserted).toBe(1);
    expect(result.totalClosed).toBe(2);
    expect(result.errors).toBe(0);
  });
});
