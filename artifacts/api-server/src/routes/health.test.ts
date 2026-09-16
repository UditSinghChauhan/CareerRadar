import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";
import { AddressInfo } from "net";

// The drift check itself is proved against real Postgres in
// lib/schema-check.test.ts. Here it is a switch, so the routes can be shown to
// answer 200 / 200-unchecked / 503 for each of its three outcomes without a
// database in the loop.
const schemaStatus = vi.fn();
vi.mock("../lib/schema-check", () => ({
  currentSchemaStatus: () => schemaStatus(),
}));

// The sync detail is proved against real Postgres in
// providers/sync-status.test.ts. Here it only has to be observable, so the
// routes can be shown to include it exactly when asked and never otherwise.
const syncStatus = vi.fn();
vi.mock("../providers/sync-status", () => ({
  getSyncStatus: () => syncStatus(),
}));

import healthRouter, { healthHandler, wantsDetail } from "./health";

const OK = { status: "ok", checkedAt: "2026-09-15T00:00:00.000Z", drift: [] };
const UNCHECKED = {
  status: "unchecked",
  checkedAt: null,
  drift: [],
  error: "connect ECONNREFUSED",
};
const DRIFT = {
  status: "drift",
  checkedAt: "2026-09-15T00:00:00.000Z",
  drift: [
    {
      table: "jobs",
      missingColumns: ["location_city", "is_india"],
      missingTable: false,
    },
  ],
  hint: 'SCHEMA DRIFT: "jobs" is missing "location_city", "is_india". Apply the newest file in lib/db/sql/ …',
};

const SYNC = {
  status: "ok",
  lastSyncAt: "2026-09-16T06:00:00.000Z",
  lastRunAt: "2026-09-16T06:00:00.000Z",
  lastSyncAgeSeconds: 3600,
  fresh: true,
  staleAfterSeconds: 43200,
  scheduler: {
    enabled: true,
    intervalMs: 21600000,
    running: false,
    runsThisProcess: 0,
    lastRunAt: null,
    nextRunAt: null,
  },
  providers: [
    {
      name: "greenhouse",
      displayName: "Greenhouse",
      state: "ok",
      configuredCompanies: 2,
      lastRunAt: "2026-09-16T06:00:00.000Z",
      lastSuccessAt: "2026-09-16T06:00:00.000Z",
      runs24h: 8,
      failures24h: 0,
      jobsInserted24h: 12,
      jobsUpdated24h: 4,
      lastError: null,
    },
  ],
};

describe("wantsDetail", () => {
  it("is on for 1, true and a bare ?detail", () => {
    expect(wantsDetail("1")).toBe(true);
    expect(wantsDetail("true")).toBe(true);
    expect(wantsDetail("")).toBe(true);
  });

  it("is off for absent, 0, false and anything else — a config flag passed through cannot turn it on by accident", () => {
    expect(wantsDetail(undefined)).toBe(false);
    expect(wantsDetail("0")).toBe(false);
    expect(wantsDetail("false")).toBe(false);
    expect(wantsDetail("yes")).toBe(false);
  });

  it("reads the first value when the param is repeated", () => {
    expect(wantsDetail(["1", "0"])).toBe(true);
    expect(wantsDetail(["0", "1"])).toBe(false);
  });
});

describe("health routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app: Express = express();
    app.get("/api/health", healthHandler);
    app.use("/api", healthRouter);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    schemaStatus.mockReset();
    syncStatus.mockReset();
    syncStatus.mockResolvedValue(SYNC);
  });

  it("GET /api/healthz → 200 with the Zod-validated shape when the schema matches", async () => {
    schemaStatus.mockResolvedValue(OK);
    const res = await fetch(`${baseUrl}/api/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", schema: "ok" });
  });

  it("GET /api/health keeps its pre-existing body, plus `schema`", async () => {
    schemaStatus.mockResolvedValue(OK);
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      status: "running",
      schema: "ok",
    });
  });

  it("an unreachable database is 200 + unchecked, never a 503 — health must not flap on a Neon blip", async () => {
    schemaStatus.mockResolvedValue(UNCHECKED);
    const res = await fetch(`${baseUrl}/api/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", schema: "unchecked" });
  });

  it("the default body carries no sync object, and does not read the sync log at all", async () => {
    schemaStatus.mockResolvedValue(OK);

    for (const path of ["/api/health", "/api/healthz"]) {
      const res = await fetch(`${baseUrl}${path}`);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body, path).not.toHaveProperty("sync");
    }
    // The wake step and Render's deploy check both hit a cold instance; the
    // two aggregate queries must not be on their path.
    expect(syncStatus).not.toHaveBeenCalled();
  });

  it("?detail=1 adds the sync object on both routes, leaving the rest of the body intact", async () => {
    schemaStatus.mockResolvedValue(OK);

    const health = await (await fetch(`${baseUrl}/api/health?detail=1`)).json();
    expect(health).toEqual({
      ok: true,
      status: "running",
      schema: "ok",
      sync: SYNC,
    });

    const healthz = await (
      await fetch(`${baseUrl}/api/healthz?detail=1`)
    ).json();
    expect(healthz).toEqual({ status: "ok", schema: "ok", sync: SYNC });
  });

  it("?detail=1 still answers 200 when the sync log itself is unreadable", async () => {
    schemaStatus.mockResolvedValue(UNCHECKED);
    syncStatus.mockResolvedValue({
      ...SYNC,
      status: "unchecked",
      lastSyncAt: null,
      lastSyncAgeSeconds: null,
      fresh: false,
      providers: [],
      error: "connect ECONNREFUSED",
    });

    const res = await fetch(`${baseUrl}/api/healthz?detail=1`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sync: { status: string } };
    expect(body.sync.status).toBe("unchecked");
  });

  it("schema drift → 503 on both routes, naming the columns and the fix", async () => {
    schemaStatus.mockResolvedValue(DRIFT);

    for (const path of ["/api/health", "/api/healthz"]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(503);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.status).toBe("schema_drift");
      expect(body.ok).toBe(false);
      expect(body.drift).toEqual(DRIFT.drift);
      expect(body.hint).toContain(
        '"jobs" is missing "location_city", "is_india"',
      );
    }
  });

  it("drift wins over ?detail=1 — the sync log is not queried against a schema the code disagrees with", async () => {
    schemaStatus.mockResolvedValue(DRIFT);

    const res = await fetch(`${baseUrl}/api/health?detail=1`);
    expect(res.status).toBe(503);
    expect(await res.json()).not.toHaveProperty("sync");
    expect(syncStatus).not.toHaveBeenCalled();
  });
});
