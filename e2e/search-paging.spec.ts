import { test, expect } from "./fixtures";
import type { Page, Route } from "@playwright/test";

/**
 * Phase 7 — search and paging in the browser.
 * ───────────────────────────────────────────
 * Two different kinds of assertion live here, on purpose.
 *
 * The first half runs against the REAL server and proves the wiring: that the
 * explorer asks the API for a page, that the filters and the search text go out
 * as query parameters rather than being applied to whatever came back, and that
 * the count on screen is the server's count of the whole result set.
 *
 * The second half STUBS `/api/jobs` with a large synthetic result. That is
 * deliberate, and it is the only honest way to test the specific bug this phase
 * fixes: the explorer said "Page 1 of 5" against 4,074 active postings, because
 * the server capped the response at 100 rows and the browser paged those. The
 * local database has thirteen seeded jobs, so no amount of real data here
 * reproduces it, and filling the shared local database with four thousand rows
 * would break every other spec that assumes a small dataset. The stub asserts
 * what the page does with a large `meta` — which is exactly what was wrong.
 */

const JOBS_URL = /\/api\/jobs\?/;

/** A job payload carrying every field the card actually reads. */
function fakeJob(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    companyId: "00000000-0000-4000-8000-00000000c0de",
    title: `Synthetic Role ${i}`,
    department: null,
    location: "Bengaluru, Karnataka",
    country: "India",
    locationCity: "Bengaluru",
    locationRegion: "Karnataka",
    locationCountry: "IN",
    locationMetro: "Bengaluru",
    isIndia: true,
    isRemote: false,
    relevanceTrack: "internship",
    relevanceScore: 90,
    isFresherEligible: true,
    seniorityExcluded: false,
    relevanceSignals: [],
    classifiedAt: null,
    workMode: "onsite",
    jobType: "internship",
    salaryMin: null,
    salaryMax: null,
    stipend: 50000,
    currency: "INR",
    eligibleBatch: [],
    eligibleBranches: [],
    minCgpa: null,
    requiredSkills: [],
    experienceMin: null,
    experienceMax: null,
    deadline: null,
    applyUrl: "https://example.test/apply",
    sourcePlatform: "greenhouse",
    sourceUrl: null,
    postedDate: "2026-09-01T00:00:00.000Z",
    status: "active",
    lastSeenAt: null,
    description: "Synthetic.",
    requirements: null,
    benefits: [],
    selectionProcess: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: null,
    company: {
      id: "00000000-0000-4000-8000-00000000c0de",
      name: "Synthetic Corp",
      slug: "synthetic-corp",
      logoUrl: null,
      website: null,
      industry: "Software",
      description: null,
      headquarters: null,
      size: null,
      type: null,
      linkedinUrl: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: null,
    },
  };
}

/**
 * Answers `/api/jobs` with `total` rows' worth of `meta` and exactly one page
 * of data, honouring the `page` and `limit` that were asked for — i.e. behaving
 * the way the real endpoint does after Phase 7.
 */
async function stubLargeJobList(page: Page, total: number) {
  await page.route(JOBS_URL, async (route: Route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const pageNumber = Number(url.searchParams.get("page") ?? 1);
    const offset = (pageNumber - 1) * limit;
    const count = Math.max(0, Math.min(limit, total - offset));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: Array.from({ length: count }, (_, i) => fakeJob(offset + i)),
        meta: {
          page: pageNumber,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }),
    });
  });
}

