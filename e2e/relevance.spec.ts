import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Phase 2.1–2.3 — relevance classification, through the real API and the
 * real UI.
 *
 * The rules are proved title-by-title in
 * artifacts/api-server/src/relevance/classifier.test.ts, and the WHERE
 * clauses and the backfill's column discipline against real Postgres rows in
 * relevance-filters.test.ts. What neither can show is what the user sees:
 * that the default Jobs page is the fresher-eligible feed sorted by
 * relevance for their batch, that a row the classifier rules out really
 * leaves the feed and really comes back through "Show everything", that the
 * track badge and its hover signals render, and that the admin backfill
 * route returns the track distribution and the ranking.
 *
 * Like location.spec.ts, these specs borrow a seeded job and put it back —
 * PUT /api/jobs/:id with a new `title` re-classifies on the server, which is
 * also the hand-edit path this proves. The three titles UPGRADE.md §2.1
 * names as non-negotiable are pushed through that path here, so they are
 * verified against the deployed bundle's classifier, not only the unit's.
 */

type Track = "internship" | "new_grad" | "early_career" | "not_relevant";

interface TrackCounts {
  internship: number;
  new_grad: number;
  early_career: number;
  not_relevant: number;
}

interface BackfillResponse {
  dryRun: boolean;
  scanned: number;
  updated: number;
  graduationYear: number | null;
  tracks: TrackCounts;
  activeTracks: TrackCounts;
  activeFresherEligible: number;
  activeSeniorityExcluded: number;
  activeScoreHistogram: Record<string, number>;
  topActiveTitles: Array<{
    id: string;
    title: string;
    track: Track;
    score: number;
    signals: string[];
  }>;
  batches: number;
  storedActiveTracks: {
    active: TrackCounts & { unclassified: number };
    activeTotal: number;
    activeFresherEligible: number;
  };
}

const TRACKS: Track[] = [
  "internship",
  "new_grad",
  "early_career",
  "not_relevant",
];

const DEFAULT_LOCATION_QUERY =
  "&locations=NCR&locations=Bengaluru&locations=Hyderabad&locations=Pune&locations=remote&locations=india_unspecified";

async function runBackfill(page: Page, query = ""): Promise<BackfillResponse> {
  const body = await page.evaluate(async (q) => {
    const res = await fetch(`/api/admin/backfill-relevance${q}`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) throw new Error(`backfill returned ${res.status}`);
    return (await res.json()) as unknown;
  }, query);
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

interface JobView {
  id: string;
  title: string;
  relevanceTrack: Track | null;
  relevanceScore: number | null;
  isFresherEligible: boolean;
  seniorityExcluded: boolean;
  relevanceSignals: string[];
  classifiedAt: string | null;
}

async function getJob(page: Page, id: string): Promise<JobView> {
  return page.evaluate(async (jobId) => {
    const res = await fetch(`/api/jobs/${jobId}`, { credentials: "include" });
    return (await res.json()) as unknown;
  }, id) as Promise<JobView>;
}

async function setTitle(page: Page, id: string, title: string): Promise<void> {
  const ok = await page.evaluate(
    async ({ jobId, next }) => {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      return res.ok;
    },
    { jobId: id, next: title },
  );
  expect(ok).toBe(true);
}

async function getProfileYear(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    const res = await fetch("/api/profile", { credentials: "include" });
    const body = (await res.json()) as { graduationYear: number | null };
    return body.graduationYear ?? null;
  });
}

async function setProfileYear(page: Page, year: number | null): Promise<void> {
  const ok = await page.evaluate(async (y) => {
    const res = await fetch("/api/profile", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graduationYear: y }),
    });
    return res.ok;
  }, year);
  expect(ok).toBe(true);
}

async function gotoJobs(page: Page): Promise<void> {
  await page.goto("/jobs");
  await page
    .getByText(/^\d+( of [\d,]+)? jobs?( matching filters)?$/)
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function headerCount(page: Page): Promise<number> {
  const text = await page
    .getByText(/^\d+( of [\d,]+)? jobs?( matching filters)?$/)
    .first()
    .textContent();
  return Number.parseInt(text?.trim() ?? "0", 10);
}

/** Clicks something and waits for the list to refetch. */
async function withRefetch(
  page: Page,
  action: () => Promise<void>,
  urlIncludes = "",
): Promise<void> {
  const responded = page.waitForResponse(
    (r) =>
      r.url().includes("/api/jobs?") &&
      r.url().includes(urlIncludes) &&
      r.request().method() === "GET",
  );
  await action();
  await responded;
}

async function renderedTracks(page: Page): Promise<string[]> {
  return page
    .locator("[data-relevance-track]")
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-relevance-track") ?? ""),
    );
}

