import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry, FetchError } from "./retry";

describe("FetchError.isRetryable", () => {
  it("is retryable for 429 (rate limited)", () => {
    expect(new FetchError(429, "Too Many Requests", "https://x").isRetryable).toBe(true);
  });

  it("is retryable for any 5xx", () => {
    expect(new FetchError(500, "Internal Server Error", "https://x").isRetryable).toBe(true);
    expect(new FetchError(503, "Service Unavailable", "https://x").isRetryable).toBe(true);
  });

  it("is not retryable for 4xx other than 429", () => {
    expect(new FetchError(400, "Bad Request", "https://x").isRetryable).toBe(false);
    expect(new FetchError(404, "Not Found", "https://x").isRetryable).toBe(false);
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a retryable error and returns the eventual success", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new FetchError(503, "Service Unavailable", "https://x"))
      .mockRejectedValueOnce(new FetchError(503, "Service Unavailable", "https://x"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable error — fails on the first attempt", async () => {
    const err = new FetchError(400, "Bad Request", "https://x");
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 });
    const assertion = expect(promise).rejects.toBe(err);
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and throws the last error", async () => {
    const err = new FetchError(503, "Service Unavailable", "https://x");
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);

    const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 50 });
    const assertion = expect(promise).rejects.toBe(err);
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries network-level TypeErrors via the default retry predicate", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce("ok");

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry an unrecognized thrown value under the default predicate", async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue("boom");

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 50 });
    const assertion = expect(promise).rejects.toBe("boom");
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
