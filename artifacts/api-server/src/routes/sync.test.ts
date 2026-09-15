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

// Phase 3: the cron trigger reclassifies relevance once the sync finishes, so
// the recency modifiers move with the calendar. Mocked because the real one is
// a full-table pass.
vi.mock("../relevance/backfill-relevance", () => ({
  backfillRelevance: vi.fn(),
}));

// The status route is the only one that touches the database, and it stays
// public. Mocking the db module keeps the suite free of a live connection.
// The cron route refuses to start a sync on a drifted schema (lib/schema-check).
// Default it to "ok" so the auth tests below exercise the gate they are about,
// and flip it in the one test that is about drift.
const schemaStatus = vi.fn().mockResolvedValue({
  status: "ok",
  checkedAt: "2026-09-15T00:00:00.000Z",
  drift: [],
});
vi.mock("../lib/schema-check", () => ({
  currentSchemaStatus: () => schemaStatus(),
}));

// The real table definitions, with only `db` replaced. Phase 6.2 put the
// notification generator on the cron path, so routes/sync.ts now transitively
// imports most of the schema at module load; a hand-listed mock would need a
// new entry every time that import graph grew, and the failure it produces
// ("No X export is defined on the mock") says nothing about this suite.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return { ...schema, db: { select: vi.fn() }, pool: {} };
});

import { getAuth } from "@clerk/express";
import { schedulerService } from "../providers/scheduler";
import { runVerification } from "../providers/verify";
import { backfillRelevance } from "../relevance/backfill-relevance";
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
  const mockBackfill = vi.mocked(backfillRelevance);

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
    mockBackfill.mockReset();
    mockBackfill.mockResolvedValue({
      scanned: 0,
      updated: 0,
      durationMs: 0,
      activeFresherEligible: 0,
    } as unknown as Awaited<ReturnType<typeof backfillRelevance>>);
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

  it("503s on schema drift with the correct secret, and starts nothing", async () => {
    process.env["SYNC_CRON_SECRET"] = SECRET;
    schemaStatus.mockResolvedValueOnce({
      status: "drift",
      checkedAt: "2026-09-15T00:00:00.000Z",
      drift: [
        { table: "jobs", missingColumns: ["is_india"], missingTable: false },
      ],
      hint: 'SCHEMA DRIFT: "jobs" is missing "is_india". …',
    });

    const res = await post({ "x-cron-secret": SECRET });

    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("schema_drift");
    expect(body.hint).toContain('"jobs" is missing "is_india"');
    expect(mockRunAll).not.toHaveBeenCalled();
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

  // ── Phase 3: relevance is reclassified after every cron sync ──────────────
  // The classifier's "posted within 7 days +10" and "posted over 45 days −20"
  // modifiers are functions of the calendar. The sync only rewrites rows a
  // provider returned, so without this the stored score of every row that
  // stops being listed freezes and the daily queue ranks by a stale number.

  it("runs the relevance backfill once the sync finishes", async () => {
    process.env["SYNC_CRON_SECRET"] = SECRET;

    const res = await post({ "x-cron-secret": SECRET });
    expect(res.status).toBe(202);
    await res.json();

    await vi.waitFor(() => {
      expect(mockBackfill).toHaveBeenCalledTimes(1);
    });
  });

  it("does not start the backfill until the sync has resolved", async () => {
    // Two full-table passes at once is how a 512 MB instance gets OOM-killed.
    process.env["SYNC_CRON_SECRET"] = SECRET;

    let releaseSync: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });
    mockRunAll.mockReturnValue(
      blocked as unknown as ReturnType<typeof schedulerService.runAll>,
    );

    await (await post({ "x-cron-secret": SECRET })).json();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockRunAll).toHaveBeenCalledTimes(1);
    expect(mockBackfill).not.toHaveBeenCalled();

    releaseSync();
    await vi.waitFor(() => {
      expect(mockBackfill).toHaveBeenCalledTimes(1);
    });
  });

  it("never runs the backfill when the trigger was rejected", async () => {
    process.env["SYNC_CRON_SECRET"] = SECRET;
    const res = await post({ "x-cron-secret": "wrong" });
    expect(res.status).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockBackfill).not.toHaveBeenCalled();
  });

  it("skips the backfill when the sync failed — stale scores beat wrong ones", async () => {
    process.env["SYNC_CRON_SECRET"] = SECRET;
    mockRunAll.mockRejectedValue(new Error("provider exploded"));

    await (await post({ "x-cron-secret": SECRET })).json();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mockBackfill).not.toHaveBeenCalled();
  });

  it("survives a rejected backfill without crashing the process", async () => {
    // The jobs are already in; only their scores are stale, which the next
    // pass fixes. An unhandled rejection here would kill the instance.
    process.env["SYNC_CRON_SECRET"] = SECRET;
    mockBackfill.mockRejectedValue(new Error("backfill exploded"));

    const res = await post({ "x-cron-secret": SECRET });
    expect(res.status).toBe(202);
    await res.json();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mockBackfill).toHaveBeenCalledTimes(1);
  });
});
