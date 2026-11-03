#!/usr/bin/env node
/**
 * Photographs the real app for the landing page's "Your whole search, on one
 * screen." section.
 *
 *   node scripts/capture-landing.mjs
 *
 * What it does, all on this machine:
 *   1. Pushes the Drizzle schema to a LOCAL Postgres database and seeds an
 *      invented demo account (api-server/src/scripts/capture-seed.ts).
 *   2. Serves the real API router with a fixed demo session
 *      (capture-server.ts) and the real app with Clerk stubbed out
 *      (career-radar/capture/vite.config.ts).
 *   3. Captures the dashboard, the queue, the board, a job's detail drawer
 *      and the phone queue at 2x, in the dark theme.
 *   4. Writes AVIF and WebP files to career-radar/public/landing/captures/
 *      and their dimensions and blurred placeholders to
 *      career-radar/src/components/landing/captures.json.
 *
 * Needs: a local Postgres (DATABASE_URL, default below), ffmpeg with libaom
 * and libwebp, and Playwright's Chromium. Refuses any non-local database.
 * Every company, role and person in the captures is invented.
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "artifacts/career-radar");
const api = join(root, "artifacts/api-server");
const outDir = join(app, "public/landing/captures");
const manifest = join(app, "src/components/landing/captures.json");
const work = join(tmpdir(), "careerradar-captures");

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

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, env, stdio: "inherit" });
}

function start(cmd, args, cwd, ready) {
  // Its own process group, so stop() can end npx and everything it started.
  const child = spawn(cmd, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  return new Promise((resolveStart, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${cmd} did not start`)),
      60000,
    );
    const on = (buf) => {
      if (ready.test(buf.toString())) {
        clearTimeout(timer);
        resolveStart(child);
      }
    };
    child.stdout.on("data", on);
    child.stderr.on("data", on);
    child.on("exit", (code) => reject(new Error(`${cmd} exited with ${code}`)));
  });
}

/** PNG → AVIF and WebP, plus a 24px blurred WebP as a data URI. */
function encode(name, png) {
  const avif = join(outDir, `${name}.avif`);
  const webp = join(outDir, `${name}.webp`);
  const tiny = join(work, `${name}-tiny.webp`);
  const ff = ["-hide_banner", "-loglevel", "error", "-y", "-i", png];
  execFileSync("ffmpeg", [
    ...ff,
    "-c:v",
    "libaom-av1",
    "-still-picture",
    "1",
    "-crf",
    "32",
    "-cpu-used",
    "4",
    "-pix_fmt",
    "yuv420p",
    avif,
  ]);
  execFileSync("ffmpeg", [...ff, "-c:v", "libwebp", "-quality", "80", webp]);
  execFileSync("ffmpeg", [
    ...ff,
    "-vf",
    "scale=24:-1",
    "-c:v",
    "libwebp",
    "-quality",
    "40",
    tiny,
  ]);
  const probe = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    png,
  ])
    .toString()
    .trim();
  const [w, h] = probe.split(",").map(Number);
  return {
    // CSS pixels: captured at 2x.
    width: w / 2,
    height: h / 2,
    avif: `/landing/captures/${name}.avif`,
    webp: `/landing/captures/${name}.webp`,
    placeholder: `data:image/webp;base64,${readFileSync(tiny).toString("base64")}`,
  };
}

async function main() {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  run("pnpm", ["run", "push-force"], join(root, "lib/db"));
  run("npx", ["tsx", "src/scripts/capture-seed.ts"], api);

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
  const shots = {};
  try {
    const page = async (width, height) => {
      const ctx = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        colorScheme: "dark",
        reducedMotion: "reduce",
      });
      // A morning, so the greeting matches the product's promise. The date
      // line under it is hidden: the landing page prints no dates.
      await ctx.addInitScript(() => {
        localStorage.setItem("theme", "dark");
        localStorage.setItem("careerradar:applications:view", "board");
      });
      const p = await ctx.newPage();
      await p.clock.setFixedTime(new Date(new Date().setUTCHours(3, 30, 0, 0)));
      // The landing page prints no dates, so the captures hide the app's
      // date lines (the greeting's date, applied dates on board cards).
      // Nothing else in the app is changed.
      p.hideDate = () =>
        p.addStyleTag({
          content: [
            "h1 + p.text-muted-foreground { visibility: hidden; }",
            '[data-testid="board-card"] > div:last-child { display: none; }',
          ].join("\n"),
        });
      return p;
    };

    // 1. The dashboard, as the hero of the section.
    // 1120 wide, shown at up to 1200 in the frame: the app's 12px text
    // lands at 13px or more on a 1440 screen.
    let p = await page(1120, 760);
    await p.goto(`${base}/dashboard`);
    await p.getByTestId("queue-row").first().waitFor();
    await p.hideDate();
    await p.waitForTimeout(800);
    await p.screenshot({ path: join(work, "dashboard.png") });

    // 2. Close-up: the queue's first rows with their scores and reasons.
    const queue = p.getByTestId("todays-queue");
    const rows = await p.getByTestId("queue-row").nth(2).boundingBox();
    const top = await queue.boundingBox();
    await p.screenshot({
      path: join(work, "queue.png"),
      clip: {
        x: top.x,
        y: top.y,
        width: top.width,
        height: rows.y + rows.height - top.y + 16,
      },
    });
    await p.context().close();

    // 3. The board, and 4. a job's detail drawer opened from it.
    p = await page(1120, 760);
    await p.goto(`${base}/applications`);
    await p.getByTestId("board-card").first().waitFor();
    await p.hideDate();
    await p.waitForTimeout(600);
    await p.screenshot({ path: join(work, "board.png") });
    // A saved role: its drawer has no applied date yet.
    await p
      .getByTestId("board-column-saved")
      .getByTestId("board-card")
      .first()
      .click();
    const drawer = p.getByRole("dialog");
    await drawer.waitFor();
    await p.waitForTimeout(600);
    await drawer.screenshot({ path: join(work, "detail.png") });
    await p.context().close();

    // 5. The queue on a phone.
    p = await page(390, 844);
    await p.goto(`${base}/dashboard`);
    await p.getByTestId("queue-row").first().waitFor();
    await p.hideDate();
    await p.evaluate(() => {
      const el = document.querySelector('[data-testid="queue-row"]');
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 150);
    });
    await p.waitForTimeout(600);
    await p.screenshot({ path: join(work, "phone.png") });
    await p.context().close();

    for (const name of ["dashboard", "queue", "board", "detail", "phone"]) {
      shots[name] = encode(name, join(work, `${name}.png`));
      console.log(
        `captured ${name}: ${shots[name].width}×${shots[name].height}`,
      );
    }
    writeFileSync(manifest, JSON.stringify(shots, null, 2) + "\n");
  } finally {
    await browser.close();
    for (const child of [apiServer, web]) {
      child.removeAllListeners("exit");
      process.kill(-child.pid, "SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
