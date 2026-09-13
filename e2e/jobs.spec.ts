import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const HIDE_APPLIED = "Hide jobs I've applied to";

/**
 * Reads the first active job straight from the API, so a spec can know the
 * applyUrl it expects *before* clicking Apply. The card's own "Open posting"
 * link only exists after an application is created.
 */
async function firstJobFromApi(
  page: Page,
): Promise<{ id: string; applyUrl: string }> {
  return page.evaluate(async () => {
    const res = await fetch("/api/jobs?status=active&limit=200", {
      credentials: "include",
    });
    const body = (await res.json()) as {
      data: Array<{ id: string; applyUrl?: string | null; createdAt: string }>;
    };
    // Match the page's default "Newest" sort so index 0 is the same job.
    const sorted = [...body.data].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    const job = sorted.find((j) => j.applyUrl);
    if (!job) throw new Error("no seeded job has an applyUrl");
    return { id: job.id, applyUrl: job.applyUrl as string };
  });
}

test.describe("Jobs explorer", () => {
  test("renders the seeded jobs", async ({ appPage: page }) => {
    await page.goto("/jobs");

    const cards = page.getByTestId("job-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(
      page.getByRole("heading", { name: "Jobs Explorer" }),
    ).toBeVisible();
  });

  test("Apply opens the external URL in a new tab and flips the card without a refresh", async ({
    appPage: page,
    context,
  }) => {
    await page.goto("/jobs");
    const { id, applyUrl } = await firstJobFromApi(page);

    // Stub just the employer's host. The spec is about whether a popup opens
    // at the right URL, not about their site being reachable, and without this
    // the popup follows real redirects (atlassian.com -> www.atlassian.com).
    // Scoped deliberately: a blanket off-site stub also swallows Clerk's
    // frontend API and the webfonts, and the app never finishes rendering.
    const employerHost = new URL(applyUrl).hostname.replace(/^www\./, "");
    await context.route(
      (url) =>
        url.hostname === employerHost || url.hostname === `www.${employerHost}`,
      (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "stub" }),
    );

    // The hide-applied filter is ON by default, which would whisk the card out
    // of the list the instant it flips. Turn it off so the flip is observable —
    // that the card vanishes when the filter is on is covered by its own spec.
    await page.getByLabel(HIDE_APPLIED).uncheck();

    const card = page.locator(`[data-job-id="${id}"]`);
    await expect(card).toBeVisible();

    // Capture the popup Apply opens. This is the popup-blocker regression
    // guard: if window.open ever moves after an await, no page event fires.
    const popupPromise = context.waitForEvent("page", { timeout: 15_000 });
    await card.getByTestId("apply-button").click();
    const popup = await popupPromise;

    expect(popup.url()).toBe(applyUrl);
    await popup.close();

    // No reload between the click and this assertion — the flip is optimistic.
    await expect(card.getByTestId("application-status-badge")).toContainText(
      "Applied",
    );
  });

  test("the Applied badge survives a hard reload of /jobs", async ({
    appPage: page,
  }) => {
    await page.goto("/jobs");
    const { id } = await firstJobFromApi(page);
    await page.getByLabel(HIDE_APPLIED).uncheck();

    const card = page.locator(`[data-job-id="${id}"]`);
    await card.getByTestId("apply-button").click();
    await expect(card.getByTestId("application-status-badge")).toContainText(
      "Applied",
    );

    await page.reload();
    // The filter is component state, so a reload restores its ON default.
    await page.getByLabel(HIDE_APPLIED).uncheck();

    await expect(
      page
        .locator(`[data-job-id="${id}"]`)
        .getByTestId("application-status-badge"),
    ).toContainText("Applied");
  });

  test("hide-applied filter toggles correctly", async ({ appPage: page }) => {
    await page.goto("/jobs");

    // Default is ON per Phase 1.3.
    const toggle = page.getByLabel(HIDE_APPLIED);
    await expect(toggle).toBeChecked();

    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await expect(toggle).toBeChecked();
  });

  test("applying removes exactly one job from the filtered list", async ({
    appPage: page,
  }) => {
    await page.goto("/jobs");
    const { id } = await firstJobFromApi(page);
    const cards = page.getByTestId("job-card");
    const toggle = page.getByLabel(HIDE_APPLIED);

    await expect(cards.first()).toBeVisible();
    await toggle.uncheck();
    const baseline = await cards.count();

    await page
      .locator(`[data-job-id="${id}"]`)
      .getByTestId("apply-button")
      .click();
    await expect(
      page
        .locator(`[data-job-id="${id}"]`)
        .getByTestId("application-status-badge"),
    ).toBeVisible();

    // Hard reload so both counts come from the server, not the optimistic cache.
    await page.reload();
    await expect(cards.first()).toBeVisible();

    await expect(toggle).toBeChecked();
    const withFilterOn = await cards.count();

    await toggle.uncheck();
    await expect(cards.first()).toBeVisible();
    const withFilterOff = await cards.count();

    expect(withFilterOff).toBe(baseline);
    expect(withFilterOn).toBe(withFilterOff - 1);
  });
});
