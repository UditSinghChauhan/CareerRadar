#!/usr/bin/env node
/**
 * Photographs the real app for the landing page's Features section: the
 * dashboard, in the light theme the landing shows.
 *
 *   node scripts/capture-landing.mjs
 *
 * What it does, all on this machine:
 *   1. Pushes the Drizzle schema to a LOCAL Postgres database and seeds an
 *      invented demo account (api-server/src/scripts/capture-seed.ts).
 *   2. Serves the real API router with a fixed demo session
 *      (capture-server.ts) and the real app with Clerk stubbed out
 *      (career-radar/capture/vite.config.ts).
 *   3. Captures a crop of Today's queue at 2x, in the light theme: one at
 *      a width the landing shows 1.19x larger (so the app's 12px meta text
 *      reads at 14px), and one for phones.
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
    // The landing shows the desktop crop 880px wide and the phone crop
    // about 350px wide; each is captured 1.19x narrower than that, so the
    // app's smallest text (12px) lands at 14px.
    const crops = [
      { name: "queue", viewport: { width: 1060, height: 900 }, height: 520 },
      { name: "queue-sm", viewport: { width: 330, height: 900 }, height: 560 },
    ];
    for (const crop of crops) {
      const ctx = await browser.newContext({
        viewport: crop.viewport,
        deviceScaleFactor: 2,
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await ctx.addInitScript(() => localStorage.setItem("theme", "light"));
      const p = await ctx.newPage();
      // A morning, so the queue reads as the day's.
      await p.clock.setFixedTime(new Date(new Date().setUTCHours(3, 30, 0, 0)));
      await p.goto(`${base}/dashboard`);
      const card = p.getByTestId("todays-queue");
      await p.getByTestId("queue-row").first().waitFor();
      await p.waitForTimeout(800);
      const box = await card.boundingBox();
      await p.screenshot({
        path: join(work, `${crop.name}.png`),
        clip: { x: box.x, y: box.y, width: box.width, height: crop.height },
      });
      await ctx.close();
      shots[crop.name] = encode(crop.name, join(work, `${crop.name}.png`));
      console.log(
        `captured ${crop.name}: ${shots[crop.name].width}×${shots[crop.name].height}`,
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
