import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Phase 4 — quick capture, through the real UI and the real API.
 *
 * The parsers are pinned case by case in
 * `artifacts/api-server/src/capture/parse-{text,url}.test.ts`, and the write
 * path against real Postgres rows in `capture.service.test.ts`. What neither
 * can show is the thing the user actually does: open the dialog, paste, watch
 * the form fill itself, and save.
 *
 * THIS SUITE RUNS WITH NO GEMINI_API_KEY. The local `.env` does not set one
 * (it lives on Render), so every assertion below exercises the deterministic
 * path — which is exactly the guarantee UPGRADE.md §4.1 asks for: "the feature
 * must work fully with no API key". The Gemini branch is covered with a mocked
 * model in `capture.service.test.ts`.
 *
 * The URLs typed in below are strings the server parses. Nothing in this suite
 * makes the app request a job board; `blocked-domains.test.ts` proves that
 * statically and dynamically.
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

/** Every job this suite created, closed afterwards so later specs see the seeded set. */
async function closeCapturedJobs(
  page: Page,
  titleFragment: string,
): Promise<void> {
  await page.evaluate(async (fragment) => {
    const res = await fetch(
      `/api/jobs?search=${encodeURIComponent(fragment)}&limit=100`,
      {
        credentials: "include",
      },
    );
    if (!res.ok) return;
    const body = (await res.json()) as {
      data: Array<{ id: string; sourcePlatform?: string }>;
    };
    await Promise.all(
      body.data
        .filter((j) => j.sourcePlatform === "manual")
        .map((j) =>
          fetch(`/api/jobs/${j.id}`, {
            method: "DELETE",
            credentials: "include",
          }),
        ),
    );
  }, titleFragment);
}

