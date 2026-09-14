import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Phase 2.0 — location normalisation, through the real API and the real UI.
 *
 * The normaliser's rules are proved string-by-string in
 * artifacts/api-server/src/relevance/location.test.ts, and the WHERE clauses
 * against real Postgres rows in location-filters.test.ts. What neither can show
 * is the thing the user cares about: that the default Jobs page shows the
 * India/remote feed, that a job the normaliser could not place is still
 * reachable through the 'Unknown location' bucket rather than silently gone,
 * that the filter is a server-side WHERE clause and not a pass over the 200-row
 * window, and that the admin backfill route returns the bucket distribution.
 *
 * Like stale-jobs.spec.ts, these specs borrow a seeded job and put it back —
 * PUT /api/jobs/:id with a new `location` re-normalises on the server, which
 * is also the hand-edit path this proves. No rows are created or closed; the
 * POST path is covered against real rows in location-filters.test.ts.
 */

interface BucketCounts {
  NCR: number;
  MMR: number;
  Bengaluru: number;
  Hyderabad: number;
  Pune: number;
  Chennai: number;
  Kolkata: number;
  other_india: number;
  remote: number;
  unknown: number;
  abroad: number;
}

interface BackfillResponse {
  dryRun: boolean;
  scanned: number;
  updated: number;
  buckets: BucketCounts;
  activeBuckets: BucketCounts;
  remoteTotal: number;
  unknownActivePercent: number;
  topUnknownLocations: Array<{ location: string | null; count: number }>;
  batches: number;
  storedActiveBuckets: { active: BucketCounts; activeTotal: number };
}

const BUCKET_KEYS: Array<keyof BucketCounts> = [
  "NCR",
  "MMR",
  "Bengaluru",
  "Hyderabad",
  "Pune",
  "Chennai",
  "Kolkata",
  "other_india",
  "remote",
  "unknown",
  "abroad",
];

const UNPLACEABLE = "Building 7, Floor 3";

async function runBackfill(
  page: Page,
  dryRun = false,
): Promise<BackfillResponse> {
  const body = await page.evaluate(async (dry) => {
    const res = await fetch(
      `/api/admin/backfill-location${dry ? "?dryRun=true" : ""}`,
      { method: "POST", credentials: "include" },
    );
    if (!res.ok) throw new Error(`backfill returned ${res.status}`);
    return (await res.json()) as unknown;
  }, dryRun);
  return body as BackfillResponse;
}

/** Server-side total for a query — the number the page header must agree with. */
async function apiTotal(page: Page, query: string): Promise<number> {
  return page.evaluate(async (q) => {
    const res = await fetch(`/api/jobs?status=active&limit=1${q}`, {
      credentials: "include",
    });
    const body = (await res.json()) as { meta: { total: number } };
    return body.meta.total;
  }, query);
}

async function getJob(page: Page, id: string) {
  return page.evaluate(async (jobId) => {
    const res = await fetch(`/api/jobs/${jobId}`, { credentials: "include" });
    return (await res.json()) as {
      id: string;
      location: string | null;
      locationMetro: string | null;
      isIndia: boolean | null;
      isRemote: boolean;
    };
  }, id);
}

async function setLocation(
  page: Page,
  id: string,
  location: string,
): Promise<void> {
  const ok = await page.evaluate(
    async ({ jobId, next }) => {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location: next }),
      });
      return res.ok;
    },
    { jobId: id, next: location },
  );
  expect(ok).toBe(true);
}

