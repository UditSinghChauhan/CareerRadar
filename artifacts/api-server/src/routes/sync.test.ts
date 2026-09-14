import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(),
}));

vi.mock("../providers/scheduler", () => ({
  schedulerService: {
    runAll: vi.fn(),
    runOne: vi.fn(),
  },
}));

vi.mock("../providers/verify", () => ({
  runVerification: vi.fn(),
}));

// The status route is the only one that touches the database, and it stays
// public. Mocking the db module keeps the suite free of a live connection.
vi.mock("@workspace/db", () => ({
  db: { select: vi.fn() },
  providerSyncLogsTable: {},
}));

import { getAuth } from "@clerk/express";
import { schedulerService } from "../providers/scheduler";
import { runVerification } from "../providers/verify";
import syncRouter from "./sync";

describe("sync routes — CR-NEW-001 auth gate on work-triggering endpoints", () => {
  let server: Server;
  let baseUrl: string;

  const mockGetAuth = vi.mocked(getAuth);
  const mockRunAll = vi.mocked(schedulerService.runAll);
  const mockRunOne = vi.mocked(schedulerService.runOne);
  const mockRunVerification = vi.mocked(runVerification);

  beforeAll(async () => {
    const app: Express = express();
    app.use(express.json());
    // pino-http is mounted app-wide in app.ts and is what puts `req.log` on the
    // request. This suite builds a bare router harness, so it supplies the same
    // shape rather than pulling the real logger in and spamming test output.
    app.use((req, _res, next) => {
      (req as unknown as { log: unknown }).log = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      next();
    });
    app.use("/api", syncRouter);

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
    mockGetAuth.mockReset();
    mockRunAll.mockReset();
    mockRunOne.mockReset();
    mockRunVerification.mockReset();
  });

  function unauthed() {
    mockGetAuth.mockReturnValue({ userId: undefined } as unknown as ReturnType<
      typeof getAuth
    >);
  }

  function authed() {
    mockGetAuth.mockReturnValue({ userId: "user_123" } as unknown as ReturnType<
      typeof getAuth
    >);
  }

  it("POST /api/sync/all — 401 without auth, and the scheduler is never triggered", async () => {
    unauthed();

    const res = await fetch(`${baseUrl}/api/sync/all`, { method: "POST" });

    expect(res.status).toBe(401);
    expect(mockRunAll).not.toHaveBeenCalled();
  });

  it("POST /api/sync/provider/:provider — 401 without auth, and no run is triggered", async () => {
    unauthed();

    const res = await fetch(`${baseUrl}/api/sync/provider/greenhouse`, {
      method: "POST",
    });

    expect(res.status).toBe(401);
    expect(mockRunOne).not.toHaveBeenCalled();
  });

  it("POST /api/sync/provider/:provider/company/:company — 401 without auth", async () => {
    unauthed();

    const res = await fetch(
      `${baseUrl}/api/sync/provider/greenhouse/company/postman`,
      {
        method: "POST",
      },
    );

    expect(res.status).toBe(401);
    expect(mockRunOne).not.toHaveBeenCalled();
  });

  it("GET /api/sync/verify — 401 without auth, and no outbound ATS requests are made", async () => {
    unauthed();

    const res = await fetch(`${baseUrl}/api/sync/verify`);

    expect(res.status).toBe(401);
    expect(mockRunVerification).not.toHaveBeenCalled();
  });

  it("POST /api/sync/provider/:provider — 404 for an unregistered provider when authenticated", async () => {
    authed();

    const res = await fetch(
      `${baseUrl}/api/sync/provider/definitely-not-a-real-provider`,
      {
        method: "POST",
      },
    );

    expect(res.status).toBe(404);
    expect(mockRunOne).not.toHaveBeenCalled();
  });

  it("POST /api/sync/provider/:provider/company/:company — 404 for an unregistered provider", async () => {
    authed();

    const res = await fetch(
      `${baseUrl}/api/sync/provider/definitely-not-a-real-provider/company/x`,
      { method: "POST" },
    );

    expect(res.status).toBe(404);
    expect(mockRunOne).not.toHaveBeenCalled();
  });

  it("GET /api/sync/verify — reaches the verifier once authenticated", async () => {
    authed();
    mockRunVerification.mockResolvedValue({
      results: [],
      summary: {
        working: [],
        empty: [],
        broken: [],
        authRequired: [],
        noPublicApi: [],
      },
    } as unknown as Awaited<ReturnType<typeof runVerification>>);

    const res = await fetch(`${baseUrl}/api/sync/verify`);

    expect(res.status).toBe(200);
    expect(mockRunVerification).toHaveBeenCalledTimes(1);
  });
});