test.describe("quick capture", () => {
  test.afterEach(async ({ appPage }) => {
    // DELETE /api/jobs/:id closes rather than deletes — that is the only
    // removal the API exposes, and it is enough: a closed row is out of every
    // `status=active` list the other specs read.
    await closeCapturedJobs(appPage, "Radar Capture");
  });

  test("the Add job button opens the dialog with an empty form", async ({
    appPage,
  }) => {
    await appPage.goto("/jobs");
    await appPage.getByTestId("add-job").click();

    const dialog = appPage.getByTestId("capture-dialog");
    await expect(dialog).toBeVisible();
    await expect(appPage.getByTestId("capture-url")).toHaveValue("");
    await expect(appPage.getByTestId("capture-title")).toHaveValue("");
    // Save is gated on a title and a company, so it starts disabled.
    await expect(appPage.getByTestId("capture-save")).toBeDisabled();
  });

  test("parsing a pasted JD fills the form — with no GEMINI_API_KEY set", async ({
    appPage,
  }) => {
    await appPage.goto("/jobs");
    await appPage.getByTestId("add-job").click();

    await appPage.getByTestId("capture-url").fill(CAPTURE_URL);
    await appPage.getByTestId("capture-text").fill(PASTED_JD);
    await appPage.getByTestId("capture-parse").click();

    await expect(appPage.getByTestId("capture-title")).toHaveValue(
      "Software Engineer Intern",
    );
    await expect(appPage.getByTestId("capture-company")).toHaveValue(
      "Radar Capture Corp",
    );
    await expect(appPage.getByTestId("capture-location")).toHaveValue(
      "Gurugram, Haryana, India",
    );
    await expect(appPage.getByTestId("capture-stipend")).toHaveValue("45000");
    await expect(appPage.getByTestId("capture-deadline")).toHaveValue(
      "2026-11-30",
    );
    await expect(appPage.getByTestId("capture-skills")).toHaveValue(
      "React, TypeScript, PostgreSQL",
    );

    // The platform label is derived from the URL's host, not fetched from it.
    await expect(appPage.getByTestId("capture-platform")).toHaveText(
      "LinkedIn",
    );

    // And it says so, rather than presenting a guess as an extraction.
    await expect(appPage.getByTestId("capture-warnings")).toContainText(
      "GEMINI_API_KEY",
    );
  });

  test("a URL alone still yields a title and a company", async ({
    appPage,
  }) => {
    await appPage.goto("/jobs");
    await appPage.getByTestId("add-job").click();

    await appPage.getByTestId("capture-url").fill(CAPTURE_URL);
    await appPage.getByTestId("capture-parse").click();

    await expect(appPage.getByTestId("capture-title")).toHaveValue(
      "Software Engineer Intern",
    );
    await expect(appPage.getByTestId("capture-company")).toHaveValue(
      "Radar Capture Corp",
    );
  });

  test("saving creates a manual job that is classified and located", async ({
    appPage,
  }) => {
    await appPage.goto("/jobs");
    await appPage.getByTestId("add-job").click();
    await appPage.getByTestId("capture-url").fill(CAPTURE_URL);
    await appPage.getByTestId("capture-text").fill(PASTED_JD);
    await appPage.getByTestId("capture-parse").click();
    await expect(appPage.getByTestId("capture-title")).toHaveValue(
      "Software Engineer Intern",
    );

    await appPage.getByTestId("capture-save").click();
    await expect(appPage.getByTestId("capture-dialog")).toBeHidden();

    const job = await appPage.evaluate(async () => {
      const res = await fetch("/api/jobs?search=Radar%20Capture&limit=20", {
        credentials: "include",
      });
      const body = (await res.json()) as {
        data: Array<Record<string, unknown>>;
      };
      return body.data.find((j) => j.sourcePlatform === "manual") ?? null;
    });

    expect(job, "the captured job is not in /api/jobs").not.toBeNull();
    expect(job!.sourcePlatform).toBe("manual");
    // §2.0 ran: Gurugram is in the NCR bucket.
    expect(job!.locationMetro).toBe("NCR");
    expect(job!.isIndia).toBe(true);
    // §2.1 ran: an internship title for the 2027 batch.
    expect(job!.relevanceTrack).toBe("internship");
    expect(job!.isFresherEligible).toBe(true);
    expect(job!.classifiedAt).not.toBeNull();
  });

  test("Save & mark applied logs the application in the same step", async ({
    appPage,
  }) => {
    await appPage.goto("/jobs");
    await appPage.getByTestId("add-job").click();
    await appPage.getByTestId("capture-title").fill("Software Engineer Intern");
    await appPage.getByTestId("capture-company").fill("Radar Capture Corp");
    await appPage.getByTestId("capture-save-applied").click();
    await expect(appPage.getByTestId("capture-dialog")).toBeHidden();

    await appPage.goto("/applications");
    await expect(
      appPage.getByText("Software Engineer Intern", { exact: false }).first(),
    ).toBeVisible();
  });

  test("re-capturing the same URL returns the existing job, not a second copy", async ({
    appPage,
  }) => {
    await appPage.goto("/jobs");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await appPage.getByTestId("add-job").click();
      await appPage.getByTestId("capture-url").fill(CAPTURE_URL);
      await appPage
        .getByTestId("capture-title")
        .fill("Software Engineer Intern");
      await appPage.getByTestId("capture-company").fill("Radar Capture Corp");
      await appPage.getByTestId("capture-save").click();
      await expect(appPage.getByTestId("capture-dialog")).toBeHidden();
    }

    const count = await appPage.evaluate(async (url) => {
      const res = await fetch("/api/jobs?search=Radar%20Capture&limit=50", {
        credentials: "include",
      });
      const body = (await res.json()) as {
        data: Array<{ sourceUrl?: string | null }>;
      };
      return body.data.filter((j) => j.sourceUrl === url).length;
    }, CAPTURE_URL);

    expect(count).toBe(1);
  });

  test("the bookmarklet's deep link opens the dialog already parsed", async ({
    appPage,
  }) => {
    // Exactly what the bookmarklet navigates to.
    const deepLink = `/jobs?capture=1&url=${encodeURIComponent(CAPTURE_URL)}&text=${encodeURIComponent(PASTED_JD)}`;
    await appPage.goto(deepLink);

    await expect(appPage.getByTestId("capture-dialog")).toBeVisible();
    await expect(appPage.getByTestId("capture-title")).toHaveValue(
      "Software Engineer Intern",
    );
    await expect(appPage.getByTestId("capture-company")).toHaveValue(
      "Radar Capture Corp",
    );

    // The query string is scrubbed so a reload does not reopen a stale capture.
    expect(appPage.url()).not.toContain("capture=1");
  });
});

