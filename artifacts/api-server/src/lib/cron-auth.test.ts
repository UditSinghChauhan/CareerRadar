import { describe, it, expect } from "vitest";
import { verifyCronSecret } from "./cron-auth";

describe("verifyCronSecret — Phase 5.1 machine-to-machine gate", () => {
  it("rejects every request when SYNC_CRON_SECRET is unset", () => {
    // The important half of this case is that a *correct-looking* secret is
    // still rejected: "no secret configured" must never mean "open route".
    expect(verifyCronSecret("anything", undefined)).toEqual({
      ok: false,
      reason: "secret-not-configured",
    });
    expect(verifyCronSecret(undefined, undefined)).toEqual({
      ok: false,
      reason: "secret-not-configured",
    });
  });

  it("treats an empty-string SYNC_CRON_SECRET as unset", () => {
    // Render renders an unset variable as "" in some configurations, and an
    // empty secret that matched an empty header would be a wide-open route.
    expect(verifyCronSecret("", "")).toEqual({
      ok: false,
      reason: "secret-not-configured",
    });
  });

  it("accepts the exact secret", () => {
    expect(verifyCronSecret("s3cr3t-value", "s3cr3t-value")).toEqual({
      ok: true,
    });
  });

  it("rejects a missing or empty header when a secret is configured", () => {
    expect(verifyCronSecret(undefined, "s3cr3t-value")).toEqual({
      ok: false,
      reason: "header-missing",
    });
    expect(verifyCronSecret("", "s3cr3t-value")).toEqual({
      ok: false,
      reason: "header-missing",
    });
  });

  it("rejects a repeated header arriving as an array", () => {
    expect(
      verifyCronSecret(["s3cr3t-value", "s3cr3t-value"], "s3cr3t-value"),
    ).toEqual({ ok: false, reason: "header-missing" });
  });

  it("rejects a wrong secret of the same length", () => {
    expect(verifyCronSecret("s3cr3t-valuf", "s3cr3t-value")).toEqual({
      ok: false,
      reason: "secret-mismatch",
    });
  });

  it("rejects a prefix of the real secret rather than throwing", () => {
    // timingSafeEqual throws RangeError on unequal buffer lengths. The sha-256
    // step exists to make this path a plain mismatch; if that regressed, this
    // assertion would surface as a thrown error instead of a return value.
    expect(verifyCronSecret("s3cr3t", "s3cr3t-value")).toEqual({
      ok: false,
      reason: "secret-mismatch",
    });
  });

  it("rejects a much longer guess rather than throwing", () => {
    expect(verifyCronSecret("x".repeat(5000), "s3cr3t-value")).toEqual({
      ok: false,
      reason: "secret-mismatch",
    });
  });

  it("is case- and whitespace-sensitive", () => {
    expect(verifyCronSecret("S3CR3T-VALUE", "s3cr3t-value").ok).toBe(false);
    expect(verifyCronSecret(" s3cr3t-value", "s3cr3t-value").ok).toBe(false);
    expect(verifyCronSecret("s3cr3t-value\n", "s3cr3t-value").ok).toBe(false);
  });

  it("reads process.env.SYNC_CRON_SECRET when no secret is passed", () => {
    const previous = process.env["SYNC_CRON_SECRET"];
    process.env["SYNC_CRON_SECRET"] = "from-env";
    try {
      expect(verifyCronSecret("from-env")).toEqual({ ok: true });
      expect(verifyCronSecret("not-from-env")).toEqual({
        ok: false,
        reason: "secret-mismatch",
      });
    } finally {
      if (previous === undefined) delete process.env["SYNC_CRON_SECRET"];
      else process.env["SYNC_CRON_SECRET"] = previous;
    }
  });
});