/**
 * Phase 5.1 — POST /api/sync/cron.
 *
 * This is the one route that bypasses Clerk on purpose, so its gate is the only
 * thing standing between the public internet and a full provider sync. Every
 * case below asserts both halves: the status code the caller sees, AND whether
 * schedulerService.runAll was reached.
 */
describe("POST /api/sync/cron — Phase 5.1 machine-to-machine trigger", () => {
  let server: Server;
  let baseUrl: string;

  const mockGetAuth = vi.mocked(getAuth);
  const mockRunAll = vi.mocked(schedulerService.runAll);

  const SECRET = "test-cron-secret-value";
  let previousSecret: string | undefined;

  beforeAll(async () => {
    const app: Express = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { log: unknown }).log = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      next();
    });
    app.use("/api", syncRouter);

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
    previousSecret = process.env["SYNC_CRON_SECRET"];
    mockGetAuth.mockReset();
    mockRunAll.mockReset();
    mockRunAll.mockResolvedValue(
      {} as unknown as Awaited<ReturnType<typeof schedulerService.runAll>>,
    );
    // No Clerk session on any of these calls — a CI runner has none. If the
    // route ever started consulting Clerk, these tests would fail.
    mockGetAuth.mockReturnValue({ userId: undefined } as unknown as ReturnType<
      typeof getAuth
    >);
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env["SYNC_CRON_SECRET"];
    else process.env["SYNC_CRON_SECRET"] = previousSecret;
  });

  function post(headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/sync/cron`, { method: "POST", headers });
  }

  it("401s when SYNC_CRON_SECRET is unset, even with a header supplied", async () => {
    delete process.env["SYNC_CRON_SECRET"];

    const res = await post({ "x-cron-secret": "anything-at-all" });

    expect(res.status).toBe(401);
    expect(mockRunAll).not.toHaveBeenCalled();
  });

  it("401s when the header is missing", async () => {
    process.env["SYNC_CRON_SECRET"] = SECRET;

    const res = await post();

    expect(res.status).toBe(401);
    expect(mockRunAll).not.toHaveBeenCalled();
  });

  it("401s on a wrong secret", async () => {
    process.env["SYNC_CRON_SECRET"] = SECRET;

    const res = await post({ "x-cron-secret": "wrong-secret-value" });

    expect(res.status).toBe(401);
    expect(mockRunAll).not.toHaveBeenCalled();
  });

  it("does not reveal why it rejected", async () => {
    // "secret not configured" vs "secret wrong" is useful to an attacker and to
    // nobody else. The reason goes to the server log, not the response body.
    process.env["SYNC_CRON_SECRET"] = SECRET;
    const wrong = await (await post({ "x-cron-secret": "nope" })).json();

    delete process.env["SYNC_CRON_SECRET"];
    const unset = await (await post({ "x-cron-secret": "nope" })).json();

    expect(wrong).toEqual(unset);
  });

  it("202s on the correct secret and triggers the sync", async () => {
    process.env["SYNC_CRON_SECRET"] = SECRET;

    const res = await post({ "x-cron-secret": SECRET });

    expect(res.status).toBe(202);
    expect(mockRunAll).toHaveBeenCalledTimes(1);
  });

  it("returns 202 without waiting for the sync to finish", async () => {
    // The acceptance criterion that matters operationally: a full sync across
    // every config takes minutes, and the workflow's curl has a 120s timeout.
    // If the route ever awaited runAll, this test would time out.
    process.env["SYNC_CRON_SECRET"] = SECRET;

    let releaseSync: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    mockRunAll.mockReturnValue(
      blocked as unknown as ReturnType<typeof schedulerService.runAll>,
    );

    const res = await post({ "x-cron-secret": SECRET });

    // Responded while runAll is still pending.
    expect(res.status).toBe(202);
    await res.json();
    expect(mockRunAll).toHaveBeenCalledTimes(1);

    releaseSync();
    await blocked;
  });

  it("survives a rejected background sync without crashing the process", async () => {
    // void + .catch in the route. An unhandled rejection here would take the
    // whole server down on a free-tier instance with no supervisor to restart it.
    process.env["SYNC_CRON_SECRET"] = SECRET;
    mockRunAll.mockRejectedValue(new Error("provider exploded"));

    const res = await post({ "x-cron-secret": SECRET });

    expect(res.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});