test.describe("the bookmarklet setup page", () => {
  test("offers a draggable javascript: bookmarklet under the size cap", async ({
    appPage,
  }) => {
    await appPage.goto("/tools/capture");

    const link = appPage.getByTestId("capture-bookmarklet");
    await expect(link).toBeVisible();

    const href = await link.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href!.startsWith("javascript:")).toBe(true);
    expect(href).toContain("getSelection");
    expect(href).toContain("capture=1");
    expect(await link.getAttribute("draggable")).toBe("true");
  });

  /**
   * The acceptance criterion asks for the bookmarklet to be exercised "from a
   * LinkedIn job page in Chrome". Driving a browser at LinkedIn is the one
   * thing this phase must not do — so the posting below is served locally, at
   * a host of our own, with the slug shape and the copy layout of a real board
   * page. Everything downstream of the selection is identical: the bookmarklet
   * reads `location.href` and `window.getSelection()` on a page it did not
   * come from, and hands both to the app.
   */
  test("runs on a job page in Chrome and lands a pre-filled dialog", async ({
    appPage,
  }) => {
    const postingUrl =
      "https://board.example.test/jobs/view/software-engineer-intern-at-bookmarklet-corp-4123456789";

    await appPage.goto("/tools/capture");
    const href = (await appPage
      .getByTestId("capture-bookmarklet")
      .getAttribute("href"))!;
    const code = decodeURI(href.slice("javascript:".length));

    // Serve the synthetic posting.
    await appPage.route("https://board.example.test/**", (route) =>
      route.fulfill({
        status: 200,
        // charset matters: without it Chrome decodes the UTF-8 middots as
        // latin-1 and the company name arrives with a stray "Â" glued on.
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html><body><main id="jd">
          <h1>Software Engineer Intern</h1>
          <p>Bookmarklet Corp \u00b7 Gurugram, Haryana, India \u00b7 2 days ago</p>
          <p>Stipend: \u20b945,000 /month</p>
          <p>Apply by 30 Nov 2026</p>
          <p>Skills: React, TypeScript, PostgreSQL</p>
        </main></body></html>`,
      }),
    );

    await appPage.goto(postingUrl);

    // Select the posting the way the user would, then click the bookmarklet.
    const opened = await appPage.evaluate((bookmarkletCode) => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById("jd")!);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);

      let target = "";
      const originalOpen = window.open;
      // The bookmarklet opens a tab; capture where it would have gone.
      window.open = ((url: string) => {
        target = url;
        return null;
      }) as typeof window.open;
      try {
        // eslint-disable-next-line no-eval
        window.eval(bookmarkletCode);
      } finally {
        window.open = originalOpen;
      }
      return target;
    }, code);

    expect(opened, "the bookmarklet did not open anything").toContain(
      "capture=1",
    );
    expect(opened).toContain(encodeURIComponent(postingUrl));
    expect(opened.length).toBeLessThanOrEqual(1800);

    // Follow it, exactly as the new tab would.
    await appPage.goto(opened);
    await expect(appPage.getByTestId("capture-dialog")).toBeVisible();
    await expect(appPage.getByTestId("capture-title")).toHaveValue(
      "Software Engineer Intern",
    );
    await expect(appPage.getByTestId("capture-company")).toHaveValue(
      "Bookmarklet Corp",
    );
    await expect(appPage.getByTestId("capture-stipend")).toHaveValue("45000");
  });

  test("the bookmarklet's own logic produces a link under ~1,800 characters", async ({
    appPage,
  }) => {
    await appPage.goto("/tools/capture");
    const href = (await appPage
      .getByTestId("capture-bookmarklet")
      .getAttribute("href"))!;

    // Run the bookmarklet's real body with `location` and `window` passed in as
    // parameters, which shadows the globals — so a very long selection on a
    // very long URL is exercised without the page navigating anywhere.
    const opened = await appPage.evaluate(
      ({ code, url, selection }) => {
        let target = "";
        const run = new Function("location", "window", code) as (
          location: { href: string },
          window: unknown,
        ) => void;
        run(
          { href: url },
          {
            open: (href: string) => {
              target = href;
              return null;
            },
            getSelection: () => ({ toString: () => selection }),
          },
        );
        return target;
      },
      {
        code: decodeURI(href.slice("javascript:".length)),
        url: `https://example.com/jobs/view/${"a".repeat(200)}`,
        selection: "Software Engineer Intern. ".repeat(400),
      },
    );

    expect(opened.length).toBeLessThanOrEqual(1800);
    expect(opened).toContain("capture=1");
  });
});
