import { expect, test, type Page } from "@playwright/test";

/**
 * The landing must never shake while it scrolls (DESIGN.md, Motion).
 *
 * At 1440x900 the mouse wheel scrolls the page from 0 to 1600px and back.
 * Every animation frame the page records, for three elements, where they sit
 * relative to their own section:
 *
 *   - the hero copy (.lp-hero__text, in .lp-hero): its one declared motion is
 *     the scroll fade, a lift of at most 16px that follows the scroll, so it
 *     stays within 16px of rest and never moves against the scroll direction;
 *   - the statement's column (.lp-focus__text, in .lp-focus): no declared
 *     motion, so it never moves more than 1px between two frames;
 *   - the statement itself (.lp-statement, in .lp-focus): its one declared
 *     motion is the settle, a scroll-linked rise of at most 12px, so it
 *     stays within 12px below rest, moves up only while the page scrolls
 *     down, down only while it scrolls up, and never at rest;
 *   - the "Today's ten" card (.lp-queue, in .lp-focus): its one declared
 *     motion is the reveal, a 12px rise played once, so it stays within 12px
 *     below rest and never moves down.
 *
 * It also asserts, every frame, that there is no flying copy of a card, that
 * no sample card exists twice, that the ten rows are all in the list, and
 * that the card's frame is never visible without its first row.
 *
 * Runs against a built landing: LANDING_URL, by default a `vite preview` on
 * port 5198 (see playwright.landing.config.ts).
 */

const TOL = 1;
const LIFT = 16;
const RISE = 12;
const SETTLE = 12;

type Box = { x: number; y: number };
type Sample = {
  t: number;
  scrollY: number;
  hero: Box | null;
  text: Box | null;
  statement: Box | null;
  queue: Box | null;
  flights: number;
  duplicate: string | null;
  rows: number;
  emptyFrame: boolean;
};

declare global {
  interface Window {
    __samples?: Sample[];
    __sampling?: boolean;
  }
}

/** Starts a requestAnimationFrame loop in the page that records a Sample each frame. */
async function startSampling(page: Page) {
  await page.evaluate(() => {
    const rel = (sel: string, section: string) => {
      const el = document.querySelector(sel);
      const sec = el?.closest(section);
      if (!el || !sec) return null;
      const a = el.getBoundingClientRect();
      const b = sec.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top };
    };
    const opacity = (el: Element | null) => {
      let o = 1;
      for (let n = el; n && n !== document.documentElement; n = n.parentElement)
        o *= Number(getComputedStyle(n).opacity);
      return o;
    };
    const onScreen = (el: Element | null) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < innerHeight && r.width > 0;
    };
    window.__samples = [];
    window.__sampling = true;
    const read = (t: number) => {
      // A card is the same card when all of its text is: title, company, city.
      const titles = [...document.querySelectorAll(".lp-rolecard")].map(
        (n) => n.textContent ?? "",
      );
      const seen = new Set<string>();
      let duplicate: string | null = null;
      for (const title of titles) {
        if (seen.has(title)) duplicate = title;
        seen.add(title);
      }
      // The card's white frame (its own layer on main, the card itself
      // after) and its first row, by the row's own opacity.
      const frame =
        document.querySelector(".lp-queue__frame") ??
        document.querySelector(".lp-queue");
      const first = document.querySelector(".lp-queue__list > li");
      const firstOwn = first ? Number(getComputedStyle(first).opacity) : 0;
      window.__samples!.push({
        t,
        scrollY: Math.round(window.scrollY),
        hero: rel(".lp-hero__text", ".lp-hero"),
        text: rel(".lp-focus__text", ".lp-focus"),
        statement: rel(".lp-focus .lp-statement", ".lp-focus"),
        queue: rel(".lp-queue", ".lp-focus"),
        flights: document.querySelectorAll('[class*="lp-flight"]').length,
        duplicate,
        rows: document.querySelectorAll(".lp-queue__list > li").length,
        emptyFrame: onScreen(frame) && opacity(frame) > 0.1 && firstOwn < 0.04,
      });
    };
    // Read once every rAF callback of the frame has run (framer-motion
    // writes its scroll-linked styles in its own rAF callback, which may be
    // queued after this one), so each sample is the state that frame paints.
    const tick = (t: number) => {
      if (!window.__sampling) return;
      setTimeout(() => read(t), 0);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopSampling(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    window.__sampling = false;
    return window.__samples ?? [];
  });
}

/** Wheel-scrolls to `to` in 100px notches, a frame or two apart, then waits for rest. */
async function wheelTo(page: Page, to: number) {
  for (;;) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    if (Math.abs(y - to) < 4) break;
    await page.mouse.wheel(0, Math.max(-100, Math.min(100, to - y)));
    await page.waitForTimeout(24);
  }
  await page.waitForTimeout(400);
}

