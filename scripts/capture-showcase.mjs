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
 *   docs/showcase/teaser.mp4          muted, the hero's field scrolling into
 *                                     "Today's ten"
 *   docs/screenshots/landing-v3/scroll.mp4  the whole page, top to bottom
 *
 * SHOWCASE_STILLS_ONLY=1 makes only the two stills.
 *
 * Frames are screenshots taken at fixed scroll positions, not a screen
 * recording, so the video is smooth on any machine. The page's in-view
 * animations run in real time between frames. Needs Playwright's Chromium
 * and ffmpeg with libx264.
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
// The capture build's Clerk stand-in (career-radar/capture/) is signed in
// unless told otherwise; the real app ignores this key.
const SIGNED_OUT = () => localStorage.setItem("capture-signed-in", "0");
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
  const video = (dir, file, scale) =>
    ff(
      "-framerate",
      "30",
      "-i",
      join(dir, "%04d.png"),
      ...(scale ? ["-vf", `scale=${scale}:-2`] : []),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "24",
      "-preset",
      "slow",
      "-movflags",
      "+faststart",
      "-an",
      file,
    );
  try {
    // Cover, 1600×1000, once the field has settled.
    let ctx = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: "light",
    });
    await ctx.addInitScript(SIGNED_OUT);
    let page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
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

    // OG, 1200×630: the same hero, composed for a link card.
    ctx = await browser.newContext({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 2,
      colorScheme: "light",
    });
    await ctx.addInitScript(SIGNED_OUT);
    page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.addStyleTag({
      content: `
        .lp-hero { min-height: 630px !important; padding: 72px 0 40px; }
        .lp-hero .lp-display { font-size: 60px !important; }
        .lp-hero__act .lp-quiet { display: none; }
        .lp-hero ~ * { visibility: hidden; }
      `,
    });
    // The field measures the text on resize; nudge it after the restyle.
    await page.setViewportSize({ width: 1201, height: 630 });
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.waitForTimeout(2500);
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

    // Teaser: from the field to "Today's ten".
    ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    await ctx.addInitScript(SIGNED_OUT);
    page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    let dir = await frames(page, "teaser", 0, 900, 120, 30);
    video(dir, join(out, "teaser.mp4"));

    // The whole page, for the pull request: 30 fps.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    dir = await frames(page, "scroll", 0, height, 600, 20);
    video(dir, join(root, "docs/screenshots/landing-v3/scroll.mp4"), 960);
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(
    "wrote docs/showcase/{og.jpg,cover.jpg,teaser.mp4} and docs/screenshots/landing-v3/scroll.mp4",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
