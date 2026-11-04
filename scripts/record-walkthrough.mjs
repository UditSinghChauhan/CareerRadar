#!/usr/bin/env node
/**
 * Records the portfolio walkthrough: a 60 to 90 second, 1440×900 film of the
 * first-run journey, on this machine, with invented data.
 *
 *   node scripts/record-walkthrough.mjs
 *
 * landing hero → sign-up → onboarding → Today's ten → "How is this ranked?"
 * → Apply → the board → a deadline reminder.
 *
 * What it does:
 *   1. Pushes the Drizzle schema to a LOCAL Postgres and seeds the invented
 *      jobs with a brand-new demo account (capture-seed.ts, CAPTURE_NEW_USER=1).
 *   2. Serves the real API router with a fixed demo session
 *      (capture-server.ts) and the real app with Clerk stubbed out
 *      (career-radar/capture/). The sign-up card is a local stand-in for
 *      Clerk's, which needs Clerk keys; everything after it is the real app.
 *   3. Drives the journey in Chromium with Playwright's video recorder and a
 *      drawn cursor, and runs the real notification generator (the cron's
 *      step) after the Apply, so the reminder in the bell is one the product
 *      wrote.
 *   4. Writes docs/showcase/walkthrough.webm, walkthrough.mp4 and
 *      walkthrough-cover.jpg (1600×1000).
 *
 * Needs: a local Postgres (DATABASE_URL, default below), ffmpeg with libx264,
 * and Playwright's Chromium. Refuses any non-local database.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "artifacts/career-radar");
const api = join(root, "artifacts/api-server");
const out = join(root, "docs/showcase");
const work = join(tmpdir(), "careerradar-walkthrough");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://capture:capture@localhost:5432/careerradar_capture";
const host = new URL(DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) {
  throw new Error(`Refusing to seed a non-local database (${host}).`);
}
const API_PORT = process.env.CAPTURE_API_PORT ?? "8099";
const WEB_PORT = process.env.CAPTURE_WEB_PORT ?? "5198";
const env = { ...process.env, DATABASE_URL, CAPTURE_API_PORT: API_PORT };

const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");

const W = 1440;
const H = 900;

function run(cmd, args, cwd, extra = {}) {
  execFileSync(cmd, args, { cwd, env: { ...env, ...extra }, stdio: "inherit" });
}

function start(cmd, args, cwd, ready) {
  const child = spawn(cmd, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  return new Promise((ok, fail) => {
    const timer = setTimeout(
      () => fail(new Error(`${cmd} did not start`)),
      60000,
    );
    const on = (buf) => {
      if (ready.test(buf.toString())) {
        clearTimeout(timer);
        ok(child);
      }
    };
    child.stdout.on("data", on);
    child.stderr.on("data", on);
    child.on("exit", (code) => fail(new Error(`${cmd} exited with ${code}`)));
  });
}

/** A small ink dot that follows the mouse, since the recorder draws none. */
const CURSOR = `
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgb(17 17 17 / 55%);box-shadow:0 0 0 2px rgb(255 255 255 / 80%);pointer-events:none;transition:transform 120ms ease-out;left:-40px;top:-40px";
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(0.8)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
  });
`;

