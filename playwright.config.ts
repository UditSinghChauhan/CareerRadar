import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

// The suite reads DATABASE_URL / CLERK_* from the monorepo-root .env, the same
// file the dev servers use. Load it before defineConfig so webServer inherits it.
// process.cwd() rather than import.meta.dirname: the root package.json is not
// ESM, so Playwright transpiles this config to CJS where import.meta is absent.
// Playwright always resolves the config relative to the repo root anyway.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

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
  // reuseExistingServer keeps a dev session you already have open from being
  // torn down — locally it attaches, on CI it always starts clean.
  webServer: [
    {
      command: "pnpm --filter @workspace/api-server run dev",
      url: `http://localhost:${API_PORT}/api/healthz`,
      // PORT must be pinned per server. dotenv above puts the root .env's
      // PORT=8080 on this process, and both children would inherit it —
      // which silently boots Vite on 8080 and squats the API's port.
      env: { PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter @workspace/career-radar run dev",
      url: BASE_URL,
      env: { PORT: String(WEB_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
