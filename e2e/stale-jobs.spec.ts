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
  title: string;
}

/** Two active jobs from the seeded catalogue. */
async function twoActiveJobs(page: Page): Promise<[SeededJob, SeededJob]> {
  const jobs = await page.evaluate(async () => {
    const res = await fetch("/api/jobs?status=active&limit=200", {
      credentials: "include",
    });
    const body = (await res.json()) as {
      data: Array<{ id: string; title: string }>;
    };
    return body.data.map((j) => ({ id: j.id, title: j.title }));
  });
  expect(jobs.length).toBeGreaterThanOrEqual(2);
  return [jobs[0], jobs[1]];
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

/** The explorer's own count, read off the header line. */
async function renderedJobCount(page: Page): Promise<number> {
  const text = await page
    .getByText(/^\d+ jobs?( matching filters)?$/)
    .first()
    .textContent();
  return Number.parseInt(text?.trim() ?? "0", 10);
}

async function gotoJobs(page: Page): Promise<void> {
  await page.goto("/jobs");
  await expect(page.getByTestId("job-card").first()).toBeVisible();
}

test.describe("Stale jobs — closed postings leave the explorer", () => {
  test("closing a job removes it from the list and decrements the count, leaving the others alone", async ({
    appPage: page,
  }) => {
    const [doomed, survivor] = await twoActiveJobs(page);

    await gotoJobs(page);
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
    const [target] = await twoActiveJobs(page);

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
