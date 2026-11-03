import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

// Real Postgres (PGlite): the figures are two COUNTs with a FILTER and a MAX
// over the sync log. Asserting against real rows is what proves the closed,
// draft and non-fresher rows are left out.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import {
  companiesTable,
  db,
  jobsTable,
  providerSyncLogsTable,
} from "@workspace/db";
import { getTestDb, truncateAll } from "../test/pglite";
import publicStatsRouter, {
  PUBLIC_STATS_TTL_MS,
  resetPublicStatsCache,
} from "./public-stats";

let server: Server;
let base: string;
let companyId: string;
let n = 0;

async function job(status: "active" | "closed" | "draft", fresher: boolean) {
  n += 1;
  await db.insert(jobsTable).values({
    companyId,
    title: `Engineer ${n}`,
    jobType: "full_time",
    workMode: "onsite",
    status,
    relevanceScore: 100,
    relevanceTrack: "new_grad",
    isFresherEligible: fresher,
    postedDate: new Date("2026-10-30T00:00:00Z"),
    sourcePlatform: "greenhouse",
    sourceUrl: `https://example.test/job/${n}`,
    applyUrl: "https://example.test/apply",
  });
}

async function activeCount(): Promise<number> {
  const body = (await (await fetch(`${base}/public/stats`)).json()) as {
    activePostings: number;
  };
  return body.activePostings;
}

async function syncLog(status: "success" | "failure", startedAt: string) {
  await db.insert(providerSyncLogsTable).values({
    providerName: "greenhouse",
    companySlug: "acme",
    status,
    jobsFetched: 0,
    jobsInserted: 0,
    jobsUpdated: 0,
    jobsSkipped: 0,
    startedAt: new Date(startedAt),
    finishedAt: new Date(startedAt),
  });
}

beforeAll(async () => {
  const app = express();
  app.use("/api", publicStatsRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => server.close());

beforeEach(async () => {
  await truncateAll(await getTestDb());
  resetPublicStatsCache();
  vi.useRealTimers();
  const [c] = await db
    .insert(companiesTable)
    .values({ name: "Acme", slug: "acme" })
    .returning({ id: companiesTable.id });
  companyId = c!.id;
});

describe("GET /api/public/stats", () => {
  it("counts active postings and the fresher-eligible subset, without a session", async () => {
    await job("active", true);
    await job("active", true);
    await job("active", false);
    await job("closed", true);
    await job("draft", true);
    await syncLog("success", "2026-10-31T06:00:00Z");
    await syncLog("success", "2026-11-01T00:00:00Z");
    await syncLog("failure", "2026-11-01T06:00:00Z");

    const res = await fetch(`${base}/public/stats`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/^public, max-age=\d+$/);
    expect(await res.json()).toEqual({
      activePostings: 3,
      openToFreshers: 2,
      lastSyncedAt: "2026-11-01T00:00:00.000Z",
    });
  });

  it("reports a null sync time when nothing has succeeded", async () => {
    const res = await fetch(`${base}/public/stats`);
    expect(await res.json()).toEqual({
      activePostings: 0,
      openToFreshers: 0,
      lastSyncedAt: null,
    });
  });

  it("serves the cached figures for ten minutes, then reads again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    await job("active", true);
    expect(await activeCount()).toBe(1);

    await job("active", true);
    vi.setSystemTime(new Date(Date.now() + PUBLIC_STATS_TTL_MS - 1000));
    expect(await activeCount()).toBe(1);

    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(await activeCount()).toBe(2);
  });
});
