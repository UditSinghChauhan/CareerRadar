#!/usr/bin/env node
/**
 * The first minute after a brand-new sign-up, on a local database: screens
 * and timings.
 *
 *   node scripts/first-minute.mjs
 *
 * What it does, all on this machine:
 *   1. Pushes the Drizzle schema to a LOCAL Postgres and seeds the invented
 *      jobs with a brand-new demo account (capture-seed.ts,
 *      CAPTURE_NEW_USER=1): no profile, no settings, no applications.
 *   2. Serves the real API router with a fixed demo session
 *      (capture-server.ts), and a PRODUCTION build of the app with Clerk
 *      stubbed out (career-radar/capture/), through `vite preview`, so the
 *      timings are not a dev server's compile times. The sign-up card is a
 *      local stand-in: Clerk's own needs Clerk keys, so Clerk's time is not
 *      in these numbers.
 *   3. In Chromium at 1440x900, with an empty cache: opens the landing,
 *      presses Get started, signs up, answers the two onboarding questions
 *      with their defaults, presses "Show my ten", and stays on the
 *      dashboard until a minute has passed since the sign-up.
 *   4. Writes screens and timings.json (every step, every /api call with
 *      its status and duration) to docs/screenshots/first-minute/.
 *
 * Needs: a local Postgres (DATABASE_URL, default below) and Playwright's
 * Chromium. Refuses any non-local database.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "artifacts/career-radar");
const api = join(root, "artifacts/api-server");
const out = join(root, "docs/screenshots/first-minute");
const dist = join(tmpdir(), "careerradar-first-minute");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://capture:capture@localhost:5432/careerradar_capture";
const host = new URL(DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) {
  throw new Error(`Refusing to seed a non-local database (${host}).`);
}
const API_PORT = process.env.CAPTURE_API_PORT ?? "8097";
const WEB_PORT = process.env.CAPTURE_WEB_PORT ?? "5197";
const env = { ...process.env, DATABASE_URL, CAPTURE_API_PORT: API_PORT };

const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");

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
      90000,
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

const stop = (child) => {
  try {
    process.kill(-child.pid);
  } catch {
    // already gone
  }
};

async function main() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  rmSync(dist, { recursive: true, force: true });

  run("pnpm", ["run", "push-force"], join(root, "lib/db"));
  run("npx", ["tsx", "src/scripts/capture-seed.ts"], api, {
    CAPTURE_NEW_USER: "1",
  });
  run(
    "npx",
    ["vite", "build", "--config", "capture/vite.config.ts", "--outDir", dist],
    app,
  );

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
      "preview",
      "--config",
      "capture/vite.config.ts",
      "--outDir",
      dist,
      "--port",
      WEB_PORT,
      "--strictPort",
    ],
    app,
    /Local:/,
  );
  const base = `http://localhost:${WEB_PORT}`;

  const browser = await chromium.launch();
  const steps = [];
  const calls = [];
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
    });
    await ctx.addInitScript(() => {
      localStorage.setItem("theme", "light");
      if (!sessionStorage.getItem("first-minute")) {
        sessionStorage.setItem("first-minute", "1");
        localStorage.setItem("capture-signed-in", "0");
      }
    });
    const page = await ctx.newPage();
    const t0 = Date.now();
    let signUpAt = 0;
    const since = () => Date.now() - t0;
    const mark = (step, note = "") => {
      const ms = since();
      steps.push({
        step,
        ms,
        sinceSignUp: signUpAt ? ms - signUpAt : null,
        note,
      });
      console.log(`${String(ms).padStart(6)} ms  ${step} ${note}`);
    };
    const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });

    page.on("requestfinished", async (req) => {
      const url = new URL(req.url());
      if (!url.pathname.startsWith("/api")) return;
      const t = req.timing();
      const res = await req.response();
      calls.push({
        at: Math.round(since()),
        method: req.method(),
        path: url.pathname + url.search,
        status: res?.status() ?? 0,
        ms: Math.round(t.responseEnd),
      });
    });

    await page.goto(`${base}/`, { waitUntil: "load" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    mark("landing: headline painted");
    await shot("01-landing");

    await page.locator(".lp-hero .lp-btn").click();
    await page.locator("[data-capture-standin=sign-up]").waitFor();
    mark("sign-up card");
    await shot("02-sign-up");

    // A person takes seconds over the sign-up form; the script waits 3s,
    // so the first-run prefetch is not measured mid-parse.
    await page.waitForTimeout(3000);
    signUpAt = since();
    await page.getByRole("button", { name: "Continue with Google" }).click();
    mark("signed up");
    const heading = page.getByRole("heading", {
      name: "Two choices, then your ten.",
    });
    await heading.waitFor();
    mark("onboarding: question painted");
    await shot("03-onboarding");

    // The defaults are complete: one press shows the ten.
    await page.getByRole("button", { name: "Show my ten" }).click();
    mark("pressed Show my ten");
    await page.waitForURL(/\/dashboard/);
    mark("dashboard: route");
    await shot("04-dashboard-first-frame");
    await page.getByTestId("queue-row").first().waitFor();
    mark(
      "dashboard: first queue row",
      `${await page.getByTestId("queue-row").count()} rows`,
    );
    await shot("05-dashboard-queue");

    const at30 = signUpAt + 30000 - since();
    if (at30 > 0) await page.waitForTimeout(at30);
    mark("30 s after sign-up");
    await shot("06-plus-30s");
    const at60 = signUpAt + 60000 - since();
    if (at60 > 0) await page.waitForTimeout(at60);
    mark("60 s after sign-up");
    await shot("07-plus-60s");
    // Spinners and busy regions; the day's 0/10 progress bar is neither.
    const spinners = await page
      .locator('.animate-spin, [aria-busy="true"]')
      .count();
    mark("spinners or busy regions at 60 s", String(spinners));
    await ctx.close();
  } finally {
    await browser.close();
    stop(web);
    stop(apiServer);
  }
  writeFileSync(
    join(out, "timings.json"),
    JSON.stringify(
      {
        note: "Local machine, local Postgres, production build via vite preview, Clerk stubbed (its time is not included). Milliseconds. The script waits 3 s on the sign-up card, as a person filling in the form would. /api/health is 404 here because capture-server.ts mounts only the API router; the health route lives in app.ts and answers in production.",
        steps,
        calls: calls.sort((a, b) => a.at - b.at),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
