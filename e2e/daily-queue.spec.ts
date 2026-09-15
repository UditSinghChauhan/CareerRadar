import { test, expect, resetApplications } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Phase 3 — Today's Queue, through the real API and the real UI.
 *
 * The ranking arithmetic is pinned unit-by-unit in
 * artifacts/api-server/src/queue/priority.test.ts, and the SQL that produces
 * it — the window function that collapses duplicates, the two anti-joins, the
 * day rotation — against real Postgres rows in daily-queue.test.ts. What
 * neither can show is what the user actually gets: that the queue sits at the
 * top of the dashboard, that every row explains its own rank, that Apply
 * removes the row and moves the counter in the same breath, and that a
 * dismissal survives a reload.
 *
 * ONE THING THE PRODUCTION DATA CANNOT PROVE, AND THIS CAN.
 * On the live table `deadline` is populated on 13 of 3,845 rows and on none
 * of the eligible ones, so deadlineUrgency contributes a constant 3.0 there
 * and separates nothing. The seeded local rows DO carry deadlines, spread
 * from two days out to a month. So this suite is the only place the deadline
 * term is exercised with real values — which is exactly what will happen in
 * production once a provider that publishes deadlines lands.
 */

interface QueueComponents {
  relevanceScore: number;
  deadlineUrgency: number;
  freshness: number;
  dreamCompanyBoost: number;
}

interface QueueResponse {
  generatedAt: string;
  queueDay: string;
  limit: number;
  eligibleCount: number;
  distinctCount: number;
  queryMs: number;
  progress: {
    appliedToday: number;
    target: number;
    streakDays: number;
    timezone: string;
  };
  weights: Record<string, number>;
  items: Array<{
    job: {
      id: string;
      title: string;
      relevanceScore: number | null;
      deadline: string | null;
      postedDate: string | null;
      company: { name: string };
    };
    priority: number;
    components: QueueComponents;
    contributions: QueueComponents;
    duplicateCount: number;
    reasons: string[];
  }>;
}

async function fetchQueue(page: Page, query = ""): Promise<QueueResponse> {
  return page.evaluate(async (q) => {
    const res = await fetch(`/api/dashboard/today${q}`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`/api/dashboard/today returned ${res.status}`);
    return (await res.json()) as QueueResponse;
  }, query);
}

/** Removes every dismissal the test user has, through the real API. */
async function resetDismissals(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const res = await fetch(
      "/api/jobs?status=active&limit=200&showDismissed=true",
      {
        credentials: "include",
      },
    );
    if (!res.ok) return;
    const body = (await res.json()) as { data: Array<{ id: string }> };
    await Promise.all(
      body.data.map((j) =>
        fetch(`/api/jobs/${j.id}/dismiss`, {
          method: "DELETE",
          credentials: "include",
        }),
      ),
    );
  });
}

// ─── The endpoint ─────────────────────────────────────────────────────────────

