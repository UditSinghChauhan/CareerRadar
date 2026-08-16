import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(),
}));

import { getAuth } from "@clerk/express";
import { requireAuth, type AuthenticatedRequest } from "./requireAuth";

function makeRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireAuth", () => {
  const mockGetAuth = vi.mocked(getAuth);

  beforeEach(() => {
    mockGetAuth.mockReset();
  });

  it("responds 401 and does not call next() when there is no Clerk session", () => {
    mockGetAuth.mockReturnValue({ userId: undefined } as unknown as ReturnType<typeof getAuth>);
    const req = {} as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("responds 401 when getAuth returns no auth object at all", () => {
    mockGetAuth.mockReturnValue(undefined as unknown as ReturnType<typeof getAuth>);
    const req = {} as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches clerkUserId and calls next() when a session is present", () => {
    mockGetAuth.mockReturnValue({ userId: "user_123" } as unknown as ReturnType<typeof getAuth>);
    const req = {} as Request;
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect((req as AuthenticatedRequest).clerkUserId).toBe("user_123");
  });
});
