/**
 * README screenshot capture.
 * ──────────────────────────
 * Not a test. This is the script that produced every image in
 * `docs/screenshots/`, kept in the repo so the next person to change the UI can
 * regenerate them in one command instead of hand-cropping browser windows:
 *
 *   CAPTURE_SCREENSHOTS=1 pnpm run test:e2e e2e/screenshots.spec.ts
 *
 * It lives here rather than in `scripts/` because it needs exactly what the e2e
 * suite already provides — both dev servers under Playwright's lifecycle, a
 * Clerk session for the test user, and a local database — and duplicating that
 * harness to take pictures would be worse than skipping one file.
 *
 * It is SKIPPED without the env var, so `pnpm run test:e2e` is unaffected.
 *
 * It writes application rows for the tracker and board shots and deletes them
 * again at the end, for the reason every fixture in this directory does: a spec
 * that leaves rows behind breaks the next run's assumptions about a small
 * dataset, and the failure shows up somewhere unrelated.
 */

import { test as base, expect, type Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { E2E_EMAIL } from "./global-setup";
import { resetApplications, resetNotifications } from "./fixtures";

const OUT = "docs/screenshots";

/**
 * The same fixture `capture.spec.ts` pins, so the dialog in the screenshot
 * shows the parse the suite actually asserts on rather than a hand-made string
 * the heuristics happen to read differently.
 */
const CAPTURE_URL =
  "https://www.linkedin.com/jobs/view/software-engineer-intern-at-radar-capture-corp-4123456789";

const PASTED_JD = `Software Engineer Intern
Radar Capture Corp · Gurugram, Haryana, India · 2 days ago

About the job
Join the platform team for the 2027 batch.
Stipend: ₹45,000 /month
Apply by 30 Nov 2026
Skills: React, TypeScript, PostgreSQL
Hybrid role.`;

/** 16:10 at a width that renders the app's `lg` breakpoint, so no layout is mobile. */
const VIEWPORT = { width: 1440, height: 900 };

base.describe("README screenshots", () => {
  base.skip(
    !process.env.CAPTURE_SCREENSHOTS,
    "Set CAPTURE_SCREENSHOTS=1 to regenerate docs/screenshots/.",
  );

  base.use({ viewport: VIEWPORT });
  // Six pages, each waiting on real network, in one browser session.
  base.setTimeout(180_000);

  async function shot(page: Page, name: string, fullPage = false) {
    // Let fonts, logos and any entry animation settle; a screenshot taken mid
    // transition is the one thing worse than an out-of-date screenshot.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  }

  base("captures every page", async ({ page }) => {
    // ── Signed out ──
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await shot(page, "landing", true);

    // ── Sign in ──
    await setupClerkTestingToken({ page });
    await page.goto("/sign-in");
    await page.waitForFunction(() => Boolean(window.Clerk?.loaded), null, {
      timeout: 30_000,
    });
    await shot(page, "sign-in");

    await clerk.signIn({ page, emailAddress: E2E_EMAIL });
    await resetApplications(page);
    await resetNotifications(page);

    // ── Jobs explorer ──
    await page.goto("/jobs");
    await page.getByTestId("job-total").first().waitFor({ timeout: 30_000 });
    await shot(page, "jobs");

    // A relevance breakdown open, since that is the piece the README spends
    // the most words on. The panel is tooltip content — it does not exist in
    // the DOM until its badge is hovered, so the hover has to come first.
    const relevanceBadge = page.locator("[data-relevance-track]").first();
    await relevanceBadge.scrollIntoViewIfNeeded();
    await relevanceBadge.hover();
    await expect(page.getByTestId("relevance-signals").first()).toBeVisible();
    await shot(page, "jobs-relevance");

    // ── Applications: apply to a few jobs so the tracker is not empty ──
    // Sourced from the daily queue rather than a raw /api/jobs page, so the
    // tracker shows the kind of role the app is for. The queue is already
    // filtered to fresher-eligible and ranked.
    const applied = await page.evaluate(async () => {
      const res = await fetch("/api/dashboard/today?limit=6", {
        credentials: "include",
      });
      const queue = (await res.json()) as {
        items: Array<{ job: { id: string } }>;
      };
      const body = { data: queue.items.map((i) => i.job) };
      // The real enum, so every board column has something in it.
      const statuses = [
        "applied",
        "oa_pending",
        "oa_completed",
        "interview_pending",
        "offered",
        "saved",
      ];
      let n = 0;
      for (const [i, job] of body.data.entries()) {
        const created = await fetch("/api/applications", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jobId: job.id,
            status: statuses[i] ?? "saved",
            notes:
              i === 0 ? "Referral asked via a senior from college." : undefined,
          }),
        });
        if (created.ok) n += 1;
      }
      return n;
    });
    expect(applied).toBeGreaterThan(0);

    // ── Dashboard (daily queue) ──
    await page.goto("/dashboard");
    await page.getByTestId("queue-list").waitFor({ timeout: 30_000 });
    // Viewport-sized: the queue is the point of this page, and a full-page
    // capture of a 3,500px dashboard renders illegibly in a README.
    await shot(page, "dashboard");
    await shot(page, "dashboard-full", true);

    // The per-row "why is this ranked here" breakdown. Same tooltip rule as
    // above: hover the info icon inside the first queue row to render it.
    const firstRow = page.getByTestId("queue-row").first();
    await firstRow.locator("svg.lucide-info").first().hover();
    await expect(page.getByTestId("queue-rank-reasons").first()).toBeVisible();
    await shot(page, "daily-queue-reasons");

    // ── Applications tracker ──
    await page.goto("/applications");
    await page.getByTestId("scope-all").waitFor({ timeout: 30_000 });
    await expect(page.getByTestId("board-card")).toHaveCount(6);
    await shot(page, "applications");

    // The board scrolls horizontally past "OA Done"; the table view is the one
    // that shows every tracked row and its referral state at once.
    await page.getByRole("button", { name: "Table" }).click();
    await expect(page.getByTestId("application-row").first()).toBeVisible();
    await shot(page, "applications-table");

    // ── Paste-to-parse capture ──
    // The dialog lives on the jobs page behind "Add job"; /tools/capture is
    // the bookmarklet installer, and both are worth showing.
    await page.goto("/jobs");
    await page.getByTestId("job-total").first().waitFor({ timeout: 30_000 });
    await page.getByTestId("add-job").click();
    await expect(page.getByTestId("capture-dialog")).toBeVisible();
    await page.getByTestId("capture-url").fill(CAPTURE_URL);
    await page.getByTestId("capture-text").fill(PASTED_JD);
    await page.getByTestId("capture-parse").click();
    await expect(page.getByTestId("capture-title")).toHaveValue(
      "Software Engineer Intern",
    );
    await expect(page.getByTestId("capture-company")).toHaveValue(
      "Radar Capture Corp",
    );
    await shot(page, "capture");
    await page.keyboard.press("Escape");

    await page.goto("/tools/capture");
    await page.getByTestId("capture-bookmarklet").waitFor({ timeout: 30_000 });
    await shot(page, "capture-bookmarklet", true);

    // ── Profile & settings ──
    // The shared test user's profile is empty apart from the graduation year
    // the relevance specs set, and a screenshot of an empty form shows nothing
    // about the page. Filled in here and cleared again at the end.
    await page.evaluate(async () => {
      await fetch("/api/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Final-year B.Tech IT",
          college: "Netaji Subhas University of Technology",
          degree: "B.Tech",
          branch: "Information Technology",
          graduationYear: 2027,
          cgpa: 8.6,
          skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Python"],
          resumeUrl: "https://drive.google.com/file/d/example/view",
          linkedinUrl: "https://linkedin.com/in/example",
          githubUrl: "https://github.com/example",
        }),
      });
    });
    await page.goto("/profile");
    await expect(page.getByLabel("Degree")).toHaveValue("B.Tech");
    await shot(page, "profile", true);

    await page.goto("/settings");
    await page.waitForTimeout(1200);
    await shot(page, "settings", true);

    // ── Notification bell, open ──
    // Bookmark whatever closes inside 72 hours and then run the generator, the
    // same way phase-6-notifications.spec.ts does. Without a job in the
    // tracker inside that window there is genuinely nothing to announce, and
    // an empty panel is a true screenshot of nothing.
    await page.goto("/dashboard");
    const reminders = await page.evaluate(async () => {
      const res = await fetch("/api/jobs?limit=100&sort=deadline", {
        credentials: "include",
      });
      const body = (await res.json()) as {
        data: Array<{ id: string; deadline: string | null }>;
      };
      const cutoff = Date.now() + 72 * 60 * 60 * 1000;
      const closing = body.data.filter(
        (j) => j.deadline && new Date(j.deadline).getTime() <= cutoff,
      );
      for (const job of closing) {
        await fetch("/api/bookmarks", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId: job.id }),
        });
      }
      const gen = await fetch("/api/admin/generate-notifications", {
        method: "POST",
        credentials: "include",
      });
      return (await gen.json()) as { deadlineReminders: number };
    });
    expect(reminders.deadlineReminders).toBeGreaterThan(0);
    await page.reload();
    const bell = page.getByTestId("notification-bell");
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByTestId("notification-panel")).toBeVisible();
    await shot(page, "notifications");

    await resetApplications(page);
    await resetNotifications(page);
    // Put the profile back to what the other specs expect: the graduation year
    // and nothing else.
    await page.evaluate(async () => {
      await fetch("/api/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "User",
          college: "",
          degree: "",
          branch: "",
          graduationYear: 2027,
          skills: [],
          resumeUrl: "",
          linkedinUrl: "",
          githubUrl: "",
        }),
      });
    });
    // The bookmarks above are this spec's own mess; the shared fixtures do not
    // clear them, and a later run would find the notifications already
    // deduplicated away.
    await page.evaluate(async () => {
      // GET /api/bookmarks returns a bare array, not a paginated envelope.
      const res = await fetch("/api/bookmarks", { credentials: "include" });
      if (!res.ok) return;
      const bookmarks = (await res.json()) as Array<{ jobId: string }>;
      await Promise.all(
        bookmarks.map((b) =>
          fetch(`/api/bookmarks/${b.jobId}`, {
            method: "DELETE",
            credentials: "include",
          }),
        ),
      );
    });
  });
});
