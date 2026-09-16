import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

/**
 * Phase 8 — the nightly batch scorer.
 *
 * Real Postgres (PGlite): the selection is the part most likely to be wrong,
 * and it is entirely SQL — a LEFT JOIN anti-match on the score table, an
 * `is_fresher_eligible` filter and a `DESC NULLS LAST` ordering. A mocked
 * repository would assert the shape of a call and prove none of that.
 *
 * Gemini is injected as a fake throughout. The suite also raises `pacedRpm`,
 * because the shipped 12 req/min means a 5-second gap between requests and a
 * ten-job assertion would otherwise take a minute of real waiting.
 */
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import { companiesTable, jobsTable, profilesTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { jobMatchScoresRepository } from "../repositories/jobMatchScores.repository";
import {
  DEFAULT_BATCH_LIMIT,
  DEFAULT_CONCURRENCY,
  PACED_RPM,
  runBatchScoring,
  type BatchProfile,
} from "./match-scores.batch";
import { GeminiQuotaError, type MatchScoreResult } from "./ai-matching.service";

let testDb: TestDb;
let profile: BatchProfile;
let companyId: string;

const RESULT: MatchScoreResult = {
  score: 77,
  summary: "Reasonable fit.",
  matchingSkills: ["TypeScript"],
  missingSkills: ["Java"],
  recommendations: ["Learn Java."],
};

/** Fast enough that the gate never actually sleeps in this suite. */
const FAST = { pacedRpm: 60_000, concurrency: DEFAULT_CONCURRENCY };

interface JobSpec {
  title: string;
  relevanceScore: number | null;
  isFresherEligible?: boolean;
  status?: "active" | "closed" | "draft";
}

async function insertJobs(specs: JobSpec[]): Promise<Record<string, string>> {
  const rows = await testDb
    .insert(jobsTable)
    .values(
      specs.map((spec) => ({
        companyId,
        title: spec.title,
        jobType: "internship" as const,
        relevanceScore: spec.relevanceScore,
        isFresherEligible: spec.isFresherEligible ?? true,
        status: spec.status ?? ("active" as const),
      })),
    )
    .returning({ id: jobsTable.id, title: jobsTable.title });
  return Object.fromEntries(rows.map((r) => [r.title, r.id]));
}

beforeAll(async () => {
  testDb = await getTestDb();
});

beforeEach(async () => {
  await truncateAll(testDb);
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("AI_DAILY_BUDGET", "1000");

  const [row] = await testDb
    .insert(profilesTable)
    .values({
      clerkId: "user_batch",
      name: "Batch User",
      email: "batch@example.com",
      skills: ["TypeScript", "SQL"],
    })
    .returning({ id: profilesTable.id });

  profile = {
    id: row!.id,
    name: "Batch User",
    skills: ["TypeScript", "SQL"],
    degree: "B.Tech",
    branch: "IT",
    college: "NSUT",
    graduationYear: 2027,
    cgpa: 8.4,
    resumeUrl: null,
  };

  const [company] = await testDb
    .insert(companiesTable)
    .values({ name: "Acme", slug: "acme" })
    .returning({ id: companiesTable.id });
  companyId = company!.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the shipped defaults", () => {
  it("matches what UPGRADE.md §8 asks for and what was measured", () => {
    expect(DEFAULT_BATCH_LIMIT).toBe(50);
    expect(DEFAULT_CONCURRENCY).toBe(2);
    // 80% of the measured free-tier 15 req/min, floored.
    expect(PACED_RPM).toBe(12);
  });
});

describe("selection — top N by relevance, never arbitrary rows", () => {
  it("scores the highest relevance scores first and stops at the limit", async () => {
    await insertJobs([
      { title: "A", relevanceScore: 95 },
      { title: "B", relevanceScore: 90 },
      { title: "C", relevanceScore: 20 },
      { title: "D", relevanceScore: 55 },
    ]);

    const seen: string[] = [];
    const generate = vi.fn(async (_p: unknown, job: { title: string }) => {
      seen.push(job.title);
      return RESULT;
    });

    const report = await runBatchScoring(profile, {
      ...FAST,
      limit: 2,
      concurrency: 1,
      generate: generate as never,
    });

    expect(report.scored).toBe(2);
    expect(report.requests).toBe(2);
    expect(seen).toEqual(["A", "B"]);
  });

  it("never spends a request on a not_relevant posting", async () => {
    await insertJobs([
      {
        title: "Senior Staff Engineer",
        relevanceScore: 99,
        isFresherEligible: false,
      },
      { title: "SDE Intern", relevanceScore: 10 },
    ]);

    const seen: string[] = [];
    const generate = vi.fn(async (_p: unknown, job: { title: string }) => {
      seen.push(job.title);
      return RESULT;
    });

    const report = await runBatchScoring(profile, {
      ...FAST,
      generate: generate as never,
    });

    // The 99-relevance row is excluded despite outranking everything, because
    // is_fresher_eligible is false — the user will never apply to it.
    expect(seen).toEqual(["SDE Intern"]);
    expect(report.requests).toBe(1);
  });

  it("ignores closed jobs", async () => {
    await insertJobs([
      { title: "Closed", relevanceScore: 99, status: "closed" },
      { title: "Open", relevanceScore: 50 },
    ]);
    const seen: string[] = [];
    const generate = vi.fn(async (_p: unknown, job: { title: string }) => {
      seen.push(job.title);
      return RESULT;
    });
    await runBatchScoring(profile, { ...FAST, generate: generate as never });
    expect(seen).toEqual(["Open"]);
  });

  it("sorts an unclassified job last rather than first", async () => {
    await insertJobs([
      { title: "Unclassified", relevanceScore: null },
      { title: "Classified", relevanceScore: 5 },
    ]);
    const seen: string[] = [];
    const generate = vi.fn(async (_p: unknown, job: { title: string }) => {
      seen.push(job.title);
      return RESULT;
    });
    await runBatchScoring(profile, {
      ...FAST,
      concurrency: 1,
      generate: generate as never,
    });
    expect(seen).toEqual(["Classified", "Unclassified"]);
  });

  it("does not re-score a job it already scored — the second run is free", async () => {
    await insertJobs([
      { title: "A", relevanceScore: 90 },
      { title: "B", relevanceScore: 80 },
    ]);
    const generate = vi.fn(async () => RESULT);

    const first = await runBatchScoring(profile, {
      ...FAST,
      generate: generate as never,
    });
    expect(first.requests).toBe(2);

    const second = await runBatchScoring(profile, {
      ...FAST,
      generate: generate as never,
    });
    expect(second.candidates).toBe(0);
    expect(second.requests).toBe(0);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("picks a job back up once the profile's skills change", async () => {
    await insertJobs([{ title: "A", relevanceScore: 90 }]);
    const generate = vi.fn(async () => RESULT);

    await runBatchScoring(profile, { ...FAST, generate: generate as never });
    const again = await runBatchScoring(
      { ...profile, skills: ["Rust"] },
      { ...FAST, generate: generate as never },
    );
    expect(again.requests).toBe(1);
    expect(again.scored).toBe(1);
  });
});

describe("running out of quota mid-run", () => {
  function quota(scope: "minute" | "day", retryDelayMs: number | null = 0) {
    return new GeminiQuotaError(
      "quota",
      scope,
      retryDelayMs,
      scope === "minute"
        ? "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"
        : "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
    );
  }

  /**
   * The behaviour the phase brief asks about directly: what happens when the
   * budget runs out halfway. Everything already scored is committed, the run
   * stops rather than walking the rest of the list, and the report says why.
   */
  it("stops the whole run on a per-DAY 429 and keeps what it already scored", async () => {
    await insertJobs(
      Array.from({ length: 10 }, (_, i) => ({
        title: `J${String(i).padStart(2, "0")}`,
        relevanceScore: 100 - i,
      })),
    );

    let calls = 0;
    const generate = vi.fn(async () => {
      calls++;
      if (calls > 3) throw quota("day");
      return RESULT;
    });

    const report = await runBatchScoring(profile, {
      ...FAST,
      concurrency: 1,
      generate: generate as never,
    });

    expect(report.stoppedBy).toBe("daily_quota");
    expect(report.quotaId).toContain("PerDay");
    expect(report.scored).toBe(3);
    // It did not keep trying the remaining seven.
    expect(report.requests).toBe(4);
    expect(report.skipped).toBe(7);

    // And the three it did score are really in the table, not lost with the run.
    expect(await jobMatchScoresRepository.countForProfile(profile.id)).toBe(3);
  });

  it("resumes from where a stopped run left off", async () => {
    await insertJobs(
      Array.from({ length: 5 }, (_, i) => ({
        title: `J${i}`,
        relevanceScore: 100 - i,
      })),
    );

    let calls = 0;
    const stopping = vi.fn(async () => {
      calls++;
      if (calls > 2) throw quota("day");
      return RESULT;
    });
    await runBatchScoring(profile, {
      ...FAST,
      concurrency: 1,
      generate: stopping as never,
    });

    const seen: string[] = [];
    const resuming = vi.fn(async (_p: unknown, job: { title: string }) => {
      seen.push(job.title);
      return RESULT;
    });
    const second = await runBatchScoring(profile, {
      ...FAST,
      concurrency: 1,
      generate: resuming as never,
    });

    expect(second.scored).toBe(3);
    expect(seen).toEqual(["J2", "J3", "J4"]);
  });

  it("retries a per-MINUTE 429 and still scores the job", async () => {
    await insertJobs([{ title: "A", relevanceScore: 90 }]);

    let calls = 0;
    const generate = vi.fn(async () => {
      calls++;
      if (calls === 1) throw quota("minute", 0);
      return RESULT;
    });

    const report = await runBatchScoring(profile, {
      ...FAST,
      concurrency: 1,
      generate: generate as never,
    });

    expect(report.scored).toBe(1);
    expect(report.rateLimitRetries).toBe(1);
    expect(report.stoppedBy).toBe("completed");
    expect(report.requests).toBe(2);
  });

  it("gives up on one job after repeated per-minute 429s without stopping the run", async () => {
    await insertJobs([
      { title: "A", relevanceScore: 90 },
      { title: "B", relevanceScore: 80 },
    ]);

    const generate = vi.fn(async (_p: unknown, job: { title: string }) => {
      if (job.title === "A") throw quota("minute", 0);
      return RESULT;
    });

    const report = await runBatchScoring(profile, {
      ...FAST,
      concurrency: 1,
      generate: generate as never,
    });

    expect(report.failed).toBe(1);
    expect(report.scored).toBe(1);
    expect(report.stoppedBy).toBe("completed");
    expect(report.errors[0]?.reason).toBe("rate limited");
  });

  it("treats a 429 with no named quota as a stop, not a retry", async () => {
    await insertJobs([
      { title: "A", relevanceScore: 90 },
      { title: "B", relevanceScore: 80 },
    ]);
    const generate = vi.fn(async () => {
      throw new GeminiQuotaError("quota", "unknown", null, null);
    });
    const report = await runBatchScoring(profile, {
      ...FAST,
      concurrency: 1,
      generate: generate as never,
    });
    expect(report.stoppedBy).toBe("daily_quota");
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("degradation", () => {
  it("makes no requests and reports no_key when GEMINI_API_KEY is unset", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await insertJobs([{ title: "A", relevanceScore: 90 }]);
    const generate = vi.fn(async () => RESULT);
    const report = await runBatchScoring(profile, {
      ...FAST,
      generate: generate as never,
    });
    expect(report.stoppedBy).toBe("no_key");
    expect(report.requests).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it("dryRun reports the candidates and makes no requests at all", async () => {
    await insertJobs([
      { title: "A", relevanceScore: 90 },
      { title: "B", relevanceScore: 80 },
    ]);
    const generate = vi.fn(async () => RESULT);
    const report = await runBatchScoring(profile, {
      ...FAST,
      dryRun: true,
      generate: generate as never,
    });
    expect(report.candidates).toBe(2);
    expect(report.requests).toBe(0);
    expect(report.skipped).toBe(2);
    expect(generate).not.toHaveBeenCalled();
    expect(await jobMatchScoresRepository.countForProfile(profile.id)).toBe(0);
  });

  it("records a job whose reply could not be parsed without stopping", async () => {
    await insertJobs([
      { title: "A", relevanceScore: 90 },
      { title: "B", relevanceScore: 80 },
    ]);
    const generate = vi.fn(async (_p: unknown, job: { title: string }) =>
      job.title === "A" ? null : RESULT,
    );
    const report = await runBatchScoring(profile, {
      ...FAST,
      concurrency: 1,
      generate: generate as never,
    });
    expect(report.failed).toBe(1);
    expect(report.scored).toBe(1);
    expect(report.errors[0]?.reason).toBe("unparseable or empty reply");
  });
});

describe("pacing", () => {
  /**
   * Not a timing assertion on the shipped value — that would be a five-second
   * test. It proves the gate exists and is honoured: at 600 req/min the spacing
   * is 100ms, so four requests with concurrency 2 cannot finish instantly.
   */
  it("spaces request starts rather than firing them all at once", async () => {
    await insertJobs(
      Array.from({ length: 4 }, (_, i) => ({
        title: `J${i}`,
        relevanceScore: 100 - i,
      })),
    );
    const generate = vi.fn(async () => RESULT);
    const started = Date.now();
    const report = await runBatchScoring(profile, {
      pacedRpm: 600,
      concurrency: 2,
      generate: generate as never,
    });
    const elapsed = Date.now() - started;

    expect(report.scored).toBe(4);
    // Three 100ms gaps after the first request.
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(report.pacedRpm).toBe(600);
  });
});
