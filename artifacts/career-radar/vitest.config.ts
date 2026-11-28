import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
    // ── Why the root `pnpm run test` runs this suite after api-server's ──
    // Run side by side, api-server's PGlite workers starve these jsdom
    // workers. Measured on a 16-thread laptop: a landing render that takes
    // 0.2-0.6s alone took 4.6s or more, the worker's event loop stalled for
    // up to 1.2s at a time, and landing.test.tsx's first test ran out of its
    // 5s in 5 of 5 runs. Halving this suite's workers did not help; running
    // the packages one at a time did. CI already runs them as separate steps.
    // So the root script passes --workspace-concurrency=1 rather than any
    // test here raising its timeout.
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