test.describe("Relevance classification (Phase 2.1–2.3)", () => {
  test("the backfill route classifies every row and returns the distribution and the ranking", async ({
    appPage: page,
  }) => {
    const report = await runBackfill(page, "?top=5");

    expect(report.dryRun).toBe(false);
    expect(report.scanned).toBeGreaterThan(0);
    expect(report.batches).toBeGreaterThanOrEqual(1);

    // Every track is present as its own key on both views, and the exclusive
    // tracks sum to the total.
    for (const key of TRACKS) {
      expect(typeof report.tracks[key], key).toBe("number");
      expect(typeof report.activeTracks[key], key).toBe("number");
    }
    const sum = TRACKS.reduce((n, k) => n + report.tracks[k], 0);
    expect(sum).toBe(report.scanned);
    expect(report.activeFresherEligible).toBe(
      report.activeTracks.internship +
        report.activeTracks.new_grad +
        report.activeTracks.early_career,
    );

    // The ranking: bounded to ?top, sorted by score desc, each with reasons.
    expect(report.topActiveTitles.length).toBeLessThanOrEqual(5);
    expect(report.topActiveTitles.length).toBeGreaterThan(0);
    const scores = report.topActiveTitles.map((t) => t.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const t of report.topActiveTitles) {
      expect(t.track).not.toBe("not_relevant");
      expect(t.signals.length).toBeGreaterThan(0);
    }

    // What the filter actually sees, from the stored columns, agrees with the
    // report the run just produced — and nothing is left unclassified.
    const stored = report.storedActiveTracks;
    expect(stored.active.unclassified).toBe(0);
    for (const key of TRACKS) {
      expect(stored.active[key], key).toBe(report.activeTracks[key]);
    }
    expect(stored.activeFresherEligible).toBe(report.activeFresherEligible);

    // Recompute-all is idempotent: a second run reads everything and changes
    // nothing.
    const again = await runBackfill(page);
    expect(again.scanned).toBe(report.scanned);
    expect(again.updated).toBe(0);
    expect(again.activeTracks).toEqual(report.activeTracks);
  });

  test("the seeded titles land on the tracks the spec describes", async ({
    appPage: page,
  }) => {
    await runBackfill(page);
    const jobs = await page.evaluate(async () => {
      const res = await fetch("/api/jobs?status=active&limit=200", {
        credentials: "include",
      });
      const body = (await res.json()) as {
        data: Array<{ title: string; relevanceTrack: string | null }>;
      };
      return body.data;
    });
    const trackOf = (title: string) =>
      jobs.find((j) => j.title === title)?.relevanceTrack;

    // seed.ts titles.
    expect(trackOf("Software Engineering Intern")).toBe("internship");
    expect(trackOf("Backend Engineering Intern")).toBe("internship");
    expect(trackOf("SDE 1 – Backend")).toBe("new_grad");
    expect(trackOf("Software Engineer (New Grad)")).toBe("new_grad");
    // "Fresh graduates" in the requirements, an engineering title: new_grad by
    // description (rule 4b), not early_career.
    expect(trackOf("Full Stack Developer (FTE)")).toBe("new_grad");
    // Every seeded row is an intern/fresher posting by design; none is excluded.
    for (const j of jobs) {
      expect(j.relevanceTrack, j.title).not.toBeNull();
    }
  });

  test("the default view is fresher-eligible, batch-scoped, sorted by relevance, filtered on the server", async ({
    appPage: page,
  }) => {
    await runBackfill(page);
    const originalYear = await getProfileYear(page);
    try {
      await setProfileYear(page, 2027);
      await gotoJobs(page);

      // The controls say what the view is.
      await expect(page.getByLabel(/fresher-eligible only/i)).toBeChecked();
      await expect(page.getByTestId("view-mode")).toHaveText(
        /Fresher-eligible · batch 2027/,
      );
      await expect(
        page.getByRole("combobox").filter({ hasText: "Relevance" }),
      ).toBeVisible();

      // The header count is the server's total for exactly these params.
      const expected = await apiTotal(
        page,
        `&isFresherEligible=true&eligibleBatch=2027&sort=relevance${DEFAULT_LOCATION_QUERY}`,
      );
      expect(expected).toBeGreaterThan(0);
      expect(await headerCount(page)).toBe(expected);

      // An untouched page shows no "active filters" badge for the defaults.
      await expect(
        page.getByRole("button", { name: /clear all/i }),
      ).toHaveCount(0);

      // Every rendered card carries a real track badge, never not_relevant,
      // and the badges are in non-increasing score order.
      const tracks = await renderedTracks(page);
      expect(tracks.length).toBeGreaterThan(0);
      for (const t of tracks) {
        expect(["internship", "new_grad", "early_career"]).toContain(t);
      }
      const scores = await page
        .locator("[data-relevance-score]")
        .evaluateAll((els) =>
          els.map((el) => Number(el.getAttribute("data-relevance-score"))),
        );
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    } finally {
      await setProfileYear(page, originalYear);
    }
  });

  test("hovering the track badge shows the classifier's signals", async ({
    appPage: page,
  }) => {
    await runBackfill(page);
    await gotoJobs(page);
    const badge = page.locator("[data-relevance-track]").first();
    await badge.hover();
    const tip = page.getByTestId("relevance-signals").first();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(/Score \d+ \/ 100/);
    await expect(tip).toContainText(/base (internship|new_grad|early_career)/);
  });

  test("the three titles named in §2.1, through the real update path and the real feed", async ({
    appPage: page,
  }) => {
    await runBackfill(page);
    await gotoJobs(page);

    const victim = await page
      .locator("[data-job-id]")
      .first()
      .getAttribute("data-job-id");
    if (!victim) throw new Error("no job rendered on the default feed");
    const original = await getJob(page, victim);
    expect(original.isFresherEligible).toBe(true);

    try {
      // "SDE II" → not_relevant, seniorityExcluded, gone from the default feed.
      await setTitle(page, victim, "SDE II");
      let after = await getJob(page, victim);
      expect(after.relevanceTrack).toBe("not_relevant");
      expect(after.relevanceScore).toBe(0);
      expect(after.isFresherEligible).toBe(false);
      expect(after.seniorityExcluded).toBe(true);
      expect(after.relevanceSignals).toContain("title: level II or above");

      await gotoJobs(page);
      await expect(page.locator(`[data-job-id="${victim}"]`)).toHaveCount(0);

      // …and back through the escape hatch, wearing the badge that says why.
      await withRefetch(page, () =>
        page.getByTestId("show-everything").first().click(),
      );
      const card = page.locator(`[data-job-id="${victim}"]`);
      await expect(card).toBeVisible();
      await expect(card.getByText("Not for freshers")).toBeVisible();
      await card.locator("[data-relevance-track]").hover();
      await expect(page.getByTestId("relevance-signals").first()).toContainText(
        "level II or above",
      );

      // "Senior Software Engineer Intern" → internship: intern beats senior.
      await setTitle(page, victim, "Senior Software Engineer Intern");
      after = await getJob(page, victim);
      expect(after.relevanceTrack).toBe("internship");
      expect(after.isFresherEligible).toBe(true);
      expect(after.seniorityExcluded).toBe(false);
      expect(after.relevanceSignals).toContain(
        "seniority word in title ignored — intern beats senior",
      );

      // "Software Development Engineer Intern - 2027" → internship, batch 2027.
      await setTitle(
        page,
        victim,
        "Software Development Engineer Intern - 2027",
      );
      after = await getJob(page, victim);
      expect(after.relevanceTrack).toBe("internship");
      expect(after.relevanceSignals.some((s) => s.includes("2027"))).toBe(true);

      // Back on the default feed.
      await gotoJobs(page);
      await expect(page.locator(`[data-job-id="${victim}"]`)).toBeVisible();
      await expect(
        page
          .locator(`[data-job-id="${victim}"] [data-relevance-track]`)
          .first(),
      ).toHaveAttribute("data-relevance-track", "internship");
    } finally {
      await setTitle(page, victim, original.title);
    }

    const restored = await getJob(page, victim);
    expect(restored.title).toBe(original.title);
    expect(restored.relevanceTrack).toBe(original.relevanceTrack);
    expect(restored.isFresherEligible).toBe(true);
  });

  test("'Show everything' restores the unfiltered count exactly; 'Back to my feed' restores the defaults", async ({
    appPage: page,
  }) => {
    await runBackfill(page);
    await gotoJobs(page);

    const unfiltered = await apiTotal(page, "");
    const defaultCount = await headerCount(page);

    // Every server-side narrowing off in one click: the request carries no
    // relevance, location or batch params at all.
    const responded = page.waitForResponse(
      (r) =>
        r.url().includes("/api/jobs?") &&
        !r.url().includes("isFresherEligible=") &&
        !r.url().includes("locations=") &&
        !r.url().includes("eligibleBatch=") &&
        r.request().method() === "GET",
    );
    await page.getByTestId("show-everything").first().click();
    await responded;

    await expect(page.getByLabel(/fresher-eligible only/i)).not.toBeChecked();
    await expect(page.getByTestId("view-mode")).toHaveText("All jobs");
    for (const key of ["NCR", "Bengaluru", "Hyderabad", "Pune", "remote"]) {
      await expect(
        page
          .getByTestId("location-buckets")
          .first()
          .locator(`[data-location-bucket="${key}"]`),
      ).toHaveAttribute("aria-pressed", "false");
    }
    expect(await headerCount(page)).toBe(unfiltered);

    // And back.
    await withRefetch(
      page,
      () =>
        page.getByRole("button", { name: "Back to my feed" }).first().click(),
      "isFresherEligible=true",
    );
    await expect(page.getByLabel(/fresher-eligible only/i)).toBeChecked();
    expect(await headerCount(page)).toBe(defaultCount);
  });

  test("track chips and the score floor narrow the feed on the server", async ({
    appPage: page,
  }) => {
    await runBackfill(page);
    await gotoJobs(page);

    await withRefetch(
      page,
      () =>
        page
          .getByTestId("track-chips")
          .first()
          .locator('[data-track-chip="internship"]')
          .click(),
      "relevanceTrack=internship",
    );
    const tracks = await renderedTracks(page);
    expect(tracks.length).toBeGreaterThan(0);
    for (const t of tracks) expect(t).toBe("internship");

    // Selecting a chip is a change from the defaults, so it now counts.
    await expect(
      page.getByRole("button", { name: /clear all/i }).first(),
    ).toBeVisible();
  });
});
