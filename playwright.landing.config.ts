import { defineConfig, devices } from "@playwright/test";

/**
 * The landing's scroll test (e2e-landing/). Unlike the main suite it needs no
 * database, API or Clerk account: it runs against a built landing, by default
 * `vite preview` on port 5198, or whatever LANDING_URL points at.
 *
 *   pnpm --filter @workspace/career-radar run build
 *   pnpm --filter @workspace/career-radar exec vite preview --port 5198
 *   pnpm run test:landing
 */
export default defineConfig({
  testDir: "./e2e-landing",
  // Its own folder, so this run does not clear the main suite's traces.
  outputDir: "./e2e-landing/.results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  // As in playwright.config.ts: one retry in CI only.
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "e2e-landing/.report" }],
  ],
  use: {
    baseURL: process.env.LANDING_URL ?? "http://localhost:5198",
    // Tracing slows the scroll and motion specs it records, so only the
    // CI retry of a failed spec is traced.
    trace: process.env.CI ? "on-first-retry" : "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
