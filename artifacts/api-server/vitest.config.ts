import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Several suites boot PGlite — a real Postgres compiled to WASM — so that
    // the staleness sweeps run against actual rows instead of asserting that a
    // mock was called. First boot in a worker costs a few seconds, which blows
    // straight through vitest's 5s default.
    testTimeout: 60_000,
    hookTimeout: 60_000,

    // ── Why the worker count is pinned ──
    // Twelve suites now boot their own PGlite instance, and vitest's default is
    // to run one worker per core. On a sixteen-core machine with 7 GB of RAM
    // that is sixteen WASM Postgres engines at once: the box starts swapping
    // and the run never finishes — measured here, an unbounded run was still
    // going after twenty minutes and had completed seven of thirty-seven files,
    // while the same suite at four workers finishes in 65 seconds with all 771
    // tests passing. The bound is on MEMORY, not on cores, which is why it is a
    // constant rather than something derived from cpus().
    maxWorkers: 4,
  },
});
