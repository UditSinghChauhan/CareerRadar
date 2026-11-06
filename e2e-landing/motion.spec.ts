import { expect, test, type Page } from "@playwright/test";

/**
 * The landing's motion system (DESIGN.md, Motion), measured in a real
 * browser against a built landing (see playwright.landing.config.ts):
 *
 *   - ambient: with no input, at least 15 things in the hero visibly move
 *     over 1.5s (each sample card on its own loop, each dotted ring turning),
 *     and nothing moves under prefers-reduced-motion;
 *   - the loops pause when the hero is off screen or the tab is hidden;
 *   - the entrance is over within 1.2s of the hero's first paint;
 *   - at rest, at most 40 time-based animations run in the viewport.
 *
 * Before this change the hero had no ambient motion at all: the first test
 * found 0 moving things at both sizes.
 */

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];

/** Positions of each hero card and the turn of the dotted rings. */
function sampleHero(page: Page) {
  return page.evaluate(() => {
    const onScreen = (r: DOMRect) =>
      r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const cards = [...document.querySelectorAll(".lp-hero .lp-rolecard")]
      .map((e) => e.getBoundingClientRect())
      .filter(onScreen)
      .map((r) => [r.x, r.y]);
    const spin = document.querySelector(".lp-rings-spin");
    const rings = spin
      ? [...spin.querySelectorAll("circle")].filter((c) =>
          onScreen(c.getBoundingClientRect()),
        ).length
      : 0;
    const m = spin ? new DOMMatrix(getComputedStyle(spin).transform) : null;
    const turn = m ? (Math.atan2(m.b, m.a) * 180) / Math.PI : 0;
    return { cards, rings, turn };
  });
}

async function movingInHero(page: Page) {
  const a = await sampleHero(page);
  await page.waitForTimeout(1500);
  const b = await sampleHero(page);
  const cards = a.cards.filter(
    ([x, y], i) => Math.hypot(x - b.cards[i][0], y - b.cards[i][1]) > 0.5,
  ).length;
  // A dotted ring 300px out moves about 4px in 1.5s at one turn per 120s.
  const ringsTurn = Math.abs(b.turn - a.turn) > 0.5;
  return {
    cards,
    rings: ringsTurn ? a.rings : 0,
    total: cards + (ringsTurn ? a.rings : 0),
  };
}

for (const size of SIZES) {
  test(`the hero is alive at rest at ${size.width}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: size });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator(".lp-hero .lp-rolecard").first().waitFor();
    await page.waitForTimeout(1500);
    const moving = await movingInHero(page);
    expect(moving.total, JSON.stringify(moving)).toBeGreaterThanOrEqual(15);
    await ctx.close();
  });

  test(`nothing moves under reduced motion at ${size.width}px`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      viewport: size,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto("/", { waitUntil: "networkidle" });
    await page.locator(".lp-hero .lp-rolecard").first().waitFor();
    await page.waitForTimeout(500);
    const moving = await movingInHero(page);
    expect(moving.total, JSON.stringify(moving)).toBe(0);
    const running = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    );
    expect(running).toBe(0);
    await ctx.close();
  });
}

test("the ambient loops pause off screen and in a hidden tab", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".lp-hero .lp-rolecard").first().waitFor();
  const states = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) =>
          ["lp-drift", "lp-spin"].includes(
            (a as CSSAnimation).animationName ?? "",
          ),
        )
        .map((a) => a.playState),
    );
  expect(new Set(await states())).toEqual(new Set(["running"]));

  // Hidden tab.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  expect(new Set(await states())).toEqual(new Set(["paused"]));
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  expect(new Set(await states())).toEqual(new Set(["running"]));

  // Off screen.
  await page.evaluate(() => window.scrollTo(0, 2400));
  await page.waitForTimeout(300);
  expect(new Set(await states())).toEqual(new Set(["paused"]));
});

test("the entrance is over within 1.2s and the idle budget holds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".lp-hero .lp-rolecard").first().waitFor();
  const timing = await page.evaluate(() => {
    const born = window.__lpBorn ?? 0;
    const ends = document
      .getAnimations()
      .filter((a) =>
        ["lp-fade", "lp-rise", "lp-lift", "lp-reveal", "lp-focus-in"].includes(
          (a as CSSAnimation).animationName ?? "",
        ),
      )
      .map((a) => {
        const t = a.effect!.getComputedTiming();
        return Number(a.startTime) + Number(t.endTime) - born;
      });
    return { count: ends.length, last: Math.max(...ends) };
  });
  expect(timing.count).toBeGreaterThan(10);
  // The headline lifts line by line: its words are numbered from line 0
  // across at least two lines.
  const lines = await page.evaluate(() =>
    [...document.querySelectorAll(".lp-hero .lp-w")].map((w) =>
      Number((w as HTMLElement).style.getPropertyValue("--line")),
    ),
  );
  expect(lines[0]).toBe(0);
  expect(Math.max(...lines)).toBeGreaterThanOrEqual(1);
  expect(
    timing.last,
    "the entrance's last frame, ms after first paint",
  ).toBeLessThanOrEqual(1200);

  await page.waitForTimeout(1500);
  const live = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => {
        if (a.timeline !== document.timeline || a.playState !== "running")
          return false;
        const t = (a.effect as KeyframeEffect).target as Element;
        const r = t.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight;
      }).length,
  );
  expect(live).toBeLessThanOrEqual(40);
});

declare global {
  interface Window {
    __lpBorn?: number;
  }
}