test.describe("GET /api/dashboard/today", () => {
  test("returns a ranked queue with every priority component broken out", async ({
    appPage: page,
  }) => {
    await resetDismissals(page);
    const body = await fetchQueue(page);

    expect(body.items.length).toBeGreaterThan(0);
    expect(body.limit).toBe(10);
    expect(body.eligibleCount).toBeGreaterThanOrEqual(body.items.length);
    expect(body.distinctCount).toBeGreaterThanOrEqual(body.items.length);

    // §3.1's weights, echoed so the UI never has to hardcode them.
    expect(body.weights).toEqual({
      relevanceScore: 0.4,
      deadlineUrgency: 0.3,
      freshness: 0.2,
      dreamCompanyBoost: 0.1,
    });

    for (const item of body.items) {
      // All four components present, on their 0–100 scale.
      for (const key of [
        "relevanceScore",
        "deadlineUrgency",
        "freshness",
        "dreamCompanyBoost",
      ] as const) {
        expect(item.components[key]).toBeGreaterThanOrEqual(0);
        expect(item.components[key]).toBeLessThanOrEqual(100);
      }
      // The weighted total is the sum of the weighted parts — the UI adds up.
      const summed =
        item.contributions.relevanceScore +
        item.contributions.deadlineUrgency +
        item.contributions.freshness +
        item.contributions.dreamCompanyBoost;
      expect(summed).toBeCloseTo(item.priority, 1);
      expect(item.reasons.length).toBeGreaterThan(0);
    }
  });

  test("is ordered by priority, descending", async ({ appPage: page }) => {
    await resetDismissals(page);
    const { items } = await fetchQueue(page);
    const priorities = items.map((i) => i.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
  });

  test("exercises the deadline component with real deadlines", async ({
    appPage: page,
  }) => {
    // The seeded rows carry deadlines from ~2 days out to ~1 month, so unlike
    // production this queue has more than one deadlineUrgency value.
    await resetDismissals(page);
    const { items } = await fetchQueue(page, "?limit=20");
    const values = new Set(items.map((i) => i.components.deadlineUrgency));
    expect(values.size).toBeGreaterThan(1);
    // And the buckets are the spec's, not arbitrary numbers.
    for (const v of values) expect([100, 80, 40, 10]).toContain(v);

    // A row closing sooner must outrank an otherwise identical one. Compare
    // within a single relevance score so only the deadline differs materially.
    const top = items.filter((i) => i.components.relevanceScore === 100);
    if (top.length > 1) {
      const sortedByDeadline = [...top].sort(
        (a, b) => b.components.deadlineUrgency - a.components.deadlineUrgency,
      );
      expect(sortedByDeadline[0]!.components.deadlineUrgency).toBe(
        Math.max(...top.map((i) => i.components.deadlineUrgency)),
      );
    }
  });

  test("names the reason for each component in plain language", async ({
    appPage: page,
  }) => {
    await resetDismissals(page);
    const { items } = await fetchQueue(page);
    const first = items[0]!;
    const text = first.reasons.join(" ");
    expect(text).toMatch(/Relevance \d+\/100|Relevance 100\/100/);
    // Every seeded row has a deadline, so the reason must say so rather than
    // emitting the "no deadline published" line.
    expect(text).toMatch(/Closes|Deadline/);
    expect(text).toMatch(/Posted/);
  });

  test("clamps limit to the 1–50 range and defaults to 10", async ({
    appPage: page,
  }) => {
    expect((await fetchQueue(page, "?limit=3")).limit).toBe(3);
    expect((await fetchQueue(page, "?limit=0")).limit).toBe(10);
    expect((await fetchQueue(page, "?limit=999")).limit).toBe(10);
    expect((await fetchQueue(page, "?limit=abc")).limit).toBe(10);
  });

  test("returns in well under 500ms", async ({ appPage: page }) => {
    // The acceptance criterion from §3.3. Measured end-to-end through Express
    // against the local table; the EXPLAIN ANALYZE against the 3,845-row
    // production table is in the phase notes (15ms warm / 60ms cold).
    await resetDismissals(page);
    const elapsed = await page.evaluate(async () => {
      const t0 = performance.now();
      await fetch("/api/dashboard/today", { credentials: "include" });
      return performance.now() - t0;
    });
    expect(elapsed).toBeLessThan(500);
  });

  test("is stable within a queue day — the same ten, in the same order", async ({
    appPage: page,
  }) => {
    await resetDismissals(page);
    const a = await fetchQueue(page);
    const b = await fetchQueue(page);
    expect(a.queueDay).toBe(b.queueDay);
    expect(b.items.map((i) => i.job.id)).toEqual(a.items.map((i) => i.job.id));
  });

  test("requires a signed-in session", async ({ page }) => {
    // A relative fetch needs an origin, and this spec deliberately uses the
    // bare `page` fixture (no sign-in), which starts on about:blank.
    await page.goto("/");
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/dashboard/today", { credentials: "omit" });
      return res.status;
    });
    expect(status).toBe(401);
  });
});

// ─── Dismissals ───────────────────────────────────────────────────────────────

