/**
 * Route-level contract for Phase 4 quick capture.
 *
 * The service itself is covered in `capture/capture.service.test.ts` against a
 * real database; this suite is about the HTTP surface: auth, validation, status
 * codes, and — the one that is easy to get wrong — that `/jobs/capture` is
 * matched before `/jobs/:id` and is not read as a job id.
 */

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

vi.mock("@clerk/express", () => ({ getAuth: vi.fn() }));

vi.mock("../capture/capture.service", () => ({
  MANUAL_SOURCE_PLATFORM: "manual",
  captureService: { parse: vi.fn(), confirm: vi.fn() },
}));

vi.mock("../services/jobs.service", () => ({
  jobsService: {
    list: vi.fn(),
    get: vi.fn(),
    getClosingSoon: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock("../repositories/jobDismissals.repository", () => ({
  jobDismissalsRepository: { add: vi.fn(), remove: vi.fn() },
  resolveProfileId: vi.fn(),
}));

import { getAuth } from "@clerk/express";
import { captureService } from "../capture/capture.service";
import { jobsService } from "../services/jobs.service";
import jobsRouter from "./jobs";

const EMPTY_DRAFT = {
  title: null,
  companyName: null,
  location: null,
  workMode: null,
  jobType: null,
  stipend: null,
  salaryMin: null,
  salaryMax: null,
  currency: "INR",
  deadline: null,
  requiredSkills: [],
  description: null,
  applyUrl: null,
  sourceUrl: null,
};

describe("capture routes", () => {
  let server: Server;
  let baseUrl: string;

  const mockGetAuth = vi.mocked(getAuth);
  const mockParse = vi.mocked(captureService.parse);
  const mockConfirm = vi.mocked(captureService.confirm);
  const mockGet = vi.mocked(jobsService.get);

  beforeAll(async () => {
    const app: Express = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { log: { error: () => void } }).log = {
        error: () => {},
      };
      next();
    });
    app.use("/api", jobsRouter);

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
    vi.clearAllMocks();
    mockGetAuth.mockReturnValue({ userId: "user_123" } as unknown as ReturnType<
      typeof getAuth
    >);
  });

  function post(path: string, body: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("POST /api/jobs/capture", () => {
    it("401s when signed out, and never parses", async () => {
      mockGetAuth.mockReturnValue({ userId: null } as unknown as ReturnType<
        typeof getAuth
      >);
      const res = await post("/api/jobs/capture", {
        url: "https://example.com/jobs/1",
      });
      expect(res.status).toBe(401);
      expect(mockParse).not.toHaveBeenCalled();
    });

    it("400s when neither a url nor text was supplied", async () => {
      const res = await post("/api/jobs/capture", {});
      expect(res.status).toBe(400);
      expect(mockParse).not.toHaveBeenCalled();
    });

    it("400s when url and rawText are both blank", async () => {
      const res = await post("/api/jobs/capture", {
        url: "   ",
        rawText: "\n",
      });
      expect(res.status).toBe(400);
      expect(mockParse).not.toHaveBeenCalled();
    });

    it("200s with the draft the service produced", async () => {
      const response = {
        draft: { ...EMPTY_DRAFT, title: "SDE Intern", companyName: "Acme" },
        source: "heuristic" as const,
        aiAvailable: false,
        platform: "LinkedIn",
        warnings: ["AI extraction is off (no GEMINI_API_KEY)"],
      };
      mockParse.mockResolvedValue(response);

      const res = await post("/api/jobs/capture", {
        url: "https://example.com/jobs/1",
        rawText: "SDE Intern at Acme",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(response);
      expect(mockParse).toHaveBeenCalledWith({
        url: "https://example.com/jobs/1",
        rawText: "SDE Intern at Acme",
      });
    });

    it("accepts text with no url at all", async () => {
      mockParse.mockResolvedValue({
        draft: EMPTY_DRAFT,
        source: "heuristic",
        aiAvailable: false,
        platform: null,
        warnings: [],
      });
      const res = await post("/api/jobs/capture", {
        rawText: "Backend Intern",
      });
      expect(res.status).toBe(200);
    });

    it("500s with a plain message when parsing throws", async () => {
      mockParse.mockRejectedValue(new Error("boom"));
      const res = await post("/api/jobs/capture", {
        url: "https://example.com/jobs/1",
      });
      expect(res.status).toBe(500);
      expect((await res.json()) as { error: string }).toEqual({
        error: "Failed to parse that posting",
      });
    });

    it("is matched before /jobs/:id — 'capture' is not read as a job id", async () => {
      mockParse.mockResolvedValue({
        draft: EMPTY_DRAFT,
        source: "heuristic",
        aiAvailable: false,
        platform: null,
        warnings: [],
      });
      await post("/api/jobs/capture", { rawText: "x" });
      expect(mockParse).toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/jobs/capture/confirm", () => {
    const job = { id: "job_1", title: "SDE Intern", sourcePlatform: "manual" };

    it("401s when signed out", async () => {
      mockGetAuth.mockReturnValue({ userId: null } as unknown as ReturnType<
        typeof getAuth
      >);
      const res = await post("/api/jobs/capture/confirm", {
        title: "SDE Intern",
        companyName: "Acme",
      });
      expect(res.status).toBe(401);
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it("400s without a title", async () => {
      const res = await post("/api/jobs/capture/confirm", {
        companyName: "Acme",
      });
      expect(res.status).toBe(400);
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it("400s without a company name", async () => {
      const res = await post("/api/jobs/capture/confirm", {
        title: "SDE Intern",
      });
      expect(res.status).toBe(400);
      expect(mockConfirm).not.toHaveBeenCalled();
    });

    it("400s on an empty title, which is not the same as a missing one", async () => {
      const res = await post("/api/jobs/capture/confirm", {
        title: "",
        companyName: "Acme",
      });
      expect(res.status).toBe(400);
    });

    it("201s with the created job", async () => {
      mockConfirm.mockResolvedValue({
        job: job as unknown as Awaited<
          ReturnType<typeof captureService.confirm>
        >["job"],
        duplicate: false,
      });

      const res = await post("/api/jobs/capture/confirm", {
        title: "SDE Intern",
        companyName: "Acme",
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ job, duplicate: false });
    });

    it("hands the deadline to the service as an ISO string", async () => {
      mockConfirm.mockResolvedValue({
        job: job as unknown as Awaited<
          ReturnType<typeof captureService.confirm>
        >["job"],
        duplicate: false,
      });

      await post("/api/jobs/capture/confirm", {
        title: "SDE Intern",
        companyName: "Acme",
        deadline: "2026-11-30T23:59:59.000Z",
      });

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ deadline: "2026-11-30T23:59:59.000Z" }),
      );
    });

    it("passes a null deadline through rather than inventing one", async () => {
      mockConfirm.mockResolvedValue({
        job: job as unknown as Awaited<
          ReturnType<typeof captureService.confirm>
        >["job"],
        duplicate: false,
      });
      await post("/api/jobs/capture/confirm", {
        title: "SDE Intern",
        companyName: "Acme",
      });
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ deadline: null }),
      );
    });

    it("never lets the caller choose the source platform", async () => {
      mockConfirm.mockResolvedValue({
        job: job as unknown as Awaited<
          ReturnType<typeof captureService.confirm>
        >["job"],
        duplicate: false,
      });

      await post("/api/jobs/capture/confirm", {
        title: "SDE Intern",
        companyName: "Acme",
        sourcePlatform: "greenhouse",
        status: "draft",
      });

      // The generated schema strips unknown keys; the service sets the platform
      // itself. A row that could claim a provider's platform would be inside
      // the reach of that provider's last-seen sweep.
      const [arg] = mockConfirm.mock.calls[0];
      expect(arg).not.toHaveProperty("sourcePlatform");
      expect(arg).not.toHaveProperty("status");
    });

    it("500s with a plain message when saving throws", async () => {
      mockConfirm.mockRejectedValue(new Error("boom"));
      const res = await post("/api/jobs/capture/confirm", {
        title: "SDE Intern",
        companyName: "Acme",
      });
      expect(res.status).toBe(500);
      expect((await res.json()) as { error: string }).toEqual({
        error: "Failed to save that job",
      });
    });
  });
});
