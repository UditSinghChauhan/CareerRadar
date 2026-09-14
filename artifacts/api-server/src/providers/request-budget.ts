/**
 * Per-run request budgets for metered aggregator APIs.
 * ─────────────────────────────────────────────────────
 * Phase 5.5 multiplies the aggregators from one query each to eight queries
 * with pagination. That is the cheapest way to widen intake, and also the
 * easiest way to burn a month of JSearch's 200-request free tier in a single
 * afternoon of testing. A budget caps how many HTTP calls one provider run may
 * make and stops cleanly when the cap is reached.
 *
 * FAIL CLOSED, AND QUIETLY
 * ─────────────────────────
 * Exhaustion is a normal outcome, not an error. `tryConsume()` returns false
 * and the provider returns the jobs it already collected; it never throws. This
 * matters more than it looks:
 *
 *   - A throw would be recorded as `status: "failure"` in provider_sync_logs,
 *     which would make the Phase 5.2 boot-sync guard treat a perfectly good
 *     partial run as "no successful sync yet" and re-run on the next wake —
 *     burning more of the same budget that just ran out.
 *   - A throw would also lose every job already fetched in that run.
 *
 * WHY A PARTIAL RUN CANNOT MIS-CLOSE JOBS
 * ────────────────────────────────────────
 * A budget-truncated run returns fewer jobs than a complete one, which on an
 * ATS provider would look exactly like "the employer closed those roles" and
 * trigger the Phase 1.5 last-seen sweep. It cannot here: every provider that
 * uses a budget is an aggregator, and `closeUnseenJobs` checks
 * `isAggregatorPlatform()` FIRST and returns `noop("aggregator-platform")`
 * before it looks at any count. Aggregators fall back to the age sweep, which
 * reads only `posted_date` and is indifferent to how much this run fetched.
 *
 * That ordering is load-bearing. Any new provider that uses a budget MUST also
 * be added to `AGGREGATOR_PLATFORMS` in staleness.ts — there is a test in
 * staleness.test.ts asserting exactly this pairing.
 */

import { logger } from "../lib/logger";

export interface BudgetState {
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
}

export class RequestBudget {
  private consumed = 0;
  private warned = false;

  constructor(
    readonly limit: number,
    private readonly label: string,
  ) {}

  /**
   * Claim one request. Returns false when the budget is spent — the caller must
   * stop making requests and return what it has.
   */
  tryConsume(): boolean {
    if (this.consumed >= this.limit) {
      if (!this.warned) {
        this.warned = true;
        logger.warn(
          { provider: this.label, limit: this.limit, used: this.consumed },
          `[${this.label}] Request budget exhausted after ${this.consumed} request(s) — ` +
            `stopping cleanly and keeping what was already fetched. ` +
            `Raise the budget env var if this truncates too much.`,
        );
      }
      return false;
    }
    this.consumed++;
    return true;
  }

  get used(): number {
    return this.consumed;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.consumed);
  }

  get exhausted(): boolean {
    return this.consumed >= this.limit;
  }

  state(): BudgetState {
    return {
      limit: this.limit,
      used: this.consumed,
      remaining: this.remaining,
      exhausted: this.exhausted,
    };
  }
}

/**
 * Read a budget from an env var, falling back to `fallback`.
 *
 * A missing, unparseable or negative value uses the fallback rather than
 * throwing: this runs inside the scheduler, and a typo in an env var must not
 * take ingestion down. Zero is honoured exactly — `JSEARCH_MAX_REQUESTS=0` is
 * a legitimate way to park a metered provider without editing config.ts.
 */
export function budgetFromEnv(
  envVar: string,
  fallback: number,
  label: string,
): RequestBudget {
  const raw = process.env[envVar];
  const parsed =
    raw !== undefined && raw !== "" ? Number.parseInt(raw, 10) : NaN;

  if (!Number.isFinite(parsed) || parsed < 0) {
    if (raw !== undefined && raw !== "") {
      logger.warn(
        { [envVar]: raw, fallback },
        `${envVar} is not a non-negative integer — using the default`,
      );
    }
    return new RequestBudget(fallback, label);
  }

  return new RequestBudget(parsed, label);
}
