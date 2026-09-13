import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  getConnectTimeoutMs,
} from "@workspace/db/connect-timeout";

/**
 * node-postgres defaults this to 0 — wait until the kernel gives up, roughly two
 * minutes later, with a bare ETIMEDOUT. That is what made the backfill look like
 * a hang. The default here has to stay comfortably above a Neon cold start and
 * comfortably below the kernel's own timeout.
 */
describe("getConnectTimeoutMs", () => {
  it("defaults to 30s — above a Neon cold start, below the kernel's ~127s", () => {
    expect(getConnectTimeoutMs({})).toBe(DEFAULT_CONNECT_TIMEOUT_MS);
    expect(DEFAULT_CONNECT_TIMEOUT_MS).toBeGreaterThan(10_000);
    expect(DEFAULT_CONNECT_TIMEOUT_MS).toBeLessThan(120_000);
  });

  it("reads an override", () => {
    expect(getConnectTimeoutMs({ DATABASE_CONNECT_TIMEOUT_MS: "5000" })).toBe(
      5000,
    );
  });

  it("honours 0 as the explicit escape hatch back to waiting forever", () => {
    expect(getConnectTimeoutMs({ DATABASE_CONNECT_TIMEOUT_MS: "0" })).toBe(0);
  });

  it("falls back to the default rather than throwing on a bad value", () => {
    // This runs at import time inside the server bundle: a typo must not stop
    // the process from booting.
    for (const raw of ["", "   ", "soon", "-1", "NaN"]) {
      expect(getConnectTimeoutMs({ DATABASE_CONNECT_TIMEOUT_MS: raw })).toBe(
        DEFAULT_CONNECT_TIMEOUT_MS,
      );
    }
  });
});