test("the landing does not shake while it scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".lp-queue").waitFor({ state: "attached" });
  await page.locator(".lp-rolecard").first().waitFor({ state: "visible" });
  await page.waitForTimeout(1500);
  await page.mouse.move(720, 450);

  await startSampling(page);
  await wheelTo(page, 1600);
  await wheelTo(page, 0);
  const samples = await stopSampling(page);
  // Rest positions, measured once everything has settled at the end.
  await page.waitForTimeout(800);
  await startSampling(page);
  await page.waitForTimeout(100);
  const rest = (await stopSampling(page)).at(-1)!;

  expect(samples.length, "frames sampled").toBeGreaterThan(30);
  expect(Math.max(...samples.map((s) => s.scrollY))).toBeGreaterThan(1500);

  const faults: string[] = [];
  const kinds = new Map<string, number>();
  const fault = (kind: string, msg: string) => {
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    if ((kinds.get(kind) ?? 0) <= 4) faults.push(`[${kind}] ${msg}`);
  };
  const at = (s: Sample) => `t=${Math.round(s.t)}ms scrollY=${s.scrollY}`;

  for (const s of samples) {
    if (s.flights)
      fault("flying", `${at(s)}: ${s.flights} flying card elements`);
    if (s.duplicate)
      fault("duplicate", `${at(s)}: card "${s.duplicate}" twice`);
    if (s.rows !== 10) fault("rows", `${at(s)}: ${s.rows} rows, not 10`);
    if (s.emptyFrame) fault("empty frame", `${at(s)}: card frame shown empty`);
  }

  const statementYs = samples.flatMap((s) =>
    s.statement ? [s.statement.y] : [],
  );
  const settled = statementYs.length ? Math.min(...statementYs) : null;

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dir = Math.sign(b.scrollY - a.scrollY);

    // The statement: no declared motion at all.
    if (a.text && b.text) {
      const dy = b.text.y - a.text.y;
      const dx = b.text.x - a.text.x;
      if (Math.abs(dy) > TOL || Math.abs(dx) > TOL)
        fault(
          "statement",
          `${at(b)}: statement moved ${dx.toFixed(1)},${dy.toFixed(1)}px in one frame`,
        );
    }

    // The statement: settles with the scroll, within 12px, never against
    // it. Its rest is where it has settled, the highest it ever sits: the
    // final sample, at the top of the page, has it still below the fold
    // and so 12px down.
    if (a.statement && b.statement && settled !== null) {
      const dy = b.statement.y - a.statement.y;
      if (Math.abs(b.statement.x - a.statement.x) > TOL)
        fault("statement", `${at(b)}: statement moved sideways`);
      if (dir > 0 && dy > TOL)
        fault(
          "statement",
          `${at(b)}: statement fell ${dy.toFixed(1)}px on scroll down`,
        );
      if (dir < 0 && dy < -TOL)
        fault(
          "statement",
          `${at(b)}: statement rose ${(-dy).toFixed(1)}px on scroll up`,
        );
      if (dir === 0 && Math.abs(dy) > TOL)
        fault(
          "statement",
          `${at(b)}: statement moved ${dy.toFixed(1)}px at rest`,
        );
      const off = b.statement.y - settled;
      if (off > SETTLE + TOL)
        fault(
          "statement",
          `${at(b)}: statement ${off.toFixed(1)}px below rest`,
        );
    }

    // The hero copy: lifts with the scroll, within 16px, never against it.
    if (a.hero && b.hero && rest.hero) {
      const dy = b.hero.y - a.hero.y;
      if (Math.abs(b.hero.x - a.hero.x) > TOL)
        fault("hero copy", `${at(b)}: hero copy moved sideways`);
      if (dir > 0 && dy > TOL)
        fault(
          "hero copy",
          `${at(b)}: hero copy fell ${dy.toFixed(1)}px on scroll down`,
        );
      if (dir < 0 && dy < -TOL)
        fault(
          "hero copy",
          `${at(b)}: hero copy rose ${(-dy).toFixed(1)}px on scroll up`,
        );
      if (dir === 0 && Math.abs(dy) > TOL)
        fault(
          "hero copy",
          `${at(b)}: hero copy moved ${dy.toFixed(1)}px at rest`,
        );
      const off = b.hero.y - rest.hero.y;
      if (off < -LIFT - TOL || off > TOL)
        fault("hero copy", `${at(b)}: hero copy ${off.toFixed(1)}px from rest`);
    }

    // The queue card: rises 12px once, never down, never sideways.
    if (a.queue && b.queue && rest.queue) {
      const dy = b.queue.y - a.queue.y;
      if (Math.abs(b.queue.x - a.queue.x) > TOL)
        fault("queue card", `${at(b)}: queue card moved sideways`);
      if (dy > TOL)
        fault(
          "queue card",
          `${at(b)}: queue card moved down ${dy.toFixed(1)}px`,
        );
      const off = b.queue.y - rest.queue.y;
      if (off < -TOL || off > RISE + TOL)
        fault(
          "queue card",
          `${at(b)}: queue card ${off.toFixed(1)}px from rest`,
        );
    }
  }

  // The declared motions did run while sampled, so the checks above were
  // not passed by a page that never moved.
  const lifts = samples.map((s) =>
    s.hero && rest.hero ? s.hero.y - rest.hero.y : 0,
  );
  const rises = samples.map((s) =>
    s.queue && rest.queue ? s.queue.y - rest.queue.y : 0,
  );
  expect(Math.min(...lifts), "hero copy lifted").toBeLessThan(-8);
  expect(Math.max(...rises), "queue card rose in").toBeGreaterThan(4);

  const summary = [...kinds].map(([k, n]) => `${k}: ${n}`).join(", ");
  expect(
    faults,
    `faults in ${samples.length} frames (${summary}); first of each:\n${faults.join("\n")}`,
  ).toEqual([]);
});
