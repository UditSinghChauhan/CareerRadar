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
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: process.env.LANDING_URL ?? "http://localhost:5198",
    trace: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
