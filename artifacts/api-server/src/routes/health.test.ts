import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";
import { AddressInfo } from "net";
import healthRouter from "./health";

describe("GET /api/healthz", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app: Express = express();
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

  it("returns 200 with the Zod-validated health shape, independent of DB or Clerk", async () => {
    const res = await fetch(`${baseUrl}/api/healthz`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
