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

import { getAuth } from "@clerk/express";
import { schedulerService } from "../providers/scheduler";
import providersRouter from "./providers";

describe("providers routes — CR-002 auth gate on POST endpoints", () => {
  let server: Server;
  let baseUrl: string;

  const mockGetAuth = vi.mocked(getAuth);
  const mockRunAll = vi.mocked(schedulerService.runAll);
  const mockRunOne = vi.mocked(schedulerService.runOne);

  beforeAll(async () => {
    const app: Express = express();
    app.use(express.json());
    app.use("/api", providersRouter);

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
  });

  function authed() {
    mockGetAuth.mockReturnValue({ userId: "user_123" } as unknown as ReturnType<typeof getAuth>);
  }

  function unauthed() {
    mockGetAuth.mockReturnValue({ userId: undefined } as unknown as ReturnType<typeof getAuth>);
  }

  it("POST /api/providers/run — 401 without auth, and the scheduler is never triggered", async () => {
    unauthed();
    mockRunAll.mockResolvedValue({} as Awaited<ReturnType<typeof schedulerService.runAll>>);

    const res = await fetch(`${baseUrl}/api/providers/run`, { method: "POST" });

    expect(res.status).toBe(401);
    expect(mockRunAll).not.toHaveBeenCalled();
  });

  it("POST /api/providers/run — 200 when authenticated, and triggers the scheduler", async () => {
    authed();
    mockRunAll.mockResolvedValue({} as Awaited<ReturnType<typeof schedulerService.runAll>>);

    const res = await fetch(`${baseUrl}/api/providers/run`, { method: "POST" });
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(200);
    expect(body.message).toBe("Scheduler run started");
    expect(mockRunAll).toHaveBeenCalledTimes(1);
  });

  it("POST /api/providers/:name/run — 401 without auth, and no single-provider run is triggered", async () => {
    unauthed();

    const res = await fetch(`${baseUrl}/api/providers/greenhouse/run?company=postman`, {
      method: "POST",
    });

    expect(res.status).toBe(401);
    expect(mockRunOne).not.toHaveBeenCalled();
  });

  it("POST /api/providers/:name/run — 400 when authenticated but ?company is missing", async () => {
    authed();

    const res = await fetch(`${baseUrl}/api/providers/greenhouse/run`, { method: "POST" });

    expect(res.status).toBe(400);
    expect(mockRunOne).not.toHaveBeenCalled();
  });

  it("POST /api/providers/:name/run — 404 for an unregistered provider name", async () => {
    authed();

    const res = await fetch(
      `${baseUrl}/api/providers/definitely-not-a-real-provider/run?company=x`,
      { method: "POST" },
    );

    expect(res.status).toBe(404);
    expect(mockRunOne).not.toHaveBeenCalled();
  });
});
