#!/usr/bin/env node
/**
 * The README screenshots in docs/screenshots/*.png, on this machine, with
 * invented data.
 *
 *   node scripts/capture-readme.mjs
 *
 * What it does:
 *   1. Pushes the Drizzle schema to a LOCAL Postgres and seeds the invented
 *      jobs and a demo account that has used the app for three weeks
 *      (capture-seed.ts): a profile, applications at every board stage,
 *      bookmarks and a deadline reminder.
 *   2. Serves the real API router with a fixed demo session
 *      (capture-server.ts) and the real app with Clerk stubbed out
 *      (career-radar/capture/), the same harness as record-walkthrough.mjs.
 *   3. Photographs every README screen at 1440×900, light theme, under the
 *      file names README.md links to.
 *   4. sign-in.png is Clerk's own card, which the stub cannot draw. When the
 *      root .env has VITE_CLERK_PUBLISHABLE_KEY (a development key), the
 *      script renders /sign-in from the normal dev server and photographs
 *      it. It does not sign in or create anyone. Without the key it keeps
 *      the existing image and says so.
 *
 * Needs: a local Postgres (DATABASE_URL, default below) and Playwright's
 * Chromium. Refuses any non-local database.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "artifacts/career-radar");
const api = join(root, "artifacts/api-server");
const out = join(root, "docs/screenshots");

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://capture:capture@localhost:5432/careerradar_capture";
const host = new URL(DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) {
  throw new Error(`Refusing to seed a non-local database (${host}).`);
}
const API_PORT = process.env.CAPTURE_API_PORT ?? "8096";
const WEB_PORT = process.env.CAPTURE_WEB_PORT ?? "5196";
const SIGN_IN_PORT = process.env.CAPTURE_SIGN_IN_PORT ?? "5195";
const env = { ...process.env, DATABASE_URL, CAPTURE_API_PORT: API_PORT };

const require = createRequire(join(root, "package.json"));
const { chromium, expect } = require("@playwright/test");

/** The fixture capture.spec.ts asserts on, so the dialog shows a known parse. */
const CAPTURE_URL =
  "https://www.linkedin.com/jobs/view/software-engineer-intern-at-radar-capture-corp-4123456789";
const PASTED_JD = `Software Engineer Intern
Radar Capture Corp · Gurugram, Haryana, India · 2 days ago

About the job
Join the platform team for the 2027 batch.
Stipend: ₹45,000 /month
Apply by 30 Nov 2026
Skills: React, TypeScript, PostgreSQL
Hybrid role.`;

function run(cmd, args, cwd, extra = {}) {
  execFileSync(cmd, args, { cwd, env: { ...env, ...extra }, stdio: "inherit" });
}

function start(cmd, args, cwd, ready, extra = {}) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...env, ...extra },
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
    child.removeAllListeners("exit");
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // already gone
  }
};

async function lightContext(browser, signedIn) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  // Geist is font-display: optional (fonts.css), drawn only if it is ready
  // for the first paint. Under a dev server, which injects the CSS from
  // JavaScript, it often is not, and the page keeps the fallback. Here it
  // waits for Geist instead: what a returning visitor, with Geist cached,
  // sees.
  await ctx.route(
    (url) => /\.css$/.test(url.pathname),
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /font-display:\s*optional/g,
        "font-display: block",
      );
      await route.fulfill({ response, body });
    },
  );
  await ctx.addInitScript((signedIn) => {
    localStorage.setItem("theme", "light");
    localStorage.setItem("capture-signed-in", signedIn ? "1" : "0");
  }, signedIn);
  return ctx;
}

/**
 * Whether text on this page is drawn in Geist. Geist is font-display:
 * optional (fonts.css), so a page whose font arrived late draws in the
 * fallback for its whole life even though document.fonts says "loaded".
 * Measuring the same string with and without Geist tells the two apart.
 */
