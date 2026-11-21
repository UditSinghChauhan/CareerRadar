import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import express, { type Request, type Response } from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

const clerk = vi.hoisted(() => ({
  updateUser: vi.fn(),
  createSignInToken: vi.fn(),
}));

vi.mock("./demo-seed", () => ({ ensureDemoAccount: vi.fn() }));

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(),
  createClerkClient: () => ({
    users: { updateUser: clerk.updateUser },
    signInTokens: { createSignInToken: clerk.createSignInToken },
  }),
}));

import { getAuth } from "@clerk/express";
import { ensureDemoAccount } from "./demo-seed";
import demoRouter, {
  DEMO_READ_ONLY_BODY,
  demoReadOnly,
  resetDemoHardening,
} from "./demo";

const DEMO = "user_demo_account";
const mockGetAuth = vi.mocked(getAuth);
const signedInAs = (userId: string | null) =>
  mockGetAuth.mockReturnValue({ userId } as unknown as ReturnType<
    typeof getAuth
  >);

let server: Server;
let baseUrl: string;
/** Every route a write could reach, after the read-only guard, as in app.ts. */
const reached = vi.fn();

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", demoReadOnly);
  app.use("/api", demoRouter);
  app.all("/api/{*rest}", (req: Request, res: Response) => {
    reached(req.method, req.path);
    res.json({ ok: true });
  });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv("DEMO_CLERK_USER_ID", DEMO);
  reached.mockReset();
  clerk.updateUser.mockReset().mockResolvedValue({});
  clerk.createSignInToken.mockReset().mockResolvedValue({ token: "tkt_1" });
  resetDemoHardening();
  signedInAs(null);
});

const call = (method: string, path: string) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : "{}",
  });

describe("the demo account is read-only on the server", () => {
  it.each([
    ["POST", "/applications"],
    ["PUT", "/profile"],
    ["PATCH", "/applications/1"],
    ["DELETE", "/bookmarks/3"],
    ["POST", "/dashboard/today/7/dismiss"],
  ])("refuses %s %s with 403 before any route runs", async (method, path) => {
    signedInAs(DEMO);
    const res = await call(method, path);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(DEMO_READ_ONLY_BODY);
    expect(reached).not.toHaveBeenCalled();
  });

  it("lets the demo account read", async () => {
    signedInAs(DEMO);
    const res = await call("GET", "/dashboard/today");
    expect(res.status).toBe(200);
    expect(reached).toHaveBeenCalledWith("GET", "/api/dashboard/today");
  });

  it("lets the demo parse a pasted posting, which stores nothing, but not save it", async () => {
    signedInAs(DEMO);
    expect((await call("POST", "/jobs/capture")).status).toBe(200);
    expect((await call("POST", "/jobs/capture/confirm")).status).toBe(403);
  });

  it("leaves every other account's writes alone", async () => {
    signedInAs("user_someone_else");
    const res = await call("POST", "/applications");
    expect(res.status).toBe(200);
    expect(reached).toHaveBeenCalledWith("POST", "/api/applications");
  });

  it("guards nothing when no demo is configured", async () => {
    vi.stubEnv("DEMO_CLERK_USER_ID", "");
    signedInAs(DEMO);
    const res = await call("PUT", "/profile");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/demo", () => {
  it("says whether a demo exists and whether this session is it", async () => {
    expect(await (await call("GET", "/demo")).json()).toEqual({
      enabled: true,
      active: false,
    });
    signedInAs(DEMO);
    expect(await (await call("GET", "/demo")).json()).toEqual({
      enabled: true,
      active: true,
    });
  });

  it("reports off when DEMO_CLERK_USER_ID is unset or not a Clerk id", async () => {
    vi.stubEnv("DEMO_CLERK_USER_ID", "dukhchor@example.test");
    expect(await (await call("GET", "/demo")).json()).toEqual({
      enabled: false,
      active: false,
    });
  });
});

describe("POST /api/demo/session", () => {
  it("returns a short-lived sign-in ticket for the demo account", async () => {
    const res = await call("POST", "/demo/session");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ticket: "tkt_1" });
    expect(clerk.createSignInToken).toHaveBeenCalledWith({
      userId: DEMO,
      expiresInSeconds: 120,
    });
  });

  it("stops the demo account from being deleted from the browser, once", async () => {
    await call("POST", "/demo/session");
    await call("POST", "/demo/session");
    expect(clerk.updateUser).toHaveBeenCalledTimes(1);
    expect(clerk.updateUser).toHaveBeenCalledWith(DEMO, {
      deleteSelfEnabled: false,
      createOrganizationEnabled: false,
    });
  });

  it("fills the demo account before issuing the ticket", async () => {
    vi.mocked(ensureDemoAccount).mockResolvedValue("seeded");
    await call("POST", "/demo/session");
    expect(ensureDemoAccount).toHaveBeenCalledWith(DEMO);
  });

  it("still opens the demo when filling it fails", async () => {
    vi.mocked(ensureDemoAccount).mockRejectedValue(new Error("db busy"));
    const res = await call("POST", "/demo/session");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ticket: "tkt_1" });
  });

  it("is 404 when no demo is configured", async () => {
    vi.stubEnv("DEMO_CLERK_USER_ID", "");
    const res = await call("POST", "/demo/session");
    expect(res.status).toBe(404);
    expect(clerk.createSignInToken).not.toHaveBeenCalled();
  });

  it("is 502, with no ticket, when Clerk fails", async () => {
    clerk.createSignInToken.mockRejectedValue(new Error("clerk down"));
    const res = await call("POST", "/demo/session");
    expect(res.status).toBe(502);
    expect(await res.json()).not.toHaveProperty("ticket");
  });
});
