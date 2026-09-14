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

/** Waits for the jobs grid to finish loading and returns the visible count. */
export async function visibleJobCount(page: Page): Promise<number> {
  await page
    .getByText(/\d+( of [\d,]+)? jobs?( matching filters)?$/)
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  return jobCards(page).count();
}

/** Board column locator, addressed by its heading text. */
export function boardColumn(page: Page, label: string) {
  return page
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .last();
}
