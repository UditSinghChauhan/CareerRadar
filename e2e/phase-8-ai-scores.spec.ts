import { test, expect } from "./fixtures";
import type { Page, Request } from "@playwright/test";

/**
 * Phase 8 — cost-controlled AI, in a real browser.
 *
 * WHAT THIS FILE IS FOR
 * ──────────────────────
 * The second acceptance criterion: "Every page renders with `GEMINI_API_KEY`
 * unset." `playwright.config.ts` pins `GEMINI_API_KEY: ""` on the API server
 * for exactly this, so the whole suite runs against the degraded path rather
 * than whichever way the operator's `.env` happens to fall.
 *
 * "Renders" is asserted as three separate things, because a page can fail any
 * of them independently:
 *   1. its own content is on screen — not a spinner, not an error boundary;
 *   2. nothing was logged to the console as an error, which is where a thrown
 *      render would show up even when a parent boundary swallowed it;
 *   3. no request to /api/ai/* came back 500. A 503 on the match endpoint is
 *      the CORRECT answer with no key; a 500 is a broken server.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER
 * ────────────────────────────────────
 * The AI-present path. Turning the key on here would make every run issue real
 * Gemini requests against a free-tier allowance measured at 15 per minute, and
 * a test suite that spends the user's daily quota is worse than no suite. The
 * cache, the recompute rule, the budget and the batch scorer are all covered
 * against an injected fake in artifacts/api-server/src/services/*.test.ts,
 * where the number of outbound calls is the assertion.
 */

/** The app's own origin. Anything served from here is ours to be responsible for. */
const APP_ORIGIN = "http://localhost:5173";

/**
 * Collects console errors and 5xx API responses for a whole page visit.
 *
 * ONE CLASS OF CONSOLE ERROR IS EXCLUDED, AND ONLY ONE: a failed sub-resource
 * load from a THIRD-PARTY origin. The seeded `companies.logo_url` values point
 * at cdn.simpleicons.org paths that have since been removed upstream, so every
 * page with a company logo on it logs a handful of
 * "Failed to load resource: ... 404". That is pre-existing seeded data with a
 * working `onError` fallback in both job-card.tsx and todays-queue.tsx — it is
 * not this page failing to render, and it predates Phase 8 entirely.
 *
 * The exclusion is deliberately narrow rather than a blanket filter on the
 * message text. A 404 or 500 on OUR origin — a missing bundle chunk, a broken
 * /api call — is still a failure, and so is every other kind of console error,
 * including the uncaught exception a thrown render produces.
 */
function watch(page: Page) {
  const consoleErrors: string[] = [];
  const serverErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const source = message.location().url;
    const isThirdPartyResource =
      /^Failed to load resource/.test(text) &&
      Boolean(source) &&
      !source.startsWith(APP_ORIGIN);
    if (isThirdPartyResource) return;
    consoleErrors.push(`${text} (${source})`);
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  return { consoleErrors, serverErrors };
}

const PAGES: Array<{ path: string; expects: (page: Page) => Promise<void> }> = [
  {
    path: "/dashboard",
    expects: async (page) => {
      await expect(page.getByTestId("todays-queue")).toBeVisible();
    },
  },
  {
    path: "/jobs",
    expects: async (page) => {
      await expect(page.getByTestId("job-total").first()).toBeVisible();
    },
  },
  {
    path: "/applications",
    expects: async (page) => {
      await expect(
        page.getByRole("heading", { name: /applications/i }).first(),
      ).toBeVisible();
    },
  },
  {
    path: "/profile",
    expects: async (page) => {
      await expect(
        page.getByRole("heading", { name: /profile/i }).first(),
      ).toBeVisible();
    },
  },
  {
    path: "/settings",
    expects: async (page) => {
      await expect(
        page.getByRole("heading", { name: /settings/i }).first(),
      ).toBeVisible();
    },
  },
  {
    path: "/tools/capture",
    expects: async (page) => {
      await expect(
        page.getByRole("heading", { name: /capture/i }).first(),
      ).toBeVisible();
    },
  },
];

test.describe("every page renders with GEMINI_API_KEY unset", () => {
  for (const { path, expects } of PAGES) {
    test(`${path} renders`, async ({ appPage }) => {
      const { consoleErrors, serverErrors } = watch(appPage);

      await appPage.goto(path);
      await expects(appPage);

      // The AI section must leave no trace anywhere — not a heading, not an
      // empty state, not a "not configured" message.
      await expect(appPage.getByTestId("match-insights")).toHaveCount(0);
      await expect(appPage.getByTestId("ai-match-badge")).toHaveCount(0);

      expect(serverErrors, `5xx responses on ${path}`).toEqual([]);
      expect(
        consoleErrors.filter(
          // Clerk's development instance logs a standing banner about running
          // in dev mode on every page; it is not a failure of this page.
          (text) => !/clerk.*development/i.test(text),
        ),
        `console errors on ${path}`,
      ).toEqual([]);
    });
  }
});

