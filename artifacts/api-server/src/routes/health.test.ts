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

import healthRouter, { healthHandler } from "./health";

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

  beforeEach(() => schemaStatus.mockReset());

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
});
