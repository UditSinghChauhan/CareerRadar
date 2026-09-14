import { test, expect } from "./fixtures";
import { request, type APIRequestContext } from "@playwright/test";

/**
 * Phase 5 — the external cron trigger, end to end.
 *
 * `POST /api/sync/cron` is the only route in the app that bypasses Clerk. It
 * has to, because the caller is a GitHub Actions runner with no browser session
 * — which also means the shared secret is the ONLY thing between the public
 * internet and a full provider sync. That makes it worth proving through the
 * real server, with the real middleware stack (helmet, rate limiter, CORS,
 * clerkMiddleware) in front of it, not just against a router in isolation.
 *
 * WHAT THIS SPEC DELIBERATELY DOES NOT DO
 * ────────────────────────────────────────
 * It never sends the correct secret. A valid call returns 202 and immediately
 * starts a real sync across every enabled config — ~47 boards, hundreds of
 * outbound requests, writes to the local database. A test suite must not set
 * that off. The success path (202, returns without waiting, survives a rejected
 * background run) is covered against a mocked scheduler in
 * artifacts/api-server/src/routes/sync.test.ts.
 *
 * The secret the server runs with is pinned in playwright.config.ts.
 */

const CRON_URL = "/api/sync/cron";

/** A context with no cookies at all — this is what a CI runner looks like. */
async function anonymousContext(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: "http://localhost:5173" });
}

test.describe("POST /api/sync/cron — the machine-to-machine gate", () => {
  test("401s when no secret header is sent", async () => {
    const api = await anonymousContext();
    try {
      const res = await api.post(CRON_URL);
      expect(res.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });

  test("401s on a wrong secret", async () => {
    const api = await anonymousContext();
    try {
      const res = await api.post(CRON_URL, {
        headers: { "x-cron-secret": "definitely-not-the-secret" },
      });
      expect(res.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });

  test("401s on a near-miss secret", async () => {
    // Same length, one byte different — the case a timing-unsafe comparison
    // would leak information about. The assertion here is only that it is
    // rejected; constant-time behaviour is asserted in cron-auth.test.ts.
    const api = await anonymousContext();
    try {
      const res = await api.post(CRON_URL, {
        headers: { "x-cron-secret": "e2e-cron-secret-never-sent-by-the-suitX" },
      });
      expect(res.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });

  test("401s on an empty secret header", async () => {
    const api = await anonymousContext();
    try {
      const res = await api.post(CRON_URL, {
        headers: { "x-cron-secret": "" },
      });
      expect(res.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });

  test("does not leak why it rejected", async () => {
    const api = await anonymousContext();
    try {
      const noHeader = await api.post(CRON_URL);
      const wrongSecret = await api.post(CRON_URL, {
        headers: { "x-cron-secret": "wrong" },
      });
      expect(await noHeader.json()).toEqual(await wrongSecret.json());
    } finally {
      await api.dispose();
    }
  });

  test("a signed-in browser session does NOT open the route", async ({
    appPage,
  }) => {
    // The gate is the secret, not the cookie. If someone ever "fixed" this
    // route by bolting requireAuth onto it, the GitHub Action would start
    // failing in production and this test would go green — so assert the
    // opposite: a fully authenticated session with no secret still gets 401.
    const status = await appPage.evaluate(async (url) => {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
      });
      return res.status;
    }, CRON_URL);

    expect(status).toBe(401);
  });
});

test.describe("GET /api/sync/status — still public and still reporting", () => {
  test("answers without authentication and exposes the scheduler state", async () => {
    // The cron workflow is fire-and-forget: /api/sync/cron returns 202 and says
    // nothing about the outcome. This endpoint is where the result actually
    // shows up, so it has to keep working for the trigger to be debuggable.
    const api = await anonymousContext();
    try {
      const res = await api.get("/api/sync/status");
      expect(res.status()).toBe(200);

      const body = (await res.json()) as {
        scheduler: unknown;
        recentLogs: unknown[];
        summary: unknown[];
      };
      expect(body.scheduler).toBeDefined();
      expect(Array.isArray(body.recentLogs)).toBe(true);
      expect(Array.isArray(body.summary)).toBe(true);
    } finally {
      await api.dispose();
    }
  });
});

test.describe("POST /api/admin/verify-providers — Phase 5.3 audit route", () => {
  test("401s without a session, so an audit cannot be triggered anonymously", async () => {
    // This route fires ~95 outbound requests to third-party ATS APIs. Leaving
    // it open would let anyone use the deployment as a traffic amplifier.
    const api = await anonymousContext();
    try {
      const res = await api.post("/api/admin/verify-providers");
      expect(res.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });
});
