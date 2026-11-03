#!/usr/bin/env node
/**
 * Portfolio assets for the landing page, taken from a running copy of it:
 *
 *   node scripts/capture-showcase.mjs [url]     (default http://localhost:5173/)
 *
 * Writes:
 *   docs/showcase/og.jpg              1200×630, the hero (also copied to
 *                                     career-radar/public/opengraph.jpg)
 *   docs/showcase/cover.jpg           1600×1000, the hero at rest
 *   docs/showcase/teaser.mp4          7 s, muted, the "From 4,512 to ten"
 *                                     chapter scrubbed top to bottom
 *   docs/screenshots/revamp/scroll.mp4  the whole page, top to bottom
 *
 * SHOWCASE_STILLS_ONLY=1 makes only the two stills.
 *
 * Frames are screenshots taken at fixed scroll positions, not a screen
 * recording: the pinned chapter is a pure function of scroll, so each frame
 * is exactly what a reader sees at that point, and the video is smooth on
 * any machine. Needs Playwright's Chromium and ffmpeg with libx264.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");

const url = process.argv[2] ?? "http://localhost:5173/";
const out = join(root, "docs/showcase");
const work = join(tmpdir(), "careerradar-showcase");
mkdirSync(out, { recursive: true });

const ff = (...args) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

/** Smoothstep, so the camera eases in and out of the scroll. */
const ease = (t) => t * t * (3 - 2 * t);

async function frames(page, name, from, to, count, hold = 0) {
  const dir = join(work, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let i = 0;
  for (let k = 0; k < count + hold; k++) {
    const t = Math.min(1, k / (count - 1));
    await page.evaluate(
      (y) => window.scrollTo(0, y),
      Math.round(from + (to - from) * ease(t)),
    );
    // Two frames, so scroll-linked styles and the canvas have painted.
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    await page.screenshot({
      path: join(dir, `${String(i++).padStart(4, "0")}.png`),
    });
  }
  return dir;
}

async function main() {
  const browser = await chromium.launch();
  try {
    // Cover, 1600×1000, after the load sequence has finished.
    let ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    let page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.addStyleTag({ content: ".lp-radar__hold { display: none; }" });
    await page.waitForTimeout(3200);
    await page.screenshot({ path: join(work, "cover.png") });
    ff(
      "-i",
      join(work, "cover.png"),
      "-vf",
      "scale=1600:1000",
      "-q:v",
      "3",
      join(out, "cover.jpg"),
    );
    await ctx.close();

    // OG, 1200×630: the same hero, composed for a link card. The headline is
    // set smaller so the lit radar fits under it; nothing else changes.
    ctx = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.addStyleTag({
      content: `
        .lp-hero { padding-top: 96px; }
        .lp-hero .lp-display { font-size: 56px !important; }
        .lp-hero .lp-lead { font-size: 20px; }
        .lp-hero__text { gap: 14px; }
        .lp-hero__act .lp-quiet, .lp-radar__hold { display: none; }
        .lp-hero__object { margin-top: calc(var(--disc) * -0.36) !important; }
        .lp-radar__disc {
          -webkit-mask-image: linear-gradient(to bottom, transparent 22%, #000 38%, #000 56%, transparent 72%);
          mask-image: linear-gradient(to bottom, transparent 22%, #000 38%, #000 56%, transparent 72%);
        }
      `,
    });
    await page.waitForTimeout(3200);
    await page.screenshot({ path: join(work, "og.png") });
    ff(
      "-i",
      join(work, "og.png"),
      "-vf",
      "scale=1200:630",
      "-q:v",
      "3",
      join(out, "og.jpg"),
    );
    copyFileSync(
      join(out, "og.jpg"),
      join(root, "artifacts/career-radar/public/opengraph.jpg"),
    );
    await ctx.close();

    if (process.env.SHOWCASE_STILLS_ONLY) return;

    // Teaser: the pinned chapter, 7 s at 30 fps, the last half second held.
    ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      colorScheme: "dark",
    });
    page = await ctx.newPage();
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const chapter = await page.evaluate(() => {
      const el = document.querySelector(".lp-chapter");
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, height: r.height };
    });
    let dir = await frames(
      page,
      "teaser",
      chapter.top - 200,
      chapter.top + chapter.height - 800,
      195,
      15,
    );
    ff(
      "-framerate",
      "30",
      "-i",
      join(dir, "%04d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "20",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
      "-an",
      join(out, "teaser.mp4"),
    );

    // The whole page, for the pull request: 30 fps, about 24 s.
    await page.evaluate(() => window.scrollTo(0, 0));
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    dir = await frames(page, "scroll", 0, height, 720, 20);
    ff(
      "-framerate",
      "30",
      "-i",
      join(dir, "%04d.png"),
      "-vf",
      "scale=960:-2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "26",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
      "-an",
      join(root, "docs/screenshots/revamp/scroll.mp4"),
    );
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(
    "wrote docs/showcase/{og.jpg,cover.jpg,teaser.mp4} and docs/screenshots/revamp/scroll.mp4",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
