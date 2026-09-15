import { test, expect, uncheckHideApplied } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Phase 6 — referral/follow-up fields (§6.1) and the notification bell (§6.2).
 *
 * The bell's rows are written by the generator that runs after a cron sync, and
 * this suite never triggers one: a real cron pass fires every enabled provider
 * at the live ATS APIs, which is not something a test run should set off (the
 * same reason e2e/sync-cron.spec.ts never sends the correct secret). What is
 * exercised here is everything between the database and the screen — the routes,
 * the badge, mark-read, mark-all-read — with rows created through the app's own
 * API. Generation itself is covered against real Postgres in
 * artifacts/api-server/src/notifications/generator.test.ts.
 */

async function applyToJob(page: Page, index = 0): Promise<void> {
  await page.goto("/jobs");
  await expect(page.getByTestId("job-card").first()).toBeVisible();
  await uncheckHideApplied(page);

  const card = page.getByTestId("job-card").nth(index);
  await card.getByTestId("apply-button").click();
  await expect(card.getByTestId("application-status-badge")).toContainText(
    "Applied",
    { timeout: 15_000 },
  );
}

/** Saves (not applies) the nth job, producing a `saved` application row. */
async function saveJob(page: Page, index = 0): Promise<void> {
  await page.goto("/jobs");
  await expect(page.getByTestId("job-card").first()).toBeVisible();
  await uncheckHideApplied(page);

  const card = page.getByTestId("job-card").nth(index);
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByTestId("application-status-badge")).toContainText(
    "Saved",
    { timeout: 15_000 },
  );
}

/** The single application row's id, via the app's own API. */
async function firstApplicationId(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const res = await fetch("/api/applications?limit=1", {
      credentials: "include",
    });
    const body = (await res.json()) as { data: Array<{ id: string }> };
    return body.data[0].id;
  });
}