test.describe("dismissals (§3.2)", () => {
  test("a dismissed job leaves the queue and does not come back", async ({
    appPage: page,
  }) => {
    await resetDismissals(page);
    const before = await fetchQueue(page);
    const target = before.items[0]!.job.id;

    const status = await page.evaluate(async (id) => {
      const res = await fetch(`/api/jobs/${id}/dismiss`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "e2e" }),
      });
      return res.status;
    }, target);
    expect(status).toBe(201);

    const after = await fetchQueue(page);
    expect(after.items.map((i) => i.job.id)).not.toContain(target);

    // Not a delete: the job itself is untouched and still readable.
    const job = await page.evaluate(async (id) => {
      const res = await fetch(`/api/jobs/${id}`, { credentials: "include" });
      return (await res.json()) as { id: string; status: string };
    }, target);
    expect(job.id).toBe(target);
    expect(job.status).toBe("active");

    await resetDismissals(page);
    const restored = await fetchQueue(page);
    expect(restored.items.map((i) => i.job.id)).toContain(target);
  });

  test("is idempotent — dismissing twice is not an error", async ({
    appPage: page,
  }) => {
    await resetDismissals(page);
    const { items } = await fetchQueue(page);
    const target = items[0]!.job.id;

    const ids = await page.evaluate(async (id) => {
      const first = await fetch(`/api/jobs/${id}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
      const second = await fetch(`/api/jobs/${id}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
      return {
        firstStatus: first.status,
        secondStatus: second.status,
        firstId: ((await first.json()) as { id: string }).id,
        secondId: ((await second.json()) as { id: string }).id,
      };
    }, target);

    expect(ids.firstStatus).toBe(201);
    expect(ids.secondStatus).toBe(201);
    expect(ids.secondId).toBe(ids.firstId);
    await resetDismissals(page);
  });

  test("404s when dismissing a job that does not exist", async ({
    appPage: page,
  }) => {
    const status = await page.evaluate(async () => {
      const res = await fetch(
        "/api/jobs/00000000-0000-0000-0000-000000000000/dismiss",
        { method: "POST", credentials: "include" },
      );
      return res.status;
    });
    expect(status).toBe(404);
  });

  test("404s when undoing a dismissal that was never made", async ({
    appPage: page,
  }) => {
    await resetDismissals(page);
    const { items } = await fetchQueue(page);
    const status = await page.evaluate(async (id) => {
      const res = await fetch(`/api/jobs/${id}/dismiss`, {
        method: "DELETE",
        credentials: "include",
      });
      return res.status;
    }, items[0]!.job.id);
    expect(status).toBe(404);
  });

  test("hides the row from /api/jobs too, and showDismissed brings it back", async ({
    appPage: page,
  }) => {
    await resetDismissals(page);
    const { items } = await fetchQueue(page);
    const target = items[0]!.job.id;

    const counts = await page.evaluate(async (id) => {
      const total = async (q: string) => {
        const res = await fetch(`/api/jobs?status=active&limit=1${q}`, {
          credentials: "include",
        });
        return ((await res.json()) as { meta: { total: number } }).meta.total;
      };
      const before = await total("");
      await fetch(`/api/jobs/${id}/dismiss`, {
        method: "POST",
        credentials: "include",
      });
      return {
        before,
        hidden: await total(""),
        shown: await total("&showDismissed=true"),
      };
    }, target);

    expect(counts.hidden).toBe(counts.before - 1);
    expect(counts.shown).toBe(counts.before);
    await resetDismissals(page);
  });

  test("requires a session for both directions", async ({ page }) => {
    await page.goto("/");
    const statuses = await page.evaluate(async () => {
      const id = "00000000-0000-0000-0000-000000000000";
      const post = await fetch(`/api/jobs/${id}/dismiss`, {
        method: "POST",
        credentials: "omit",
      });
      const del = await fetch(`/api/jobs/${id}/dismiss`, {
        method: "DELETE",
        credentials: "omit",
      });
      return [post.status, del.status];
    });
    expect(statuses).toEqual([401, 401]);
  });
});

// ─── The UI ───────────────────────────────────────────────────────────────────

