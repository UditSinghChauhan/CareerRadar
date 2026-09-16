import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// The suite reads DATABASE_URL / CLERK_* from the monorepo-root .env, the same
// file the dev servers use. Load it before defineConfig so webServer inherits it.
// process.cwd() rather than import.meta.dirname: the root package.json is not
// ESM, so Playwright transpiles this config to CJS where import.meta is absent.
// Playwright always resolves the config relative to the repo root anyway.
//
// override: true is load-bearing, not tidiness. dotenv's default is to leave an
// already-exported variable alone, so any stale value in the launching shell
// silently wins over the file — and the only hint is dotenv's own
// "injecting env (0)" line, which reads like success. That cost a long
// debugging session once: a hand-edit to .env had glued PORT=8080 onto the end
// of VITE_CLERK_PUBLISHABLE_KEY, the broken value got exported into a shell,
// and repairing the file changed nothing because the export kept overriding it.
// Clerk derived an empty frontend API from the malformed key, failed to load
// clerk-js from "https:///npm/...", and all 14 signed-in specs timed out on
// `window.Clerk.loaded` with no error pointing anywhere near the cause.
//
// For a test harness the file is the intended source of truth: a run should
// exercise the committed dev configuration, not whatever happens to be in the
// operator's environment.
dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });

const WEB_PORT = 5173;
const API_PORT = 8080;

export const BASE_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // These specs share one Clerk user and one local database, so they are
  // sequential by construction — a parallel apply/drag would race the rows.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "e2e/.report" }],
  ],

  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Playwright owns the lifecycle of both servers: it boots them, polls the
  // URLs below until they answer, and kills them when the run ends.
  //
  // reuseExistingServer is FALSE EVERYWHERE, including locally. It used to be
  // `!process.env.CI`, so a dev server you already had open was attached to
  // instead of being replaced — which sounds convenient and is a correctness
  // hazard: that server was started from whatever environment and whatever
  // source it happened to have at the time. It produced a false verification
  // once. A repaired .env was proved "working" against a Vite process that had
  // been started before the repair and was still serving the broken value, and
  // the suite reported the old behaviour with no indication anything was stale.
  //
  // With this false, a server already holding the port makes the run fail
  // loudly on a port conflict rather than quietly testing the wrong build. That
  // costs a rebuild on every local run; a suite whose green result cannot be
  // trusted costs more. If a run fails because a port is taken, stop your dev
  // server — that message is the feature.
  webServer: [
    {
      command: "pnpm --filter @workspace/api-server run dev",
      url: `http://localhost:${API_PORT}/api/healthz`,
      // PORT must be pinned per server. dotenv above puts the root .env's
      // PORT=8080 on this process, and both children would inherit it —
      // which silently boots Vite on 8080 and squats the API's port.
      //
      // SYNC_CRON_SECRET is pinned here so e2e/sync-cron.spec.ts can prove the
      // Phase 5.1 gate rejects a wrong secret. The spec never sends the correct
      // one: a valid call returns 202 and starts a real sync across every
      // enabled config, which is not something a test suite should set off.
      // The 202 path is covered in artifacts/api-server/src/routes/sync.test.ts
      // against a mocked scheduler.
      env: {
        PORT: String(API_PORT),
        SYNC_CRON_SECRET: "e2e-cron-secret-never-sent-by-the-suite",
        // Phase 8 acceptance criterion: "Every page renders with
        // GEMINI_API_KEY unset." Pinned to empty here rather than relying on
        // the root .env happening not to define it, so the criterion is
        // something the suite ENFORCES rather than something it gets by luck
        // on one machine. A developer who later adds the key to .env must not
        // silently stop testing the degraded path — which is the path that
        // runs on every local machine and would otherwise never be exercised.
        //
        // The AI-present path cannot be covered here for the opposite reason:
        // it would make real, quota-consuming Gemini requests on every run.
        // It is covered against an injected fake in
        // artifacts/api-server/src/services/match-scores.test.ts.
        GEMINI_API_KEY: "",
      },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter @workspace/career-radar run dev",
      url: BASE_URL,
      env: { PORT: String(WEB_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