/** Sets fields on an application through PUT, the same call the drawer makes. */
async function patchApplication(
  page: Page,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const status = await page.evaluate(
    async ([applicationId, body]) => {
      const res = await fetch(`/api/applications/${applicationId as string}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.status;
    },
    [id, patch] as const,
  );
  expect(status).toBe(200);
}

test.describe("Phase 6.1 — referral and follow-up", () => {
  test("the drawer round-trips every referral field through a reload", async ({
    appPage: page,
  }) => {
    await applyToJob(page);
    await page.goto("/applications");
    await page.getByTestId("board-card").first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // "Contact name" is section 6.1's contactName, stored in the pre-existing
    // referral_name column rather than a duplicate of it.
    await dialog.getByLabel("Contact name").fill("A former teammate");
    await dialog
      .getByLabel("Contact profile")
      .fill("https://www.linkedin.com/in/example");
    await dialog.getByLabel("Outreach log").fill("Messaged on Monday.");

    await dialog.getByLabel("Referral status").click();
    await page.getByRole("option", { name: "Requested" }).click();

    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).not.toBeVisible();

    await page.reload();
    await page.getByTestId("board-card").first().click();
    const reopened = page.getByRole("dialog");

    await expect(reopened.getByLabel("Contact name")).toHaveValue(
      "A former teammate",
    );
    await expect(reopened.getByLabel("Contact profile")).toHaveValue(
      "https://www.linkedin.com/in/example",
    );
    await expect(reopened.getByLabel("Outreach log")).toHaveValue(
      "Messaged on Monday.",
    );
    await expect(reopened.getByLabel("Referral status")).toContainText(
      "Requested",
    );
  });

  test("an emptied contact field is cleared, not left at its old value", async ({
    appPage: page,
  }) => {
    // Before Phase 6.1 an empty box meant "leave it alone", so a value could be
    // typed but never erased.
    await applyToJob(page);
    await page.goto("/applications");
    await page.getByTestId("board-card").first().click();

    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Contact name").fill("Typed by mistake");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByTestId("board-card").first().click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Contact name")).toHaveValue(
      "Typed by mistake",
    );

    await dialog.getByLabel("Contact name").fill("");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).not.toBeVisible();

    await page.reload();
    await page.getByTestId("board-card").first().click();
    await expect(
      page.getByRole("dialog").getByLabel("Contact name"),
    ).toHaveValue("");
  });

  test("the Awaiting follow-up filter shows only overdue, non-terminal rows", async ({
    appPage: page,
  }) => {
    await applyToJob(page, 0);
    await applyToJob(page, 1);
    await page.goto("/applications");
    await expect(page.getByTestId("board-card")).toHaveCount(2);

    // One row gets a follow-up date in the past; the other gets none.
    const ids = await page.evaluate(async () => {
      const res = await fetch("/api/applications?limit=10", {
        credentials: "include",
      });
      const body = (await res.json()) as { data: Array<{ id: string }> };
      return body.data.map((a) => a.id);
    });
    await patchApplication(page, ids[0], {
      followUpDate: "2026-01-01T00:00:00.000Z",
    });

    await page.goto("/applications");
    await page.getByTestId("scope-awaiting-follow-up").click();
    await expect(page.getByTestId("board-card")).toHaveCount(1);

    // An offer does NOT take it out of the view. This is the entry most likely
    // to be mistakenly treated as terminal — it reads like a happy ending, but
    // an unanswered offer has an accept-by date and a pipeline to unwind.
    await patchApplication(page, ids[0], { status: "offered" });
    await page.reload();
    await page.getByTestId("scope-awaiting-follow-up").click();
    await expect(page.getByTestId("board-card")).toHaveCount(1);

    // Rejection does, because the company can do nothing further.
    await patchApplication(page, ids[0], { status: "rejected" });
    await page.reload();
    await page.getByTestId("scope-awaiting-follow-up").click();
    await expect(page.getByText("Nothing to chase")).toBeVisible();

    // And "Show all applications" gets back to the full list.
    await page.getByRole("button", { name: "Show all applications" }).click();
    await expect(page.getByTestId("board-card")).toHaveCount(2);
  });

  test("clearing a follow-up date removes the row from the filter", async ({
    appPage: page,
  }) => {
    await applyToJob(page);
    const id = await firstApplicationId(page);
    await patchApplication(page, id, {
      followUpDate: "2026-01-01T00:00:00.000Z",
    });

    await page.goto("/applications");
    await page.getByTestId("scope-awaiting-follow-up").click();
    await expect(page.getByTestId("board-card")).toHaveCount(1);

    await page.getByTestId("board-card").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Next action date").fill("");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByText("Nothing to chase")).toBeVisible();
  });
});

test.describe("Phase 6.2 — the notification bell", () => {
  /**
   * Makes the signed-in user's saved job close soon, then runs the real
   * generator.
   *
   * This drives the actual Phase 6.2 path end to end — jobs + applications in,
   * `notifications` rows out — rather than inserting rows that look like the
   * generator's. It does NOT go through POST /api/sync/cron: a correct secret
   * there starts a real pass over every enabled provider against live ATS APIs,
   * which is not something a test run should set off (the same reasoning as
   * e2e/sync-cron.spec.ts).
   *
   * Returns the job's ORIGINAL deadline so the caller can put it back. The jobs
   * row is shared, and a spec that leaves a doctored deadline behind is exactly
   * the kind of test-environment residue that sends the next diagnosis down the
   * wrong path.
   */
  async function makeDeadlineImminent(
    page: Page,
    hoursFromNow: number,
  ): Promise<{ jobId: string; originalDeadline: string }> {
    return page.evaluate(async (hours) => {
      const list = await fetch("/api/applications?limit=1", {
        credentials: "include",
      });
      const body = (await list.json()) as {
        data: Array<{ job: { id: string; deadline: string | null } }>;
      };
      const job = body.data[0].job;
      if (!job.deadline) {
        // Checked BEFORE anything is written. PUT /api/jobs treats a null
        // deadline as "leave it alone", so a job that started with none could
        // not be put back afterwards — and this spec would leave a doctored
        // deadline on a shared row for every later run to trip over.
        throw new Error(
          `job ${job.id} has no deadline to restore; pick a job that has one`,
        );
      }

      const deadline = new Date(
        Date.now() + hours * 60 * 60 * 1000,
      ).toISOString();
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deadline }),
      });
      if (!res.ok) throw new Error(`PUT /api/jobs failed: ${res.status}`);

      return { jobId: job.id, originalDeadline: job.deadline };
    }, hoursFromNow);
  }

  async function restoreDeadline(
    page: Page,
    jobId: string,
    deadline: string,
  ): Promise<void> {
    await page.evaluate(
      async ([id, value]) => {
        await fetch(`/api/jobs/${id as string}`, {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deadline: value }),
        });
      },
      [jobId, deadline] as const,
    );
  }

  /** Runs the generator now instead of waiting for the six-hourly cron. */
  async function runGenerator(page: Page): Promise<{
    deadlineReminders: number;
    newJobAlerts: number;
  }> {
    return page.evaluate(async () => {
      const res = await fetch("/api/admin/generate-notifications", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`generator failed: ${res.status}`);
      return (await res.json()) as {
        deadlineReminders: number;
        newJobAlerts: number;
      };
    });
  }

  test("the bell renders with no badge when there is nothing to show", async ({
    appPage: page,
  }) => {
    await page.goto("/dashboard");

    const bell = page.getByTestId("notification-bell");
    await expect(bell).toBeVisible();
    await expect(page.getByTestId("notification-badge")).toHaveCount(0);

    await bell.click();
    await expect(page.getByTestId("notification-panel")).toBeVisible();
    await expect(page.getByText("Nothing yet.")).toBeVisible();
  });

  test("a saved job closing inside 24 hours produces a badged reminder", async ({
    appPage: page,
  }) => {
    await saveJob(page);
    const { jobId, originalDeadline } = await makeDeadlineImminent(page, 20);

    try {
      const report = await runGenerator(page);
      expect(report.deadlineReminders).toBe(1);

      await page.goto("/dashboard");
      await expect(page.getByTestId("notification-badge")).toHaveText("1");

      await page.getByTestId("notification-bell").click();
      const panel = page.getByTestId("notification-panel");
      await expect(
        panel.getByText("Closes within 24 hours", { exact: true }),
      ).toBeVisible();
      // Saved, not applied — the nudge that makes the feature worth having.
      await expect(panel.getByText(/You have not applied yet/)).toBeVisible();

      // Running it again writes nothing: the cron fires every six hours and the
      // same job stays inside the same window for up to twelve passes.
      expect((await runGenerator(page)).deadlineReminders).toBe(0);
      await page.reload();
      await expect(page.getByTestId("notification-badge")).toHaveText("1");
    } finally {
      await restoreDeadline(page, jobId, originalDeadline);
    }
  });

  test("clicking a deadline reminder marks it read and opens the tracker", async ({
    appPage: page,
  }) => {
    await saveJob(page);
    const { jobId, originalDeadline } = await makeDeadlineImminent(page, 40);

    try {
      await runGenerator(page);
      await page.goto("/dashboard");
      await expect(page.getByTestId("notification-badge")).toHaveText("1");

      await page.getByTestId("notification-bell").click();
      await page
        .getByTestId("notification-panel")
        .getByText("Closes within 3 days", { exact: true })
        .click();

      await expect(page).toHaveURL(/\/applications$/);
      await expect(page.getByTestId("notification-badge")).toHaveCount(0);

      // Still listed, just no longer unread.
      await page.getByTestId("notification-bell").click();
      await expect(
        page
          .getByTestId("notification-panel")
          .getByText("Closes within 3 days", { exact: true }),
      ).toBeVisible();
    } finally {
      await restoreDeadline(page, jobId, originalDeadline);
    }
  });

  test("mark all read, then clear all, empty the bell for good", async ({
    appPage: page,
  }) => {
    await saveJob(page, 0);
    await saveJob(page, 1);
    const first = await makeDeadlineImminent(page, 20);

    try {
      await runGenerator(page);
      await page.goto("/dashboard");
      await page.getByTestId("notification-bell").click();

      await page.getByRole("button", { name: "Mark all read" }).click();
      await expect(page.getByTestId("notification-badge")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Mark all read" }),
      ).toHaveCount(0);

      await page.reload();
      await page.getByTestId("notification-bell").click();
      await expect(
        page
          .getByTestId("notification-panel")
          .getByText("Closes within 24 hours", { exact: true }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Clear all" }).click();
      await expect(page.getByText("Nothing yet.")).toBeVisible();

      await page.reload();
      await page.getByTestId("notification-bell").click();
      await expect(page.getByText("Nothing yet.")).toBeVisible();
    } finally {
      await restoreDeadline(page, first.jobId, first.originalDeadline);
    }
  });

  test("a deadline further out than three days produces nothing", async ({
    appPage: page,
  }) => {
    await saveJob(page);
    const { jobId, originalDeadline } = await makeDeadlineImminent(
      page,
      24 * 10,
    );

    try {
      expect((await runGenerator(page)).deadlineReminders).toBe(0);
      await page.goto("/dashboard");
      await expect(page.getByTestId("notification-badge")).toHaveCount(0);
    } finally {
      await restoreDeadline(page, jobId, originalDeadline);
    }
  });

  test("the bell is on every signed-in page", async ({ appPage: page }) => {
    for (const path of ["/dashboard", "/jobs", "/applications", "/profile"]) {
      await page.goto(path);
      await expect(page.getByTestId("notification-bell")).toBeVisible();
    }
  });
});
