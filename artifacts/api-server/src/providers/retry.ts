import { logger } from "../lib/logger";

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff. Default: 500. */
  baseDelayMs?: number;
  /** Maximum delay cap in ms. Default: 15_000. */
  maxDelayMs?: number;
  /** Label used in log messages. */
  label?: string;
  /**
   * Predicate — return true if the error is retryable.
   * Default: retries on network errors and HTTP 429/5xx.
   */
  isRetryable?: (err: unknown) => boolean;
}

function defaultIsRetryable(err: unknown): boolean {
  if (err instanceof FetchError) return err.isRetryable;
  // Network-level errors (no response)
  if (err instanceof TypeError) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compute delay with full jitter: random(0, min(cap, base * 2^attempt)) */
function jitteredDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * exponential);
}

/**
 * Wraps an async function with configurable retry + exponential backoff.
 *
 * @example
 * const data = await withRetry(() => fetch(url), { label: "greenhouse:google" });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 15_000,
    label = "unknown",
    isRetryable = defaultIsRetryable,
  } = opts;

  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err) || attempt === maxAttempts - 1) {
        logger.warn({ err, label, attempt }, "Non-retryable error or max attempts reached");
        throw err;
      }

      const delay = jitteredDelay(attempt, baseDelayMs, maxDelayMs);
      logger.info({ label, attempt, delay, err }, "Retrying after delay");
      await sleep(delay);
    }
  }

  throw lastErr;
}

/** Typed HTTP error that carries status code info for retry decisions. */
export class FetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string,
  ) {
    super(`HTTP ${status} ${statusText} — ${url}`);
    this.name = "FetchError";
  }

  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/**
 * Lightweight HTTP GET helper — throws FetchError on non-2xx responses.
 * Uses the global `fetch` available in Node 18+.
 */
export async function httpGet<T>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  const { headers = {}, timeoutMs = 10_000 } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "CareerRadar/0.2 (job-aggregator; contact via repo)",
        "Accept": "application/json",
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new FetchError(response.status, response.statusText, url);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
