import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const HIDE_APPLIED = "Hide jobs I've applied to";

/** Job ids in the order the explorer is currently rendering them. */
async function renderedJobIds(page: Page): Promise<string[]> {
  await expect(page.getByTestId("job-card").first()).toBeVisible();
  return page
    .locator("[data-job-id]")
    .evaluateAll((els) =>
      els
        .map((el) => el.getAttribute("data-job-id"))
        .filter((id): id is string => Boolean(id)),
    );
}

/**
 * The first job that is ON SCREEN and has an applyUrl, with that URL — which a
 * spec needs *before* clicking Apply, since the card's "Open posting" link only
 * appears once an application exists.
 *
 * Picked from the rendered cards rather than from `/api/jobs?limit=200`, which
 * is what this helper used to do. That older version replicated the page's
 * "Newest" sort and took index 0, and it held only while the local database had
 * the 13 seeded rows: the explorer paginates client-side at PAGE_SIZE = 20, so
 * once sync fills the table the API's first row is usually several pages deep
 * and every `[data-job-id="..."]` assertion fails against a perfectly healthy
 * job. Phase 5 made the table grow on a schedule, so that is now the common
 * case.
 *
 * Details come from `GET /api/jobs/:id` per candidate rather than from the list
 * endpoint, because the list caps at 100 rows server-side and reintroduces the
 * same "is it in the window?" problem this helper exists to remove.
 */
async function firstRenderedJobWithApplyUrl(
  page: Page,
): Promise<{ id: string; applyUrl: string }> {
  const ids = await renderedJobIds(page);
  expect(ids.length, "the explorer rendered no jobs").toBeGreaterThan(0);

  const job = await page.evaluate(async (candidates) => {
    for (const id of candidates) {
      const res = await fetch(`/api/jobs/${id}`, { credentials: "include" });
      if (!res.ok) continue;
      const j = (await res.json()) as { id: string; applyUrl?: string | null };
      if (j.applyUrl) return { id: j.id, applyUrl: j.applyUrl };
    }
    return null;
  }, ids);

  if (!job) throw new Error("no job rendered on this page has an applyUrl");
  return job;
}

/**
 * The explorer's own count of the filtered set, read off the header line.
 *
 * Counting rendered cards instead would cap at PAGE_SIZE = 20: with a full
 * table, hiding one applied job simply pulls the next one up from page 2 and
 * the rendered count never changes. The header renders `sortedJobs.length`,
 * i.e. the whole filtered set, which is the number these assertions are
 * actually about.
 */
async function filteredJobCount(page: Page): Promise<number> {
  const text = await page
    .getByText(/^\d+( of [\d,]+)? jobs?( matching filters)?$/)
    .first()
    .textContent();
  return Number.parseInt(text?.trim() ?? "0", 10);
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
    const { id, applyUrl } = await firstRenderedJobWithApplyUrl(page);

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

    // Compare canonical forms: a bare-origin applyUrl ('https://x.com') is
    // reported by the browser as 'https://x.com/'.
    expect(popup.url()).toBe(new URL(applyUrl).href);
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
    // Uncheck first, then pick: unchecking adds the already-applied jobs back
    // into the list, which can push a job picked beforehand onto a later page.
    await page.getByLabel(HIDE_APPLIED).uncheck();
    const { id } = await firstRenderedJobWithApplyUrl(page);

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
    const cards = page.getByTestId("job-card");
    const toggle = page.getByLabel(HIDE_APPLIED);

    await expect(cards.first()).toBeVisible();
    await toggle.uncheck();
    await expect(cards.first()).toBeVisible();

    // Pick the job AFTER unchecking the filter, so the card is guaranteed to be
    // on screen in the state the assertions below run against.
    const { id } = await firstRenderedJobWithApplyUrl(page);
    const baseline = await filteredJobCount(page);

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
    const withFilterOn = await filteredJobCount(page);

    await toggle.uncheck();
    await expect(cards.first()).toBeVisible();
    const withFilterOff = await filteredJobCount(page);

    expect(withFilterOff).toBe(baseline);
    expect(withFilterOn).toBe(withFilterOff - 1);
  });
});
