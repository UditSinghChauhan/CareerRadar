#!/usr/bin/env node
/**
 * Screens of the landing sections this change touched, at 375, 768 and
 * 1280px, in the light and dark colour schemes (the landing is light only,
 * so dark checks that nothing leaks):
 *
 *   node scripts/capture-focus-hosting.mjs [landing-url]
 *
 * The hero at rest, "Today's ten" with the statement beside it at rest,
 * How it works, the dashboard crop and the questions. Walks the page once
 * first so every reveal has played. Writes
 * docs/screenshots/focus-and-hosting/<width>-<scheme>-<section>.png.
 */
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");

const url = process.argv[2] ?? "http://localhost:5198/";
const out = join(root, "docs/screenshots/focus-and-hosting");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const SIZES = [
  [375, 812],
  [768, 1024],
  [1280, 800],
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const scheme of ["light", "dark"]) {
      for (const [width, height] of SIZES) {
        const ctx = await browser.newContext({
          viewport: { width, height },
          colorScheme: scheme,
          deviceScaleFactor: 1,
        });
        await ctx.addInitScript(() =>
          localStorage.setItem("capture-signed-in", "0"),
        );
        const p = await ctx.newPage();
        await p.goto(url, { waitUntil: "networkidle" });
        await p.waitForTimeout(2200);
        const name = (s) => join(out, `${width}-${scheme}-${s}.png`);
        await p.screenshot({ path: name("1-hero") });

        // Walk the page so every reveal has played, then come back.
        const total = await p.evaluate(
          () => document.documentElement.scrollHeight,
        );
        for (let y = 0; y < total; y += Math.round(height * 0.5)) {
          await p.evaluate((v) => window.scrollTo(0, v), y);
          await p.waitForTimeout(120);
        }

        // "Today's ten" with every card home: past the list's foot by a
        // third of a screen, where the last row has landed.
        const restY = await p.evaluate(() => {
          const q = document.querySelector(".lp-queue");
          const r = q.getBoundingClientRect();
          return Math.max(0, r.bottom + scrollY - innerHeight * 0.7);
        });
        await p.evaluate((v) => window.scrollTo(0, v), restY);
        await p.waitForTimeout(900);
        await p.screenshot({ path: name("2-todays-ten") });

        for (const [sel, label] of [
          ["#how", "3-how-it-works"],
          [".lp-browser--crop", "4-dashboard-crop"],
          ["#faq", "5-questions"],
        ]) {
          const el = p.locator(sel);
          await el.scrollIntoViewIfNeeded();
          await p.waitForTimeout(1600);
          await el.screenshot({ path: name(label) });
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
