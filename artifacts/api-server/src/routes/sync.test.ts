import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
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
    mockGetAuth.mockReturnValue({ userId: undefined } as unknown as ReturnType<typeof getAuth>);
  }

  function authed() {
    mockGetAuth.mockReturnValue({ userId: "user_123" } as unknown as ReturnType<typeof getAuth>);
  }

  it("POST /api/sync/all — 401 without auth, and the scheduler is never triggered", async () => {
    unauthed();

    const res = await fetch(`${baseUrl}/api/sync/all`, { method: "POST" });

    expect(res.status).toBe(401);
    expect(mockRunAll).not.toHaveBeenCalled();
  });

  it("POST /api/sync/provider/:provider — 401 without auth, and no run is triggered", async () => {
    unauthed();

    const res = await fetch(`${baseUrl}/api/sync/provider/greenhouse`, { method: "POST" });

    expect(res.status).toBe(401);
    expect(mockRunOne).not.toHaveBeenCalled();
  });

  it("POST /api/sync/provider/:provider/company/:company — 401 without auth", async () => {
    unauthed();

    const res = await fetch(`${baseUrl}/api/sync/provider/greenhouse/company/postman`, {
      method: "POST",
    });

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

    const res = await fetch(`${baseUrl}/api/sync/provider/definitely-not-a-real-provider`, {
      method: "POST",
    });

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
