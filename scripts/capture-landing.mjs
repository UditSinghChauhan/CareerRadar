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
 *   3. Captures the top of the dashboard at 2x, in the light theme.
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
    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 620 },
      deviceScaleFactor: 2,
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    await ctx.addInitScript(() => localStorage.setItem("theme", "light"));
    const p = await ctx.newPage();
    // A morning, so the greeting matches the product's promise. The date
    // line under it is hidden: the landing page prints no dates.
    await p.clock.setFixedTime(new Date(new Date().setUTCHours(3, 30, 0, 0)));
    await p.goto(`${base}/dashboard`);
    await p.getByTestId("queue-row").first().waitFor();
    await p.addStyleTag({
      content: "h1 + p.text-muted-foreground { visibility: hidden; }",
    });
    await p.waitForTimeout(800);
    await p.screenshot({ path: join(work, "dashboard.png") });
    await ctx.close();

    shots.dashboard = encode("dashboard", join(work, "dashboard.png"));
    console.log(
      `captured dashboard: ${shots.dashboard.width}×${shots.dashboard.height}`,
    );
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
