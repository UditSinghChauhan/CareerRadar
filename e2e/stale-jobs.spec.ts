import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Phase 1.5 — closed jobs must disappear from the explorer.
 *
 * The sweep logic itself is proved against real Postgres rows in
 * artifacts/api-server/src/providers/staleness.test.ts. What those tests cannot
 * show is the thing the user actually cares about: that a job the sweep closed
 * stops appearing in the morning list, and that the open ones do not vanish with
 * it. That is what this spec covers, through the real API and the real UI.
 *
 * These specs deliberately reuse seeded jobs and put their status back, rather
 * than creating throwaway ones. `DELETE /api/jobs/:id` is a soft close, not a
 * hard delete, so a create/delete fixture would leave a few permanently closed
 * rows behind on every run.
 */

interface SeededJob {
  id: string;
}

/**
 * Two jobs that are ACTUALLY ON SCREEN, read out of the rendered cards.
 *
 * The obvious version of this helper asks the API for `?status=active&limit=200`
 * and takes `data[0]` and `data[1]`. That worked only while the local database
 * held the 13 seeded rows. The explorer paginates client-side at PAGE_SIZE = 20
 * and applies its own sort and filters on top, so as soon as the table grows
 * past a page the API's first two rows are usually not the two on screen, and
 * the spec fails on `toBeVisible()` for a job that is perfectly healthy — just
 * on page 3.
 *
 * Phase 5 put sync on a six-hourly schedule, so the table growing is now the
 * normal case rather than an accident. Reading the ids off the DOM makes the
 * spec independent of page size, sort order and filter state: whatever the
 * explorer chose to show, those are the jobs we act on.
 */
async function twoRenderedJobs(page: Page): Promise<[SeededJob, SeededJob]> {
  await gotoJobs(page);

  const ids = await page
    .locator("[data-job-id]")
    .evaluateAll((els) =>
      els
        .map((el) => el.getAttribute("data-job-id"))
        .filter((id): id is string => Boolean(id)),
    );

  expect(
    ids.length,
    "the explorer must render at least two jobs for this spec to mean anything",
  ).toBeGreaterThanOrEqual(2);

  return [{ id: ids[0] as string }, { id: ids[1] as string }];
}

async function setStatus(
  page: Page,
  id: string,
  status: "active" | "closed",
): Promise<void> {
  const ok = await page.evaluate(
    async ({ jobId, next }) => {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      return res.ok;
    },
    { jobId: id, next: status },
  );
  expect(ok).toBe(true);
}

/**
 * The explorer's own count, read off the header line.
 *
 * This is the size of the whole filtered set, not the current page — as of
 * Phase 7 the header renders the server's `meta.total` for the filtered set,
 * and the page is one window into it. That is deliberately what these specs
 * assert on: counting rendered cards would cap at the page size and stop being
 * able to see a single job appear or disappear.
 */
async function renderedJobCount(page: Page): Promise<number> {
  const text = await page.getByTestId("job-total").first().textContent();
  // Thousands-separated once the table is large, so strip anything non-numeric.
  return Number.parseInt((text ?? "0").replace(/[^\d]/g, ""), 10);
}

async function gotoJobs(page: Page): Promise<void> {
  await page.goto("/jobs");
  await expect(page.getByTestId("job-card").first()).toBeVisible();
}

test.describe("Stale jobs — closed postings leave the explorer", () => {
  test("closing a job removes it from the list and decrements the count, leaving the others alone", async ({
    appPage: page,
  }) => {
    // twoRenderedJobs navigates to /jobs and picks from what is on screen.
    const [doomed, survivor] = await twoRenderedJobs(page);

    await expect(page.locator(`[data-job-id="${doomed.id}"]`)).toBeVisible();
    const countBefore = await renderedJobCount(page);

    try {
      // Exactly what a sweep does to a row it decides is dead.
      await setStatus(page, doomed.id, "closed");

      await gotoJobs(page);
      await expect(page.locator(`[data-job-id="${doomed.id}"]`)).toHaveCount(0);
      await expect(
        page.locator(`[data-job-id="${survivor.id}"]`),
      ).toBeVisible();
      expect(await renderedJobCount(page)).toBe(countBefore - 1);
    } finally {
      await setStatus(page, doomed.id, "active");
    }

    // Reopening restores it, which is what makes these specs re-runnable.
    await gotoJobs(page);
    await expect(page.locator(`[data-job-id="${doomed.id}"]`)).toBeVisible();
    expect(await renderedJobCount(page)).toBe(countBefore);
  });

  test("a closed job is hidden, not deleted — it is still retrievable by status", async ({
    appPage: page,
  }) => {
    // Closing is reversible bookkeeping, not data loss: the application history
    // from Phase 1 joins against these rows and must not lose them.
    const [target] = await twoRenderedJobs(page);

    try {
      await setStatus(page, target.id, "closed");

      const inClosed = await page.evaluate(async (id) => {
        const res = await fetch("/api/jobs?status=closed&limit=200", {
          credentials: "include",
        });
        const body = (await res.json()) as { data: Array<{ id: string }> };
        return body.data.some((j) => j.id === id);
      }, target.id);

      expect(inClosed).toBe(true);
    } finally {
      await setStatus(page, target.id, "active");
    }
  });

  test("the explorer still lists the seeded catalogue — closing is not mass-deletion", async ({
    appPage: page,
  }) => {
    // The spec's own sanity check, at the UI level: if a staleness change ever
    // empties the list, that is a bug and this fails loudly.
    await gotoJobs(page);
    expect(await renderedJobCount(page)).toBeGreaterThan(0);
  });
});