test.describe("the AI endpoints with no key", () => {
  test("GET /api/ai/status reports unavailable rather than failing", async ({
    appPage,
  }) => {
    const body = await appPage.evaluate(async () => {
      const res = await fetch("/api/ai/status", { credentials: "include" });
      return { status: res.status, json: await res.json() };
    });

    expect(body.status).toBe(200);
    expect(body.json.available).toBe(false);
    // The budget is still reported: it is a property of the deployment, not of
    // whether a key happens to be present, and the operator reading this wants
    // to know both.
    expect(typeof body.json.dailyBudget).toBe("number");
  });

  test("GET /api/ai/match-scores is an empty read, never an error", async ({
    appPage,
  }) => {
    const body = await appPage.evaluate(async () => {
      const res = await fetch("/api/ai/match-scores", {
        credentials: "include",
      });
      return { status: res.status, json: await res.json() };
    });

    // 200 with no rows. This endpoint does not depend on the key at all — it is
    // a pure table read — so it must answer normally even here.
    expect(body.status).toBe(200);
    expect(Array.isArray(body.json.scores)).toBe(true);
  });

  test("GET /api/ai/jobs/:id/match answers 503, not 500", async ({
    appPage,
  }) => {
    await appPage.goto("/jobs");
    await expect(appPage.getByTestId("job-card").first()).toBeVisible();
    const jobId = await appPage
      .locator("[data-job-id]")
      .first()
      .getAttribute("data-job-id");

    const status = await appPage.evaluate(async (id) => {
      const res = await fetch(`/api/ai/jobs/${id}/match`, {
        credentials: "include",
      });
      return res.status;
    }, jobId);

    // 503 = "this capability is not configured". A 500 would mean the route
    // tried to do the work and fell over.
    expect(status).toBe(503);
  });

  test("POST /api/ai/batch-score refuses an unauthenticated trigger", async ({
    appPage,
  }) => {
    // The Clerk session cookie is NOT the credential for this route — it takes
    // the cron secret, like POST /api/sync/cron. The suite never sends the
    // correct one: a valid call would start a real scoring run.
    const status = await appPage.evaluate(async () => {
      const res = await fetch("/api/ai/batch-score", {
        method: "POST",
        credentials: "include",
        headers: { "x-cron-secret": "wrong-secret" },
      });
      return res.status;
    });
    expect(status).toBe(401);
  });
});

test.describe("the jobs grid never waits on a score", () => {
  /**
   * §8: "never block a card's render waiting for it."
   *
   * Proven by ORDER rather than by appearance: the cards are required to be on
   * screen before the score request has even been answered. With the key unset
   * the map comes back empty, so an implementation that gated rendering on it
   * would still eventually paint — and would still be wrong.
   */
  test("cards are on screen before the match-score request settles", async ({
    appPage,
  }) => {
    let scoreRequestSettled = false;
    appPage.on("requestfinished", (request: Request) => {
      if (request.url().includes("/api/ai/match-scores")) {
        scoreRequestSettled = true;
      }
    });

    // Hold the score request open long enough that a blocking implementation
    // would have to wait for it.
    await appPage.route("**/api/ai/match-scores", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ scores: [] }),
      });
    });

    await appPage.goto("/jobs");
    await expect(appPage.getByTestId("job-card").first()).toBeVisible({
      timeout: 15_000,
    });

    expect(
      scoreRequestSettled,
      "cards only appeared after the score request finished — the grid is blocking on it",
    ).toBe(false);

    await appPage.unroute("**/api/ai/match-scores");
  });

  /**
   * The other half: when scores DO arrive, the badge appears. Served from a
   * stubbed response rather than a real one, because putting a real row in the
   * table needs a Gemini call and this assertion is about the card, not about
   * where the number came from.
   */
  test("a card gains a score badge when the map resolves", async ({
    appPage,
  }) => {
    await appPage.goto("/jobs");
    await expect(appPage.getByTestId("job-card").first()).toBeVisible();
    const jobId = await appPage
      .locator("[data-job-id]")
      .first()
      .getAttribute("data-job-id");

    await appPage.route("**/api/ai/match-scores", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          scores: [{ jobId, score: 88, computedAt: new Date().toISOString() }],
        }),
      });
    });

    await appPage.reload();
    const badge = appPage
      .locator(`[data-job-id="${jobId}"]`)
      .getByTestId("ai-match-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/88% match/);
    await expect(badge).toHaveAttribute("data-match-score", "88");

    await appPage.unroute("**/api/ai/match-scores");
  });
});

test.describe("the apply drawer", () => {
  /**
   * The drawer must be fully usable with no AI at all — that is the whole
   * point of the graceful-degradation rule. The AI block is absent and every
   * field Phase 1.4 and Phase 6.1 put there is still editable.
   */
  test("opens and stays editable with the AI section absent", async ({
    appPage,
  }) => {
    // Create one application to open.
    await appPage.goto("/jobs");
    await expect(appPage.getByTestId("job-card").first()).toBeVisible();
    const jobId = await appPage
      .locator("[data-job-id]")
      .first()
      .getAttribute("data-job-id");

    await appPage.evaluate(async (id) => {
      await fetch("/api/applications", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: id, status: "saved" }),
      });
    }, jobId);

    await appPage.goto("/applications");
    await appPage.getByTestId("board-card").first().click();

    const dialog = appPage.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // The drawer is open and editable, exactly as it is without Phase 8.
    await expect(dialog.getByLabel("Notes")).toBeVisible();
    await expect(dialog.getByLabel("Applied date")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Save changes" }),
    ).toBeVisible();

    // And the Phase 8 block left no trace — not even a loading skeleton.
    await expect(dialog.getByTestId("match-insights")).toHaveCount(0);
    await expect(dialog.getByTestId("match-insights-loading")).toHaveCount(0);
  });
});