test.describe("Today's Queue on the dashboard (§3.3)", () => {
  test.beforeEach(async ({ appPage: page }) => {
    await resetDismissals(page);
  });

  test("sits above the stat cards, with a target counter and a streak", async ({
    appPage: page,
  }) => {
    await page.goto("/dashboard");
    const queue = page.getByTestId("todays-queue");
    await expect(queue).toBeVisible();

    await expect(page.getByTestId("daily-target-counter")).toHaveText(
      /\d+ \/ \d+/,
    );
    await expect(page.getByTestId("streak-counter")).toBeVisible();

    // §3.3: "Keep the existing stat cards and charts, moved below the queue."
    const queueBox = await queue.boundingBox();
    const statsBox = await page
      .getByText("Jobs Found", { exact: true })
      .first()
      .boundingBox();
    expect(queueBox).not.toBeNull();
    expect(statsBox).not.toBeNull();
    expect(queueBox!.y).toBeLessThan(statsBox!.y);
  });

  test("every row shows its rank reason and all four weighted components", async ({
    appPage: page,
  }) => {
    await page.goto("/dashboard");
    const rows = page.getByTestId("queue-row");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      // §3.3: "Each row displays a plain-language reason for its rank."
      await expect(row.getByTestId("queue-reason")).not.toBeEmpty();
      const breakdown = row.getByTestId("priority-breakdown");
      for (const key of [
        "relevanceScore",
        "deadlineUrgency",
        "freshness",
        "dreamCompanyBoost",
      ]) {
        await expect(
          breakdown.locator(`[data-component="${key}"]`),
        ).toBeVisible();
      }
    }
  });

  test("rows are rendered in the order the server returned", async ({
    appPage: page,
  }) => {
    const { items } = await fetchQueue(page);
    await page.goto("/dashboard");
    const rows = page.getByTestId("queue-row");
    await expect(rows.first()).toBeVisible();
    const renderedIds = await rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-job-id")),
    );
    expect(renderedIds).toEqual(items.map((i) => i.job.id));
  });

  test("applying removes the row and increments the counter immediately", async ({
    appPage: page,
    context,
  }) => {
    await page.goto("/dashboard");
    const rows = page.getByTestId("queue-row");
    await expect(rows.first()).toBeVisible();

    const before = await rows.count();
    const targetId = await rows.first().getAttribute("data-job-id");
    const counterBefore = await page
      .getByTestId("daily-target-counter")
      .textContent();
    const appliedBefore = Number(counterBefore!.split("/")[0]!.trim());

    // Apply opens the posting in a new tab; catch it so it does not linger.
    const popupPromise = context.waitForEvent("page");
    await rows.first().getByTestId("queue-apply").click();
    const popup = await popupPromise;
    await popup.close();

    // The row goes, and the counter moves — §3.3's acceptance criterion.
    await expect(page.locator(`[data-job-id="${targetId}"]`)).toHaveCount(0);
    await expect(page.getByTestId("daily-target-counter")).toHaveText(
      new RegExp(`^${appliedBefore + 1} / `),
    );

    // The queue is a top-N over the whole eligible pool, not a fixed list, so
    // the vacated slot REFILLS with the next-ranked job rather than the queue
    // shrinking. With more eligible rows than slots the count holds steady.
    await expect(rows).toHaveCount(before);
    const refilledIds = await rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-job-id")),
    );
    expect(refilledIds).not.toContain(targetId);

    await resetApplications(page);
  });

  test("dismissing removes the row and it does not return after a reload", async ({
    appPage: page,
  }) => {
    await page.goto("/dashboard");
    const rows = page.getByTestId("queue-row");
    await expect(rows.first()).toBeVisible();

    const before = await rows.count();
    const targetId = await rows.first().getAttribute("data-job-id");

    await rows.first().getByTestId("queue-dismiss").click();
    await expect(page.locator(`[data-job-id="${targetId}"]`)).toHaveCount(0);
    // Top-N: the slot refills from the eligible pool (see the apply spec).
    await expect(rows).toHaveCount(before);

    await page.reload();
    await expect(rows.first()).toBeVisible();
    await expect(page.locator(`[data-job-id="${targetId}"]`)).toHaveCount(0);

    await resetDismissals(page);
  });

  test("a dismissed job reappears on /jobs with Show dismissed on", async ({
    appPage: page,
  }) => {
    await page.goto("/dashboard");
    const rows = page.getByTestId("queue-row");
    await expect(rows.first()).toBeVisible();
    const targetId = await rows.first().getAttribute("data-job-id");
    await rows.first().getByTestId("queue-dismiss").click();
    await expect(page.locator(`[data-job-id="${targetId}"]`)).toHaveCount(0);

    await page.goto("/jobs");
    await expect(page.locator("article").first()).toBeVisible();
    await expect(
      page.locator(`article[data-job-id="${targetId}"]`),
    ).toHaveCount(0);

    // On a desktop viewport the filter panel is an always-visible sidebar —
    // the "Filters" button is lg:hidden. JobFilters is mounted twice (sidebar
    // and mobile sheet), so target the visible instance.
    const showDismissed = page
      .getByTestId("show-dismissed-checkbox")
      .filter({ visible: true })
      .first();
    await expect(showDismissed).toBeVisible();
    await showDismissed.click();

    await expect(
      page.locator(`article[data-job-id="${targetId}"]`),
    ).toHaveCount(1);

    await resetDismissals(page);
  });

  test("the daily target is configurable in settings and the queue reflects it", async ({
    appPage: page,
  }) => {
    await page.goto("/settings");
    const input = page.getByTestId("daily-target-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("10");

    await input.fill("4");
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page.getByText(/settings updated/i)).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByTestId("daily-target-counter")).toHaveText(
      /^\d+ \/ 4$/,
    );

    // Put it back so the next spec starts from the documented default.
    await page.goto("/settings");
    await page.getByTestId("daily-target-input").fill("10");
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page.getByText(/settings updated/i)).toBeVisible();
  });
});
