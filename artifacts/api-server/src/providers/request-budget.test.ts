import { describe, it, expect, afterEach, vi } from "vitest";

// `./staleness` imports @workspace/db, which throws at module scope when
// DATABASE_URL is unset. This suite only reads the AGGREGATOR_PLATFORMS
// constant and never touches a row, so it stubs the module rather than
// requiring every contributor (and every CI job that runs only unit tests) to
// have a database provisioned just to check a list of strings.
vi.mock("@workspace/db", () => ({
  db: {},
  jobsTable: {},
  providerSyncLogsTable: {},
}));

import { RequestBudget, budgetFromEnv } from "./request-budget";
import { AGGREGATOR_PLATFORMS, isAggregatorPlatform } from "./staleness";

describe("RequestBudget — Phase 5.5 fail-closed metering", () => {
  it("allows exactly `limit` requests and then stops", () => {
    const budget = new RequestBudget(3, "test");

    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);

    expect(budget.used).toBe(3);
    expect(budget.remaining).toBe(0);
    expect(budget.exhausted).toBe(true);
  });

  it("never overshoots the limit no matter how often it is asked", () => {
    // The cap is the whole point: overshooting it is what burns a monthly quota.
    const budget = new RequestBudget(2, "test");
    for (let i = 0; i < 100; i++) budget.tryConsume();
    expect(budget.used).toBe(2);
  });

  it("returns false rather than throwing when exhausted", () => {
    // A throw would be recorded as a failed sync, which would make the Phase 5.2
    // boot-sync guard re-run on the next wake and spend even more budget.
    const budget = new RequestBudget(0, "test");
    expect(() => budget.tryConsume()).not.toThrow();
    expect(budget.tryConsume()).toBe(false);
  });

  it("honours a zero limit as a way to park a provider", () => {
    const budget = new RequestBudget(0, "test");
    expect(budget.exhausted).toBe(true);
    expect(budget.state()).toEqual({
      limit: 0,
      used: 0,
      remaining: 0,
      exhausted: true,
    });
  });
});

describe("budgetFromEnv", () => {
  const VAR = "TEST_BUDGET_VAR";

  afterEach(() => {
    delete process.env[VAR];
  });

  it("reads an integer from the environment", () => {
    process.env[VAR] = "7";
    expect(budgetFromEnv(VAR, 20, "test").limit).toBe(7);
  });

  it("honours an explicit zero", () => {
    process.env[VAR] = "0";
    expect(budgetFromEnv(VAR, 20, "test").limit).toBe(0);
  });

  it("falls back on a missing, empty, unparseable or negative value", () => {
    // This runs inside the scheduler — a typo in an env var must not throw.
    expect(budgetFromEnv(VAR, 20, "test").limit).toBe(20);

    for (const bad of ["", "twenty", "-5", "NaN"]) {
      process.env[VAR] = bad;
      expect(budgetFromEnv(VAR, 20, "test").limit).toBe(20);
    }
  });
});

/**
 * The interaction the budget could break, locked down.
 *
 * A budget-truncated run returns FEWER jobs than a complete one. On an ATS
 * provider that pattern is precisely what the Phase 1.5 last-seen sweep reads
 * as "the employer closed these roles". The only thing preventing a partial
 * aggregator run from mass-closing rows is that closeUnseenJobs checks
 * isAggregatorPlatform() before it looks at any count.
 *
 * So every provider that can return a truncated result must be an aggregator.
 * If someone adds a budget to a new provider and forgets this list, this test
 * fails rather than the production table quietly losing rows.
 */
describe("budgeted providers are all aggregator platforms", () => {
  /** Providers whose fetch can stop early: a request budget, or a hard page cap. */
  const TRUNCATABLE_PROVIDERS = [
    "jsearch", // JSEARCH_MAX_REQUESTS
    "adzuna", // ADZUNA_MAX_REQUESTS
    "arbeitnow", // ARBEITNOW_MAX_REQUESTS
    "jobicy", // capped at 50 results per call
    "remoteok",
    "remotive",
  ];

  it.each(TRUNCATABLE_PROVIDERS)(
    "%s is in AGGREGATOR_PLATFORMS, so the last-seen sweep can never run against it",
    (platform) => {
      expect(isAggregatorPlatform(platform)).toBe(true);
    },
  );

  it("AGGREGATOR_PLATFORMS contains every truncatable provider and nothing was dropped", () => {
    for (const platform of TRUNCATABLE_PROVIDERS) {
      expect([...AGGREGATOR_PLATFORMS]).toContain(platform);
    }
  });

  it("does NOT classify the authoritative ATS providers as aggregators", () => {
    // The mirror image: if greenhouse ever landed in this list, the last-seen
    // sweep would stop closing anything and Phase 1.5 would silently regress.
    for (const ats of ["greenhouse", "lever", "ashby", "smartrecruiters"]) {
      expect(isAggregatorPlatform(ats)).toBe(false);
    }
  });
});