async function gotoJobs(page: Page): Promise<void> {
  await page.goto("/jobs");
  await page
    .getByText(/^\d+ jobs?( matching filters)?$/)
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function headerCount(page: Page): Promise<number> {
  const text = await page
    .getByText(/^\d+ jobs?( matching filters)?$/)
    .first()
    .textContent();
  return Number.parseInt(text?.trim() ?? "0", 10);
}

function bucket(page: Page, key: string) {
  return page
    .getByTestId("location-buckets")
    .first()
    .locator(`[data-location-bucket="${key}"]`);
}

/** Clicks a bucket and waits for the list to refetch. */
async function toggleBucket(page: Page, key: string): Promise<void> {
  const responded = page.waitForResponse(
    (r) => r.url().includes("/api/jobs?") && r.request().method() === "GET",
  );
  await bucket(page, key).click();
  await responded;
}

test.describe("Location normalisation (Phase 2.0)", () => {
  test("the backfill route recomputes every row and returns the full bucket distribution", async ({
    appPage: page,
  }) => {
    const report = await runBackfill(page);

    expect(report.dryRun).toBe(false);
    expect(report.scanned).toBeGreaterThan(0);
    expect(report.batches).toBeGreaterThanOrEqual(1);

    // Every bucket the user asked for is present as its own key, on both the
    // all-rows and active-rows views, and the exclusive buckets sum to the total.
    for (const key of BUCKET_KEYS) {
      expect(typeof report.buckets[key], key).toBe("number");
      expect(typeof report.activeBuckets[key], key).toBe("number");
    }
    const sum = BUCKET_KEYS.reduce((n, k) => n + report.buckets[k], 0);
    expect(sum).toBe(report.scanned);

    // What the filter actually sees, from the stored columns, agrees with the
    // report the run just produced.
    expect(report.storedActiveBuckets.active).toEqual(report.activeBuckets);
    expect(report.unknownActivePercent).toBeGreaterThanOrEqual(0);
    expect(report.unknownActivePercent).toBeLessThanOrEqual(100);

    // Recompute-all is idempotent: a second run reads everything and changes
    // nothing.
    const again = await runBackfill(page);
    expect(again.scanned).toBe(report.scanned);
    expect(again.updated).toBe(0);
    expect(again.activeBuckets).toEqual(report.activeBuckets);
  });

  test("the seeded rows land in their metros, not in unknown", async ({
    appPage: page,
  }) => {
    const report = await runBackfill(page);
    // seed.ts: Bengaluru ×9, Hyderabad ×2, Gurugram, Noida.
    expect(report.buckets.Bengaluru).toBeGreaterThanOrEqual(9);
    expect(report.buckets.Hyderabad).toBeGreaterThanOrEqual(2);
    expect(report.buckets.NCR).toBeGreaterThanOrEqual(2);
  });

  test("the default view is the NCR + Bengaluru + Hyderabad + Pune + remote feed, filtered on the server", async ({
    appPage: page,
  }) => {
    await runBackfill(page);
    await gotoJobs(page);

    for (const key of ["NCR", "Bengaluru", "Hyderabad", "Pune", "remote"]) {
      await expect(bucket(page, key)).toHaveAttribute("aria-pressed", "true");
    }
    for (const key of ["MMR", "Chennai", "Kolkata", "other_india", "unknown"]) {
      await expect(bucket(page, key)).toHaveAttribute("aria-pressed", "false");
    }

    // The header count is the server's total for exactly those buckets — the
    // request carries them as query params, nothing is filtered in the browser.
    const expected = await apiTotal(
      page,
      "&locations=NCR&locations=Bengaluru&locations=Hyderabad&locations=Pune&locations=remote",
    );
    expect(await headerCount(page)).toBe(expected);

    // An untouched page shows no "active filters" badge for the defaults.
    await expect(page.getByRole("button", { name: /clear all/i })).toHaveCount(
      0,
    );

    // Every rendered card carries a metro badge from one of the default buckets.
    const metros = await page
      .locator("[data-location-metro]")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-location-metro")),
      );
    expect(metros.length).toBeGreaterThan(0);
    for (const m of metros) {
      expect(["NCR", "Bengaluru", "Hyderabad", "Pune"]).toContain(m);
    }
  });

  test("an unplaceable location gets isIndia null, leaves the default feed, and is reachable via 'Unknown location'", async ({
    appPage: page,
  }) => {
    await runBackfill(page);
    await gotoJobs(page);

    const ids = await page
      .locator("[data-job-id]")
      .evaluateAll((els) =>
        els
          .map((el) => el.getAttribute("data-job-id"))
          .filter((id): id is string => Boolean(id)),
      );
    expect(ids.length).toBeGreaterThan(0);
    const victim = ids[0] as string;
    const original = await getJob(page, victim);
    expect(original.isIndia).toBe(true);

    try {
      await setLocation(page, victim, UNPLACEABLE);

      // Rule 6, through the update path: null, never false.
      const after = await getJob(page, victim);
      expect(after.location).toBe(UNPLACEABLE);
      expect(after.isIndia).toBeNull();
      expect(after.locationMetro).toBeNull();

      // Gone from the default feed…
      await gotoJobs(page);
      await expect(page.locator(`[data-job-id="${victim}"]`)).toHaveCount(0);

      // …present in the Unknown bucket, wearing the badge that says why.
      await toggleBucket(page, "unknown");
      const card = page.locator(`[data-job-id="${victim}"]`);
      await expect(card).toBeVisible();
      await expect(card.getByText("Unknown location")).toBeVisible();
      await expect(card.getByText(UNPLACEABLE)).toBeVisible();

      // Selecting a bucket is a change from the defaults, so it now counts.
      await expect(
        page.getByRole("button", { name: /clear all/i }).first(),
      ).toBeVisible();

      // 'India only' is an AND on top: it drops the unknown row again.
      await page.getByLabel(/india only/i).click();
      await expect(page.locator(`[data-job-id="${victim}"]`)).toHaveCount(0);
      expect(await headerCount(page)).toBe(
        await apiTotal(
          page,
          "&isIndia=true&locations=NCR&locations=Bengaluru&locations=Hyderabad&locations=Pune&locations=remote&locations=unknown",
        ),
      );
    } finally {
      await setLocation(page, victim, original.location ?? "");
    }

    const restored = await getJob(page, victim);
    expect(restored.location).toBe(original.location);
    expect(restored.isIndia).toBe(true);
    expect(restored.locationMetro).toBe(original.locationMetro);
  });

  test("'All locations' restores the unfiltered count exactly", async ({
    appPage: page,
  }) => {
    await runBackfill(page);
    await gotoJobs(page);

    const unfiltered = await apiTotal(page, "");
    const responded = page.waitForResponse(
      (r) =>
        r.url().includes("/api/jobs?") &&
        !r.url().includes("locations=") &&
        r.request().method() === "GET",
    );
    await page.getByRole("button", { name: "All locations" }).first().click();
    await responded;

    for (const key of BUCKET_KEYS.filter((k) => k !== "abroad")) {
      await expect(bucket(page, key)).toHaveAttribute("aria-pressed", "false");
    }
    expect(await headerCount(page)).toBe(unfiltered);
  });
});
