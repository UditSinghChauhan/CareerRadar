import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { CreateApplicationBody } from "@workspace/api-zod";

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(),
}));

vi.mock("../services/applications.service", () => ({
  applicationsService: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getStats: vi.fn(),
  },
}));

import { getAuth } from "@clerk/express";
import { applicationsService } from "../services/applications.service";
import applicationsRouter from "./applications";

describe("CreateApplicationBody schema", () => {
  it("rejects a body missing the required jobId field", () => {
    const result = CreateApplicationBody.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a body with only jobId (all other fields optional)", () => {
    const result = CreateApplicationBody.safeParse({ jobId: "job_1" });
    expect(result.success).toBe(true);
  });
});

describe("POST /api/applications", () => {
  let server: Server;
  let baseUrl: string;

  const mockGetAuth = vi.mocked(getAuth);
  const mockCreate = vi.mocked(applicationsService.create);

  beforeAll(async () => {
    const app: Express = express();
    app.use(express.json());
    // Minimal stand-in for the req.log that pino-http normally attaches —
    // the route's generic-500 catch branch calls req.log.error(...).
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { log: { error: () => void } }).log = { error: () => {} };
      next();
    });
    app.use("/api", applicationsRouter);

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
    mockCreate.mockReset();
    mockGetAuth.mockReturnValue({ userId: "user_123" } as unknown as ReturnType<typeof getAuth>);
  });

  it("400s on a body missing jobId, and never calls the service", async () => {
    const res = await fetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid input");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("201s and returns the created application on valid input", async () => {
    const created = { id: "app_1", clerkId: "user_123", jobId: "job_1", status: "saved" };
    mockCreate.mockResolvedValue(created as Awaited<ReturnType<typeof applicationsService.create>>);

    const res = await fetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "job_1" }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith("user_123", expect.objectContaining({ jobId: "job_1" }));
  });

  it("409s when the service reports a duplicate application", async () => {
    mockCreate.mockRejectedValue(new Error("You have already applied to this job"));

    const res = await fetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "job_1" }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(409);
    expect(body.error).toBe("You have already applied to this job");
  });

  it("404s when the service reports the job was not found", async () => {
    mockCreate.mockRejectedValue(new Error('Job "job_missing" not found'));

    const res = await fetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "job_missing" }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(404);
    expect(body.error).toBe('Job "job_missing" not found');
  });

  it("500s with a generic message for any other service error (does not leak the raw error message)", async () => {
    mockCreate.mockRejectedValue(new Error("connection terminated unexpectedly"));

    const res = await fetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "job_1" }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to create application");
  });
});
