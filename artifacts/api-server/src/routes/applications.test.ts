import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
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
    getStatusMap: vi.fn(),
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

  it("coerces an ISO appliedDate into a Date", () => {
    const iso = "2026-09-13T10:00:00.000Z";
    const result = CreateApplicationBody.safeParse({
      jobId: "job_1",
      status: "applied",
      appliedDate: iso,
    });

    expect(result.success).toBe(true);
    expect(result.data?.appliedDate).toBeInstanceOf(Date);
    expect((result.data?.appliedDate as Date).toISOString()).toBe(iso);
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
      (req as unknown as { log: { error: () => void } }).log = {
        error: () => {},
      };
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
    mockGetAuth.mockReturnValue({ userId: "user_123" } as unknown as ReturnType<
      typeof getAuth
    >);
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
    const created = {
      id: "app_1",
      clerkId: "user_123",
      jobId: "job_1",
      status: "saved",
    };
    mockCreate.mockResolvedValue(
      created as Awaited<ReturnType<typeof applicationsService.create>>,
    );

    const res = await fetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "job_1" }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(created);
    expect(mockCreate).toHaveBeenCalledWith(
      "user_123",
      expect.objectContaining({ jobId: "job_1" }),
    );
  });

  it("forwards appliedDate to the service as an ISO string", async () => {
    const iso = "2026-09-13T10:00:00.000Z";
    mockCreate.mockResolvedValue(
      {} as Awaited<ReturnType<typeof applicationsService.create>>,
    );

    await fetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "job_1",
        status: "applied",
        appliedDate: iso,
      }),
    });

    expect(mockCreate).toHaveBeenCalledWith("user_123", {
      jobId: "job_1",
      status: "applied",
      appliedDate: iso,
    });
  });

  it("409s when the service reports a duplicate application", async () => {
    mockCreate.mockRejectedValue(
      new Error("You have already applied to this job"),
    );

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
    mockCreate.mockRejectedValue(
      new Error("connection terminated unexpectedly"),
    );

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

describe("GET /api/applications/status-map", () => {
  let server: Server;
  let baseUrl: string;

  const mockGetAuth = vi.mocked(getAuth);
  const mockGetStatusMap = vi.mocked(applicationsService.getStatusMap);

  beforeAll(async () => {
    const app: Express = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { log: { error: () => void } }).log = {
        error: () => {},
      };
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
    mockGetStatusMap.mockReset();
    mockGetAuth.mockReturnValue({ userId: "user_123" } as unknown as ReturnType<
      typeof getAuth
    >);
  });

  // Guards the route-ordering trap: "/applications/:id" is declared after
  // "/applications/status-map", so "status-map" must not be read as an id.
  it("routes to the status-map handler, not the :id handler", async () => {
    mockGetStatusMap.mockResolvedValue({ job_1: "applied", job_2: "saved" });

    const res = await fetch(`${baseUrl}/api/applications/status-map`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ job_1: "applied", job_2: "saved" });
    expect(mockGetStatusMap).toHaveBeenCalledWith("user_123");
    expect(vi.mocked(applicationsService.get)).not.toHaveBeenCalled();
  });

  it("returns an empty object for a user with no applications", async () => {
    mockGetStatusMap.mockResolvedValue({});

    const res = await fetch(`${baseUrl}/api/applications/status-map`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it("401s when there is no authenticated user", async () => {
    mockGetAuth.mockReturnValue({ userId: null } as unknown as ReturnType<
      typeof getAuth
    >);

    const res = await fetch(`${baseUrl}/api/applications/status-map`);

    expect(res.status).toBe(401);
    expect(mockGetStatusMap).not.toHaveBeenCalled();
  });

  it("500s with a generic message when the service throws", async () => {
    mockGetStatusMap.mockRejectedValue(new Error("connection terminated"));

    const res = await fetch(`${baseUrl}/api/applications/status-map`);
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to build application status map");
  });
});
