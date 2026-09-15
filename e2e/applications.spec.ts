import { test, expect, uncheckHideApplied } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Opens /jobs with the hide-applied filter switched OFF and the list settled.
 *
 * The filter defaults to ON, which removes a card from the list the moment its
 * status flips, so the flip would never be observable on the card we just
 * clicked. `uncheckHideApplied` also waits for the refetch the uncheck now
 * triggers — see its own note; without that wait, `.nth(index)` below can index
 * into the old, narrower list and act on a different job than the assertion
 * afterwards looks at.
 */
async function openJobsWithAppliedShown(page: Page): Promise<void> {
  await page.goto("/jobs");
  await expect(page.getByTestId("job-card").first()).toBeVisible();
  await uncheckHideApplied(page);
}

/** Applies to the nth job on /jobs and returns once its card has flipped. */
async function applyToJob(page: Page, index = 0): Promise<void> {
  await openJobsWithAppliedShown(page);

  const card = page.getByTestId("job-card").nth(index);
  await card.getByTestId("apply-button").click();
  await expect(card.getByTestId("application-status-badge")).toContainText(
    "Applied",
    { timeout: 15_000 },
  );
}

/** Saves (not applies) the nth job, producing a row with no applied date. */
async function saveJob(page: Page, index: number): Promise<void> {
  await openJobsWithAppliedShown(page);

  const card = page.getByTestId("job-card").nth(index);
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByTestId("application-status-badge")).toContainText(
    "Saved",
    { timeout: 15_000 },
  );
}

/**
 * HTML5 drag-and-drop against the board.
 *
 * Two things make this fiddly. Playwright's dragTo does not reliably fire the
 * native dragstart/dragover/drop sequence React listens for, so the events are
 * dispatched by hand. And they must be dispatched in *separate* evaluate calls:
 * the board records the dragged card in React state on dragstart, and a drop
 * fired in the same tick reads that state before React has committed it, so the
 * handler bails out and nothing moves.
 */
async function dragCardToColumn(
  page: Page,
  cardSelector: string,
  columnTestId: string,
): Promise<void> {
  await page.evaluate((selector) => {
    const card = document.querySelector(selector);
    if (!card) throw new Error(`drag source not found: ${selector}`);
    const dataTransfer = new DataTransfer();
    (window as unknown as { __dt: DataTransfer }).__dt = dataTransfer;
    card.dispatchEvent(
      new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer,
      }),
    );
  }, cardSelector);

  // Let React flush the dragstart state update before the drop reads it.
  await page.waitForTimeout(150);

  await page.evaluate((testId) => {
    const column = document.querySelector(`[data-testid="${testId}"]`);
    if (!column) throw new Error(`drop target not found: ${testId}`);
    const dataTransfer = (window as unknown as { __dt: DataTransfer }).__dt;
    for (const type of ["dragover", "drop"]) {
      column.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }),
      );
    }
  }, columnTestId);
}

test.describe("Applications tracker", () => {
  test("an applied job appears on /applications", async ({ appPage: page }) => {
    await applyToJob(page);

    await page.goto("/applications");
    await expect(
      page.getByRole("heading", { name: "Applications" }),
    ).toBeVisible();

    const cards = page.getByTestId("board-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBe(1);
  });

  test("dragging a card between board columns persists across reload", async ({
    appPage: page,
  }) => {
    await applyToJob(page);
    await page.goto("/applications");

    const card = page.getByTestId("board-card").first();
    await expect(card).toBeVisible();
    const appId = await card.getAttribute("data-application-id");

    // Applied -> Interview.
    await dragCardToColumn(
      page,
      `[data-application-id="${appId}"]`,
      "board-column-interview_pending",
    );

    const interviewColumn = page.getByTestId("board-column-interview_pending");
    await expect(interviewColumn.getByTestId("board-card")).toHaveCount(1);

    await page.reload();
    await expect(
      page
        .getByTestId("board-column-interview_pending")
        .getByTestId("board-card"),
    ).toHaveCount(1);
    await expect(
      page.getByTestId("board-column-applied").getByTestId("board-card"),
    ).toHaveCount(0);
  });

  test("board/table view choice persists across reload", async ({
    appPage: page,
  }) => {
    await applyToJob(page);
    await page.goto("/applications");

    // Board is the default.
    await expect(page.getByRole("button", { name: "Board" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Table" }).click();
    await expect(page.getByTestId("application-row").first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Table" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("application-row").first()).toBeVisible();

    // And back again, so the assertion is not passing on a stuck value.
    await page.getByRole("button", { name: "Board" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Board" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("the drawer shows deadline read-only and saves notes", async ({
    appPage: page,
  }) => {
    await applyToJob(page);
    await page.goto("/applications");

    await page.getByTestId("board-card").first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Deadline is rendered as static text, not an editable control.
    await expect(
      dialog.getByText("Set by the job posting — not editable here."),
    ).toBeVisible();
    await expect(dialog.getByLabel("Deadline")).toHaveCount(0);

    // The editable fields that Phase 1.4 does specify are present.
    await expect(dialog.getByLabel("Applied date")).toBeVisible();
    await expect(dialog.getByLabel("Next action date")).toBeVisible();

    const notes = "Referred by a senior; OA on HackerRank.";
    await dialog.getByLabel("Notes").fill(notes);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).not.toBeVisible();

    await page.reload();
    await page.getByTestId("board-card").first().click();
    await expect(page.getByRole("dialog").getByLabel("Notes")).toHaveValue(
      notes,
    );
  });

  test("sorting by applied date in both directions keeps undated rows last", async ({
    appPage: page,
  }) => {
    // Two applied rows (dated) plus one saved row (undated).
    await applyToJob(page, 0);
    await applyToJob(page, 1);
    await saveJob(page, 2);

    await page.goto("/applications");
    await page.getByRole("button", { name: "Table" }).click();
    await expect(page.getByTestId("application-row")).toHaveCount(3);

    const appliedDates = async () =>
      page
        .getByTestId("application-row")
        .evaluateAll((rows) =>
          rows.map((r) => (r as HTMLElement).dataset.appliedDate ?? ""),
        );

    const sortButton = page.getByRole("button", { name: "Sort by Applied" });

    await sortButton.click();
    const asc = await appliedDates();
    await sortButton.click();
    const desc = await appliedDates();

    // The undated row sits last no matter which way the column is sorted.
    expect(asc.at(-1)).toBe("");
    expect(desc.at(-1)).toBe("");
    expect(asc.filter(Boolean).length).toBe(2);

    // And the dated rows genuinely reversed between the two clicks.
    expect(desc.filter(Boolean)).toEqual([...asc.filter(Boolean)].reverse());
  });
});