async function main() {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(out, { recursive: true });

  run("pnpm", ["run", "push-force"], join(root, "lib/db"));
  run("npx", ["tsx", "src/scripts/capture-seed.ts"], api, {
    CAPTURE_NEW_USER: "1",
  });

  const apiServer = await start(
    "npx",
    ["tsx", "src/scripts/capture-server.ts"],
    api,
    /capture API on/,
  );
  const web = await start(
    "npx",
    [
      "vite",
      "--config",
      "capture/vite.config.ts",
      "--port",
      WEB_PORT,
      "--strictPort",
    ],
    app,
    /Local:/,
  );
  const base = `http://localhost:${WEB_PORT}`;
  const browser = await chromium.launch();
  const timings = [];
  let trim = 0;
  const t0 = Date.now();
  const mark = (step) =>
    timings.push([step, ((Date.now() - t0) / 1000).toFixed(1)]);

  try {
    // Warm the dev server's module graph off camera, so the film has no
    // first-compile pauses in it.
    const warm = await browser.newPage();
    for (const path of [
      "/",
      "/sign-up",
      "/welcome",
      "/dashboard",
      "/applications",
    ]) {
      await warm.goto(base + path, { waitUntil: "networkidle" });
    }
    await warm.close();

    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      colorScheme: "light",
      recordVideo: { dir: work, size: { width: W, height: H } },
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("theme", "light");
      if (!sessionStorage.getItem("walkthrough")) {
        sessionStorage.setItem("walkthrough", "1");
        localStorage.setItem("capture-signed-in", "0");
      }
    });
    await ctx.addInitScript(CURSOR);
    const page = await ctx.newPage();
    // The recorder starts with the page; the film is trimmed to the first
    // frame of the landing, so it does not open on a blank tab.
    const filmStart = Date.now();
    const pause = (ms) => page.waitForTimeout(ms);
    let mouse = { x: W / 2, y: H / 2 };
    /** Moves the drawn cursor to a target and clicks it, at a human pace. */
    const click = async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      const box = await locator.boundingBox();
      const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(to.x, to.y, {
        steps: Math.max(
          12,
          Math.round(Math.hypot(to.x - mouse.x, to.y - mouse.y) / 18),
        ),
      });
      mouse = to;
      await pause(250);
      await locator.click();
    };
    /** Scrolls smoothly, in small steps, so the scroll-driven motion reads. */
    const glide = async (to, ms) => {
      const from = await page.evaluate(() => scrollY);
      // Timed by the clock, not by a step count, so the glide takes `ms`
      // however slow each scroll round trip is.
      const t0 = Date.now();
      for (;;) {
        const t = Math.min(1, (Date.now() - t0) / ms);
        const e = t * t * (3 - 2 * t);
        await page.evaluate(
          (y) => scrollTo(0, y),
          Math.round(from + (to - from) * e),
        );
        if (t === 1) break;
        await pause(8);
      }
    };

    // 1. The landing hero, and the field coming into focus.
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.mouse.move(mouse.x, mouse.y);
    await page.locator(".lp-flight").waitFor({ state: "attached" });
    trim = Math.max(0, (Date.now() - filmStart) / 1000 - 0.2);
    mark("landing");
    await pause(4500);
    await glide(H * 1.15, 4200);
    await pause(2500);
    await glide(0, 1800);
    await pause(800);

    // 2. Sign up.
    await click(page.locator(".lp-hero .lp-btn"));
    await page.locator("[data-capture-standin=sign-up]").waitFor();
    mark("sign-up");
    await pause(1800);
    await click(page.getByRole("button", { name: "Continue with Google" }));

    // 3. The one onboarding step.
    await page
      .getByRole("heading", { name: "Two choices, then your ten." })
      .waitFor();
    mark("onboarding");
    await pause(1800);
    await click(page.getByRole("radio", { name: "Both" }));
    await pause(500);
    await click(page.getByRole("button", { name: "Bengaluru" }));
    await pause(400);
    await click(page.getByRole("button", { name: "Chennai" }));
    await pause(400);
    await click(page.getByRole("button", { name: "Remote" }));
    await pause(900);
    await click(page.getByRole("button", { name: "Show my ten" }));

    // 4. Today's ten.
    await page.getByTestId("queue-row").first().waitFor();
    mark("queue");
    await pause(4500);
    await glide(260, 1400);
    await pause(1500);

    // 5. How is this ranked?
    await click(page.getByRole("button", { name: "How is this ranked?" }));
    await page.getByTestId("queue-ranking-note").waitFor();
    mark("ranking note");
    await pause(4500);
    await page.keyboard.press("Escape");
    await pause(800);

    // 6. Apply to the role that closes soonest. The posting opens in a new
    //    tab, as it does for a student; the film stays on CareerRadar.
    const closing = page
      .getByTestId("queue-row")
      // Within the 72-hour reminder window, so the reminder is real.
      .filter({ hasText: /Closes (today|tomorrow|in [23] days)/ })
      .first();
    const target =
      (await closing.count()) > 0
        ? closing
        : page.getByTestId("queue-row").first();
    await target.scrollIntoViewIfNeeded();
    await pause(1200);
    const popup = ctx.waitForEvent("page");
    await click(target.getByRole("button", { name: /Apply/ }));
    const tab = await popup;
    await tab.close().catch(() => {});
    await page.bringToFront();
    mark("apply");
    await pause(2500);

    // The cron's notification pass, run once with the real generator.
    run("npx", ["tsx", "src/scripts/capture-remind.ts"], api);

    // 7. The board.
    await glide(0, 900);
    await click(page.getByRole("link", { name: "Applications" }).first());
    await page
      .getByRole("heading", { name: /Applications/ })
      .first()
      .waitFor();
    mark("board");
    await pause(6000);

    // 8. The deadline reminder.
    await page.reload({ waitUntil: "networkidle" });
    await pause(1200);
    await click(page.getByTestId("notification-bell"));
    await page.getByTestId("notification-panel").waitFor();
    mark("reminder");
    await pause(6500);

    // The film is the main tab's; the posting's tab records its own.
    const filmPath = await page.video().path();
    await ctx.close();
    renameSync(filmPath, join(work, "film.webm"));

    // The cover: Today's ten at 1600×1000, light, at rest.
    const still = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await still.addInitScript(() => localStorage.setItem("theme", "light"));
    const sp = await still.newPage();
    await sp.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
    await sp.getByTestId("queue-row").first().waitFor();
    await sp.waitForTimeout(600);
    await sp.screenshot({ path: join(work, "cover.png") });
    await still.close();
  } finally {
    await browser.close();
    for (const child of [apiServer, web]) {
      child.removeAllListeners("exit");
      process.kill(-child.pid, "SIGTERM");
    }
  }

  const raw = "film.webm";
  const cut = ["-ss", trim.toFixed(2)];
  const webm = join(out, "walkthrough.webm");
  const ff = (...args) =>
    execFileSync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...args,
    ]);
  ff(
    ...cut,
    "-i",
    join(work, raw),
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "38",
    "-row-mt",
    "1",
    "-an",
    webm,
  );
  ff(
    ...cut,
    "-i",
    join(work, raw),
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    join(out, "walkthrough.mp4"),
  );
  ff(
    "-i",
    join(work, "cover.png"),
    "-q:v",
    "3",
    join(out, "walkthrough-cover.jpg"),
  );

  console.log("timeline (seconds from the first frame):");
  const first = Number(timings[0][1]);
  for (const [step, s] of timings) {
    console.log(`  ${(Number(s) - first).toFixed(1).padStart(5)}  ${step}`);
  }
  console.log(`wrote ${webm}, walkthrough.mp4 and walkthrough-cover.jpg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
