import { describe, it, expect } from "vitest";
import {
  GEMINI_MODEL,
  GeminiQuotaError,
  MEASURED_FREE_TIER_RPM,
  asQuotaError,
  stripJsonFences,
} from "./ai-matching.service";

/**
 * Phase 8 — reading Gemini's own verdict off a 429.
 *
 * The fixtures below are NOT invented. They are the verbatim bodies returned by
 * `generativelanguage.googleapis.com` on 2026-09-16 when this project's key was
 * burst past its free-tier limit, trimmed only of the Help link. Everything the
 * batch scorer decides — retry or stop, and how long to wait — is read out of
 * these, so a fabricated shape here would prove nothing about the real thing.
 */

/** 25 concurrent requests to gemini-3.5-flash-lite; 11 came back like this. */
const PER_MINUTE_429 = {
  status: 429,
  message:
    "Error fetching from https://generativelanguage.googleapis.com/...: [429 Too Many Requests] You exceeded your current quota",
  errorDetails: [
    {
      "@type": "type.googleapis.com/google.rpc.QuotaFailure",
      violations: [
        {
          quotaMetric:
            "generativelanguage.googleapis.com/generate_content_free_tier_requests",
          quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
          quotaDimensions: {
            location: "global",
            model: "gemini-3.5-flash-lite",
          },
          quotaValue: "15",
        },
      ],
    },
    {
      "@type": "type.googleapis.com/google.rpc.RetryInfo",
      retryDelay: "22.211135101s",
    },
  ],
};

/** The same burst against gemini-3.6-flash, whose limit measured 5/min. */
const PER_MINUTE_429_SHORT_DELAY = {
  status: 429,
  errorDetails: [
    {
      "@type": "type.googleapis.com/google.rpc.QuotaFailure",
      violations: [
        {
          quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
          quotaValue: "5",
        },
      ],
    },
    {
      "@type": "type.googleapis.com/google.rpc.RetryInfo",
      retryDelay: "638.876453ms",
    },
  ],
};

/**
 * The per-day shape. Google uses the same envelope and metric and only changes
 * the quota id, which is exactly why the id — not the message — is what the
 * code branches on.
 */
const PER_DAY_429 = {
  status: 429,
  errorDetails: [
    {
      "@type": "type.googleapis.com/google.rpc.QuotaFailure",
      violations: [
        {
          quotaMetric:
            "generativelanguage.googleapis.com/generate_content_free_tier_requests",
          quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
        },
      ],
    },
  ],
};

describe("asQuotaError", () => {
  it("reads a per-minute quota and its retry delay", () => {
    const quota = asQuotaError(PER_MINUTE_429);
    expect(quota).toBeInstanceOf(GeminiQuotaError);
    expect(quota!.scope).toBe("minute");
    expect(quota!.quotaId).toBe(
      "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
    );
    expect(quota!.retryDelayMs).toBe(22_211);
  });

  it("parses a sub-second retry delay expressed in ms", () => {
    expect(asQuotaError(PER_MINUTE_429_SHORT_DELAY)!.retryDelayMs).toBe(639);
  });

  it("reads a per-day quota as a stop, with no delay to wait out", () => {
    const quota = asQuotaError(PER_DAY_429);
    expect(quota!.scope).toBe("day");
    expect(quota!.retryDelayMs).toBeNull();
  });

  it("treats a 429 that names no quota as a stop, not a retry", () => {
    const quota = asQuotaError({ status: 429, errorDetails: [] });
    expect(quota!.scope).toBe("unknown");
  });

  /**
   * The bug this file's sibling suite caught. `generateMatchScore` converts the
   * SDK error before rethrowing, so the batch scorer's catch never sees a
   * `.status` — and without idempotence here it would treat every real quota
   * refusal as an ordinary failure and keep spending requests.
   */
  it("passes an already-converted GeminiQuotaError straight through", () => {
    const original = new GeminiQuotaError("q", "day", null, "SomePerDayQuota");
    expect(asQuotaError(original)).toBe(original);
  });

  it("is null for anything that is not a 429", () => {
    expect(asQuotaError(new Error("network down"))).toBeNull();
    expect(asQuotaError({ status: 500 })).toBeNull();
    expect(asQuotaError(null)).toBeNull();
    expect(asQuotaError("nope")).toBeNull();
  });
});

describe("the model this deployment calls", () => {
  /**
   * A regression guard with a specific history: `gemini-2.0-flash` was retired
   * by Google and every call 404'd for months while the catch turned it into
   * `null`, which is indistinguishable from "no API key". If this constant ever
   * reads a 2.x name again, something has been reverted.
   */
  it("is not one of the retired models", () => {
    expect(GEMINI_MODEL).not.toMatch(/^gemini-2\./);
    expect(GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
  });

  it("records the measured per-minute allowance", () => {
    expect(MEASURED_FREE_TIER_RPM).toBe(15);
  });
});

describe("stripJsonFences", () => {
  it("survives the fenced reply the prompt asked Gemini not to produce", () => {
    expect(stripJsonFences('```json\n{"score":1}\n```')).toBe('{"score":1}');
    expect(stripJsonFences('{"score":1}')).toBe('{"score":1}');
  });
});