test.describe("Jobs explorer — server-side paging", () => {
  test("asks the server for a page rather than for the whole table", async ({
    appPage: page,
  }) => {
    const request = page.waitForRequest(JOBS_URL);
    await page.goto("/jobs");
    const url = new URL((await request).url());

    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("20");
  });

  test("the search box narrows the query server-side, not the fetched rows", async ({
    appPage: page,
  }) => {
    await page.goto("/jobs");
    await expect(page.getByTestId("job-card").first()).toBeVisible();

    const request = page.waitForRequest(
      (r) => JOBS_URL.test(r.url()) && r.url().includes("search="),
    );
    await page
      .getByPlaceholder("Search roles, companies, skills...")
      .fill("intern");

    const url = new URL((await request).url());
    // The point: "intern" left the browser. Before Phase 7 the search text did
    // go out, but the sidebar filters did not — so they only ever narrowed the
    // fetched window rather than the result set.
    expect(url.searchParams.get("search")).toBe("intern");
    expect(url.searchParams.get("page")).toBe("1");
  });

  test("a sidebar filter goes out as a query parameter", async ({
    appPage: page,
  }) => {
    await page.goto("/jobs");
    await expect(page.getByTestId("job-card").first()).toBeVisible();

    const request = page.waitForRequest(
      (r) => JOBS_URL.test(r.url()) && r.url().includes("workModes="),
    );
    // By id, not by label: "Remote" is also the name of a location bucket, and
    // the two checkboxes send different parameters.
    await page.locator("#wm-remote").check();

    const url = new URL((await request).url());
    expect(url.searchParams.getAll("workModes")).toEqual(["remote"]);
  });

  test("the count on screen is the server's total for the whole result set", async ({
    appPage: page,
  }) => {
    // Several components on this page hit `/api/jobs` — the header stats ask
    // for `limit=1` and `limit=6` with no filters at all — so a spec that just
    // takes the first response compares the header against somebody else's
    // query. `sort=` is the explorer's alone, and the LAST such request is the
    // one the header was rendered from: the profile arrives after the first
    // render and adds `eligibleBatch`, which narrows the set again.
    const explorerRequests: string[] = [];
    page.on("request", (r) => {
      if (JOBS_URL.test(r.url()) && r.url().includes("sort=")) {
        explorerRequests.push(r.url());
      }
    });

    await page.goto("/jobs");
    await expect(page.getByTestId("job-card").first()).toBeVisible();
    await expect(page.getByTestId("job-total")).toBeVisible();
    // The list settles after the profile lands; give the follow-up request a
    // moment to be the last one recorded.
    await page.waitForLoadState("networkidle");

    const shown = await page.getByTestId("job-total").textContent();
    const lastUrl = explorerRequests.at(-1);
    expect(lastUrl, "the explorer never requested a job page").toBeTruthy();

    const total = await page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: "include" });
      return ((await res.json()) as { meta: { total: number } }).meta.total;
    }, lastUrl as string);

    expect(Number(shown?.replace(/[^\d]/g, ""))).toBe(total);
  });
});

test.describe("Jobs explorer — a result set larger than one page", () => {
  test('pages the real result set instead of capping at "Page 1 of 5"', async ({
    appPage: page,
  }) => {
    await stubLargeJobList(page, 4074);
    await page.goto("/jobs");

    // 4,074 rows at 20 a page is 204 pages. The bug was that this said 5,
    // because the browser was paging a 100-row window.
    await expect(page.getByTestId("page-indicator")).toHaveText(
      /Page\s*1\s*of\s*204/,
    );
    await expect(page.getByTestId("job-total")).toHaveText("4,074");
    await expect(page.getByTestId("job-card")).toHaveCount(20);
  });

  test("Next asks the server for the following page", async ({
    appPage: page,
  }) => {
    await stubLargeJobList(page, 4074);
    await page.goto("/jobs");
    await expect(page.getByTestId("job-card").first()).toBeVisible();

    const request = page.waitForRequest(
      (r) => JOBS_URL.test(r.url()) && r.url().includes("page=2"),
    );
    await page.getByRole("button", { name: "Next" }).click();
    await request;

    await expect(page.getByTestId("page-indicator")).toHaveText(
      /Page\s*2\s*of\s*204/,
    );
    // Page 2 really is different rows, not a re-slice of the same window.
    await expect(page.getByTestId("job-card").first()).toContainText(
      "Synthetic Role 20",
    );
  });

  test("Previous is disabled on the first page and Next on the last", async ({
    appPage: page,
  }) => {
    await stubLargeJobList(page, 25);
    await page.goto("/jobs");

    await expect(page.getByRole("button", { name: "Previous" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();

    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByTestId("page-indicator")).toHaveText(
      /Page\s*2\s*of\s*2/,
    );
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
    await expect(page.getByTestId("job-card")).toHaveCount(5);
  });

  test("the page-size control changes the request and the page count", async ({
    appPage: page,
  }) => {
    await stubLargeJobList(page, 4074);
    await page.goto("/jobs");
    await expect(page.getByTestId("job-card").first()).toBeVisible();

    const request = page.waitForRequest(
      (r) => JOBS_URL.test(r.url()) && r.url().includes("limit=200"),
    );
    await page.getByTestId("page-size").click();
    await page.getByRole("option", { name: "200 / page" }).click();
    await request;

    // 200 is the raised server cap; 4,074 rows is then 21 pages, not 204.
    await expect(page.getByTestId("page-indicator")).toHaveText(
      /Page\s*1\s*of\s*21/,
    );
  });

  test("past 100 rows the grid virtualises instead of rendering every card", async ({
    appPage: page,
  }) => {
    await stubLargeJobList(page, 4074);
    await page.goto("/jobs");
    await expect(page.getByTestId("job-card").first()).toBeVisible();

    // 20 a page is below the threshold — the plain grid, every card in the DOM.
    await expect(page.getByTestId("virtual-job-grid")).toHaveCount(0);

    await page.getByTestId("page-size").click();
    await page.getByRole("option", { name: "200 / page" }).click();

    await expect(page.getByTestId("virtual-job-grid")).toBeVisible();
    const rendered = await page.getByTestId("job-card").count();
    expect(rendered).toBeGreaterThan(0);
    // The whole point of windowing: 200 rows in the page, far fewer cards.
    expect(rendered).toBeLessThan(100);
  });
});
