import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several suites boot PGlite — a real Postgres compiled to WASM — so that
    // the staleness sweeps run against actual rows instead of asserting that a
    // mock was called. First boot in a worker costs a few seconds, which blows
    // straight through vitest's 5s default.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
