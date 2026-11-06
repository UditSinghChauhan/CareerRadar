#!/usr/bin/env node
/**
 * The landing while the API sleeps.
 *
 *   node scripts/check-api-asleep.mjs [landing-url]   (default http://localhost:5198/)
 *
 * Opens the landing with /api/public/stats stalled the way a sleeping
 * Render service stalls it behind the static site's proxy: the first
 * request gets the host's HTML wake-up page after 8.5s, the second answers
 * with live figures after a further 20s. Meanwhile it scrolls the stats band
 * into view and records, from the browser itself:
 *
 *   - when the hero and the stats band first paint, and with which figures;
 *   - every layout shift (PerformanceObserver), with its value;
 *   - any spinner or busy region on the page;
 *   - when, and whether, the live figures and "Live" swap in.
 *
 * Prints a JSON report; exits non-zero if anything shifted, a spinner
 * showed, or the live figures never arrived.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");

const url = process.argv[2] ?? "http://localhost:5198/";
const LIVE = { activePostings: 6512, openToFreshers: 3348 };

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("capture-signed-in", "0");
    window.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {
          window.__shifts.push({
            at: Math.round(e.startTime),
            value: e.value,
            sources: (e.sources ?? []).map(
              (s) => s.node?.className?.toString?.() ?? s.node?.nodeName,
            ),
          });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  let calls = 0;
  await ctx.route("**/api/public/stats", async (route) => {
    calls += 1;
    if (calls === 1) {
      await new Promise((r) => setTimeout(r, 8500));
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Service waking up…</body></html>",
      });
      return;
    }
    await new Promise((r) => setTimeout(r, 20000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...LIVE, lastSyncedAt: new Date().toISOString() }),
    });
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  const heroAt = Date.now() - t0;

  // Bring the stats band into view while the API is still asleep.
  await page.waitForSelector(".lp-stats");
  await page.locator(".lp-stats").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const read = () =>
    page.evaluate(() => ({
      numbers: [...document.querySelectorAll(".lp-stat__num")].map(
        (n) => n.textContent,
      ),
      live: Boolean(document.querySelector(".lp-live")),
      spinners: document.querySelectorAll('.animate-spin, [aria-busy="true"]')
        .length,
    }));
  const asleep = { at: Date.now() - t0, ...(await read()) };

  let swapped = null;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const now = await read();
    if (now.live) {
      await page.waitForTimeout(1200);
      swapped = { at: Date.now() - t0, ...(await read()) };
      break;
    }
    await page.waitForTimeout(250);
  }
  const shifts = await page.evaluate(() => window.__shifts);
  await browser.close();

  const cls = shifts.reduce((a, s) => a + s.value, 0);
  const report = {
    heroPaintedMs: heroAt,
    whileAsleep: asleep,
    afterWake: swapped,
    statsRequests: calls,
    layoutShifts: shifts,
    cumulativeLayoutShift: Number(cls.toFixed(4)),
  };
  console.log(JSON.stringify(report, null, 2));
  const ok =
    swapped &&
    asleep.spinners === 0 &&
    swapped.spinners === 0 &&
    cls === 0 &&
    swapped.numbers.includes(LIVE.activePostings.toLocaleString("en-IN"));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
