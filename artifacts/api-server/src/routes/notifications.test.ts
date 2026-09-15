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

vi.mock("../services/notifications.service", () => ({
  notificationsService: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

import { getAuth } from "@clerk/express";
import { notificationsService } from "../services/notifications.service";
import notificationsRouter from "./notifications";

const mockGetAuth = vi.mocked(getAuth);

function signedIn(userId = "user_bell") {
  mockGetAuth.mockReturnValue({ userId } as unknown as ReturnType<
    typeof getAuth
  >);
}

function signedOut() {
  mockGetAuth.mockReturnValue({ userId: null } as unknown as ReturnType<
    typeof getAuth
  >);
}

describe("notification routes", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app: Express = express();
    app.use(express.json());
    // Stand-in for the req.log pino-http normally attaches; the generic-500
    // branches call req.log.error(...).
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as unknown as { log: { error: () => void } }).log = {
        error: () => {},
      };
      next();
    });
    app.use("/api", notificationsRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    signedIn();
  });

  describe("GET /api/notifications", () => {
    it("returns the page and the unread count together", async () => {
      // One round trip for both, because the bell needs the badge and the list
      // at the same moment and the instance is on a free tier.
      vi.mocked(notificationsService.list).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
        unreadCount: 3,
      } as unknown as Awaited<ReturnType<typeof notificationsService.list>>);

      const res = await fetch(`${baseUrl}/api/notifications`);
      const body = (await res.json()) as { unreadCount: number };

      expect(res.status).toBe(200);
      expect(body.unreadCount).toBe(3);
    });

    it("passes the query string through to the service", async () => {
      vi.mocked(notificationsService.list).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 5, total: 0, totalPages: 0 },
        unreadCount: 0,
      } as unknown as Awaited<ReturnType<typeof notificationsService.list>>);

      await fetch(`${baseUrl}/api/notifications?unreadOnly=true&limit=5`);

      expect(notificationsService.list).toHaveBeenCalledWith(
        "user_bell",
        expect.objectContaining({ unreadOnly: "true", limit: "5" }),
      );
    });

    it("401s when there is no authenticated user", async () => {
      signedOut();

      const res = await fetch(`${baseUrl}/api/notifications`);

      expect(res.status).toBe(401);
      expect(notificationsService.list).not.toHaveBeenCalled();
    });

    it("500s with a generic message when the service throws", async () => {
      vi.mocked(notificationsService.list).mockRejectedValue(
        new Error("connection terminated"),
      );

      const res = await fetch(`${baseUrl}/api/notifications`);
      const body = (await res.json()) as { error: string };

      expect(res.status).toBe(500);
      expect(body.error).toBe("Failed to list notifications");
    });
  });

  describe("POST /api/notifications/read-all", () => {
    it("returns how many rows changed", async () => {
      vi.mocked(notificationsService.markAllRead).mockResolvedValue({
        updated: 4,
      });

      const res = await fetch(`${baseUrl}/api/notifications/read-all`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ updated: 4 });
    });

    it("is not swallowed by the /:id/read route", async () => {
      // The literal path is declared first for exactly this reason. If it were
      // not, "read-all" would be matched as an :id.
      vi.mocked(notificationsService.markAllRead).mockResolvedValue({
        updated: 0,
      });

      await fetch(`${baseUrl}/api/notifications/read-all`, { method: "POST" });

      expect(notificationsService.markAllRead).toHaveBeenCalledWith(
        "user_bell",
      );
      expect(notificationsService.markRead).not.toHaveBeenCalled();
    });

    it("401s when there is no authenticated user", async () => {
      signedOut();

      const res = await fetch(`${baseUrl}/api/notifications/read-all`, {
        method: "POST",
      });

      expect(res.status).toBe(401);
      expect(notificationsService.markAllRead).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/notifications/:id/read", () => {
    it("returns the updated notification", async () => {
      vi.mocked(notificationsService.markRead).mockResolvedValue({
        id: "n_1",
        isRead: true,
      } as unknown as Awaited<
        ReturnType<typeof notificationsService.markRead>
      >);

      const res = await fetch(`${baseUrl}/api/notifications/n_1/read`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(notificationsService.markRead).toHaveBeenCalledWith(
        "n_1",
        "user_bell",
      );
    });

    it("404s for an id that is not the caller's", async () => {
      // The service scopes by clerkId, so "someone else's" and "does not
      // exist" are the same answer on purpose.
      vi.mocked(notificationsService.markRead).mockResolvedValue(null);

      const res = await fetch(`${baseUrl}/api/notifications/n_other/read`, {
        method: "POST",
      });

      expect(res.status).toBe(404);
    });

    it("401s when there is no authenticated user", async () => {
      signedOut();

      const res = await fetch(`${baseUrl}/api/notifications/n_1/read`, {
        method: "POST",
      });

      expect(res.status).toBe(401);
      expect(notificationsService.markRead).not.toHaveBeenCalled();
    });
  });
});
