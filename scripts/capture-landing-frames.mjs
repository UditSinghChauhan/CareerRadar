#!/usr/bin/env node
/**
 * Before/after evidence for the landing's scroll motion (DESIGN.md, Motion).
 *
 *   node scripts/capture-landing-frames.mjs <before|after> [landing-url]
 *
 * At 1440x900 and 390x844 it scrolls from 0 to 1600 in 50px steps and saves
 * a viewport frame at each step, then tiles them into one contact strip per
 * width (strip-<width>.jpg, needs ffmpeg). It then walks the whole page at
 * 1440, 768 and 390 so every reveal has played, and screenshots each section
 * and the footer (sections/<n>-<name>-<width>.png).
 *
 * Writes to docs/screenshots/smooth-premium/<phase>/. The single frames stay
 * in a temporary folder; only the strips are kept.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");

const [phase = "after", url = "http://localhost:5198/"] = process.argv.slice(2);
const out = join(root, "docs/screenshots/smooth-premium", phase);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "sections"), { recursive: true });

const STEP = 50;
const TO = 1600;

const settle = (p) =>
  p.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );

async function open(browser, width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.locator(".lp-rolecard").first().waitFor({ state: "visible" });
  await p.waitForTimeout(1500);
  // Instant jumps, so each frame shows exactly its scroll position.
  await p.addStyleTag({
    content: "html, html:has(.lp) { scroll-behavior: auto !important; }",
  });
  return { ctx, p };
}

async function frames(browser, width, height) {
  const { ctx, p } = await open(browser, width, height);
  const dir = mkdtempSync(join(tmpdir(), `frames-${width}-`));
  let n = 0;
  for (let y = 0; y <= TO; y += STEP) {
    await p.evaluate((v) => window.scrollTo(0, v), y);
    await p.waitForTimeout(320);
    await settle(p);
    await p.screenshot({
      path: join(dir, `${String(n++).padStart(2, "0")}.png`),
    });
  }
  await ctx.close();
  const cols = 11;
  const rows = Math.ceil(n / cols);
  const thumb = width > 800 ? 360 : 180;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    "1",
    "-i",
    join(dir, "%02d.png"),
    "-vf",
    `scale=${thumb}:-1,pad=iw+4:ih+4:2:2:color=0x888888,tile=${cols}x${rows}`,
    "-frames:v",
    "1",
    "-q:v",
    "4",
    join(out, `strip-${width}.jpg`),
  ]);
  rmSync(dir, { recursive: true, force: true });
}

async function sections(browser, width, height) {
  const { ctx, p } = await open(browser, width, height);
  const total = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += Math.round(height * 0.5)) {
    await p.evaluate((v) => window.scrollTo(0, v), y);
    await p.waitForTimeout(160);
  }
  await p.waitForTimeout(1200);
  // Section shots leave out the fixed bar, which would cover each top.
  await p.addStyleTag({
    content: ".lp-nav { visibility: hidden !important; }",
  });
  const els = await p.$$("main > section, main > div > section, footer");
  let i = 0;
  for (const s of els) {
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
      .replace(/-head$/, "")
      .replace(/[^a-z0-9-]/gi, "");
    // The hero is shot at rest, the rest from their own top.
    await p.evaluate((top) => window.scrollTo(0, top), i === 0 ? 0 : box.top);
    await p.waitForTimeout(900);
    await settle(p);
    await s.screenshot({
      path: join(
        out,
        "sections",
        `${String(++i).padStart(2, "0")}-${name}-${width}.png`,
      ),
    });
  }
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    await frames(browser, 1440, 900);
    await frames(browser, 390, 844);
    for (const [w, h] of [
      [1440, 900],
      [768, 1024],
      [390, 844],
    ])
      await sections(browser, w, h);
  } finally {
    await browser.close();
  }
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
