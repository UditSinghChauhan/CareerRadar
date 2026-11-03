#!/usr/bin/env node
/**
 * Before/after evidence for the "Field to focus" landing (docs/LANDING_V3.md).
 *
 *   node scripts/capture-landing-v3.mjs <before|after> <landing-url> [dashboard-url]
 *
 * For each width it walks the page once (so every reveal has played),
 * screenshots every landing section and the footer one by one, and records
 * the full page height in heights.json. With a dashboard URL (the capture dev
 * server from scripts/capture-landing.mjs, which signs in the invented demo
 * account) it also screenshots the signed-in dashboard in the light theme.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");

const [phase = "after", url = "http://localhost:5173/", dash] =
  process.argv.slice(2);
const out = join(root, "docs/screenshots/landing-v3", phase);
mkdirSync(out, { recursive: true });

const widths =
  phase === "before"
    ? [
        [1440, 900],
        [390, 844],
      ]
    : [
        [1440, 900],
        [768, 1024],
        [390, 844],
      ];

const settle = (p) =>
  p.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );

async function main() {
  const browser = await chromium.launch();
  const heights = {};
  try {
    for (const [width, height] of widths) {
      const ctx = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
        colorScheme: "light",
      });
      const p = await ctx.newPage();
      await p.goto(url, { waitUntil: "networkidle" });
      await p.waitForTimeout(2500);
      await p.screenshot({ path: join(out, `00-viewport-${width}.png`) });
      const total = await p.evaluate(
        () => document.documentElement.scrollHeight,
      );
      for (let y = 0; y < total; y += Math.round(height * 0.6)) {
        await p.evaluate((v) => window.scrollTo(0, v), y);
        await p.waitForTimeout(140);
      }
      await p.waitForTimeout(800);
      heights[width] = await p.evaluate(
        () => document.documentElement.scrollHeight,
      );
      // Section shots leave out the fixed bar, which would cover each top.
      await p.addStyleTag({
        content: ".lp-nav { visibility: hidden !important; }",
      });
      const sections = await p.$$(
        "main > section, main > div > section, footer",
      );
      let i = 0;
      for (const s of sections) {
        const box = await s.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top + window.scrollY, height: r.height };
        });
        if (box.height < 40) continue;
        const name = (
          (await s.getAttribute("aria-labelledby")) ||
          (await s.getAttribute("class")) ||
          "section"
        )
          .split(" ")[0]
          .replace(/[^a-z0-9-]/gi, "");
        await p.evaluate((top) => window.scrollTo(0, top), box.top);
        // Long enough for the ten to travel back to the field at the top.
        await p.waitForTimeout(i === 0 ? 2000 : 900);
        await settle(p);
        const file = `${String(++i).padStart(2, "0")}-${name}-${width}.png`;
        await s.screenshot({ path: join(out, file) });
      }
      await ctx.close();
    }
    if (dash) {
      const shots = [
        [1440, 900, "light"],
        [390, 844, "light"],
        ...(phase === "after" ? [[1440, 900, "dark"]] : []),
      ];
      for (const [width, height, theme] of shots) {
        const ctx = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 1,
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
        const p = await ctx.newPage();
        await p.goto(dash);
        await p.getByTestId("queue-row").first().waitFor({ timeout: 30000 });
        await p.waitForTimeout(1200);
        await p.screenshot({
          path: join(
            out,
            theme === "light"
              ? `dashboard-${width}.png`
              : `dashboard-${width}-${theme}.png`,
          ),
          fullPage: true,
        });
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(
    join(out, "heights.json"),
    JSON.stringify(heights, null, 2) + "\n",
  );
  console.log("page heights", heights);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
