import { test as base, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { E2E_EMAIL } from "./global-setup";

/**
 * Signs the shared test user in via Clerk's ticket strategy (backend-issued
 * sign-in token — no password, no email round-trip) and hands back a page that
 * is already inside the app shell.
 */
async function signIn(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
  // clerk.signIn requires Clerk to be loaded on a public route first.
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded), null, {
    timeout: 30_000,
  });
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });
}

/**
 * Deletes every application belonging to the test user, so each spec starts
 * from an empty tracker. Runs through the API with the browser's own session
 * cookie rather than touching Postgres directly, which keeps the fixture
 * honest about what the app actually exposes.
 */
async function resetApplications(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const res = await fetch("/api/applications?limit=200", {
      credentials: "include",
    });
    if (!res.ok) return;
    const body = (await res.json()) as { data: Array<{ id: string }> };
    await Promise.all(
      body.data.map((a) =>
        fetch(`/api/applications/${a.id}`, {
          method: "DELETE",
          credentials: "include",
        }),
      ),
    );
  });
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, use) => {
    await signIn(page);
    await resetApplications(page);
    await use(page);
    await resetApplications(page);
  },
});

export { expect, resetApplications };

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** A job card in the jobs grid, addressed by its <article> wrapper. */
export function jobCards(page: Page) {
  return page.locator("article");
}

/**
 * Waits for the jobs grid to finish loading and returns the visible count.
 *
 * Waits on the header's total (Phase 7 gave it a test id; before that it was
 * matched by the shape of its text) rather than on a card, so an empty result
 * is a returned 0 and not a timeout.
 */
export async function visibleJobCount(page: Page): Promise<number> {
  await page
    .getByTestId("job-total")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  return jobCards(page).count();
}

/** The Jobs page's "Hide jobs I've applied to" checkbox label. */
export const HIDE_APPLIED_LABEL = "Hide jobs I've applied to";

/**
 * Unchecks the hide-applied filter and waits for the list it refetches.
 *
 * The wait is the point, and it is new in Phase 7. Hide-applied used to be a
 * browser-side pass over rows already fetched, so unchecking it re-rendered
 * synchronously. It is a WHERE clause now, so unchecking issues a request, and
 * the previous page deliberately stays on screen while that is in flight
 * (`placeholderData: keepPreviousData`). Anything read straight after the
 * click — an index into the card list, the total in the header — is therefore
 * read from the OLD, narrower list unless the request is awaited first.
 */
export async function uncheckHideApplied(page: Page): Promise<void> {
  const refetched = page.waitForResponse(
    (r) => /\/api\/jobs\?/.test(r.url()) && !r.url().includes("hideApplied"),
  );
  await page.getByLabel(HIDE_APPLIED_LABEL).uncheck();
  await refetched;
  await expect(page.getByTestId("job-card").first()).toBeVisible();
}

/** Board column locator, addressed by its heading text. */
export function boardColumn(page: Page, label: string) {
  return page
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .last();
}