const rendersGeist = (page) =>
  page.evaluate(() => {
    const width = (family) => {
      const s = document.createElement("span");
      s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:400 40px ${family}`;
      s.textContent = "Ranked from 38 roles open to you";
      document.body.appendChild(s);
      const w = s.getBoundingClientRect().width;
      s.remove();
      return w;
    };
    return width('"Geist", monospace') !== width("monospace");
  });

/** Loads a path, reloading until Geist is the font on screen. */
async function load(page, url, ready) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt === 0) await page.goto(url);
    else await page.reload();
    await ready(page).waitFor({ timeout: 60000 });
    if (await rendersGeist(page)) return page;
  }
  throw new Error(`${url} never rendered in Geist`);
}

async function shot(page, name, { fullPage = false, idle = true } = {}) {
  // Logos and entry animations settle first.
  if (idle) await page.waitForLoadState("networkidle");
  if (!(await rendersGeist(page))) {
    throw new Error(`${name}: the page is drawn in the fallback font`);
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage });
  console.log(`  ${name}.png`);
}

async function captureApp(browser, base) {
  // Warm the dev server's module graph so no shot catches a first compile.
  const warm = await browser.newPage();
  for (const path of ["/", "/dashboard", "/jobs", "/applications"]) {
    await warm.goto(base + path, { waitUntil: "networkidle" });
  }
  await warm.close();

  const signedOut = await lightContext(browser, false);
  // The stats band would show the 63 invented jobs as "Live". Without its
  // API it shows the committed production figures, as on any failed call.
  await signedOut.route("**/api/public/stats*", (r) => r.abort());
  const landing = await load(await signedOut.newPage(), `${base}/`, (p) =>
    p.getByRole("heading", { level: 1 }).first(),
  );
  // Scroll the whole page once so scroll reveals run, and stop on the app
  // frame until its lazy image has loaded.
  const height = await landing.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y <= height; y += 600) {
    await landing.evaluate((y) => scrollTo(0, y), y);
    await landing.waitForTimeout(120);
  }
  const frame = landing.locator(".lp-browser img").first();
  await frame.scrollIntoViewIfNeeded();
  await expect
    .poll(() => frame.evaluate((img) => img.complete && img.naturalWidth > 0), {
      timeout: 30000,
    })
    .toBe(true);
  await landing.evaluate(() => scrollTo(0, 0));
  await shot(landing, "landing", { fullPage: true });
  await signedOut.close();

  const ctx = await lightContext(browser, true);
  // A fresh page per screen: in headless Chromium, a page that has taken a
  // full-page screenshot can repaint later shots in a fallback font.
  const open = async (path, ready) =>
    load(await ctx.newPage(), base + path, ready);

  let page = await open("/dashboard", (p) =>
    p.getByTestId("queue-row").first(),
  );
  await shot(page, "dashboard");
  await page.close();
  page = await open("/dashboard", (p) => p.getByTestId("queue-row").first());
  await shot(page, "dashboard-full", { fullPage: true });
  await page.close();
  page = await open("/dashboard", (p) => p.getByTestId("queue-row").first());
  await page.getByRole("button", { name: "How is this ranked?" }).click();
  await page.getByTestId("queue-ranking-note").first().waitFor();
  await shot(page, "daily-queue-reasons");
  await page.close();

  page = await open("/jobs", (p) => p.getByTestId("job-total").first());
  await shot(page, "jobs");
  // The relevance panel is tooltip content: it exists only while hovered.
  const badge = page.locator("[data-relevance-track]").first();
  await badge.scrollIntoViewIfNeeded();
  await badge.hover();
  await page.getByTestId("relevance-signals").first().waitFor();
  await shot(page, "jobs-relevance");
  await page.close();

  page = await open("/jobs", (p) => p.getByTestId("add-job").first());
  await page.getByTestId("add-job").first().click();
  await page.getByTestId("capture-dialog").first().waitFor();
  await page.getByTestId("capture-url").fill(CAPTURE_URL);
  await page.getByTestId("capture-text").fill(PASTED_JD);
  await page.getByTestId("capture-parse").click();
  await expect(page.getByTestId("capture-title")).toHaveValue(
    "Software Engineer Intern",
    { timeout: 15000 },
  );
  await shot(page, "capture");
  await page.close();

  page = await open("/applications", (p) =>
    p.getByTestId("board-card").first(),
  );
  await shot(page, "applications");
  await page.getByRole("button", { name: "Table" }).click();
  await page.getByTestId("application-row").first().waitFor();
  await shot(page, "applications-table");
  await page.close();

  page = await open("/tools/capture", (p) =>
    p.getByTestId("capture-bookmarklet"),
  );
  await shot(page, "capture-bookmarklet", { fullPage: true });
  await page.close();

  page = await open("/profile", (p) => p.getByLabel("Degree"));
  await expect(page.getByLabel("Degree")).toHaveValue("B.Tech", {
    timeout: 15000,
  });
  await shot(page, "profile", { fullPage: true });
  await page.close();

  page = await open("/settings", (p) =>
    p.getByRole("heading", { name: /Settings/ }).first(),
  );
  await shot(page, "settings", { fullPage: true });
  await page.close();

  page = await open("/dashboard", (p) => p.getByTestId("queue-row").first());
  await page.getByTestId("notification-bell").first().click();
  await page.getByTestId("notification-panel").waitFor();
  await shot(page, "notifications");
  await ctx.close();
}

function hasClerkDevKey() {
  const file = join(root, ".env");
  if (!existsSync(file)) return false;
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("VITE_CLERK_PUBLISHABLE_KEY="));
  return Boolean(line && line.includes("pk_test_"));
}

async function captureSignIn(browser) {
  if (!hasClerkDevKey()) {
    console.log(
      "  sign-in.png kept: no development VITE_CLERK_PUBLISHABLE_KEY in .env",
    );
    return;
  }
  // The normal dev server (real Clerk), which reads the root .env itself.
  const web = await start(
    "npx",
    ["vite", "--port", SIGN_IN_PORT, "--strictPort"],
    app,
    /Local:/,
    { PORT: SIGN_IN_PORT },
  );
  try {
    const ctx = await lightContext(browser, false);
    // A cold dev server answers too slowly for an optional font; warm it.
    const warm = await ctx.newPage();
    await warm.goto(`http://localhost:${SIGN_IN_PORT}/sign-in`);
    await warm.locator(".cl-rootBox, .cl-signIn-root").first().waitFor({
      timeout: 60000,
    });
    await warm.close();
    const page = await load(
      await ctx.newPage(),
      `http://localhost:${SIGN_IN_PORT}/sign-in`,
      // Clerk's card, drawn once clerk-js has loaded from Clerk's CDN.
      (p) => p.locator(".cl-rootBox, .cl-signIn-root").first(),
    );
    // Clerk keeps a connection open, so the network never goes idle here.
    await shot(page, "sign-in", { idle: false });
    await ctx.close();
  } finally {
    stop(web);
  }
}

async function main() {
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
  const browser = await chromium.launch();
  console.log(`writing ${out}`);
  try {
    await captureApp(browser, `http://localhost:${WEB_PORT}`);
  } finally {
    stop(web);
    stop(apiServer);
  }
  try {
    await captureSignIn(browser);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
