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
 * Phase 8 — the cache, the freshness rule and the budget.
 *
 * Real Postgres (PGlite), for the same reason daily-queue.test.ts uses it: the
 * thing under test IS the round trip through `job_match_scores`. A mocked `db`
 * could prove that `upsert` was called with an object; it could not prove that
 * the second read finds the row the first write left, which is the entire
 * acceptance criterion.
 *
 * Gemini is never called. `generate` is injected as a counting fake, and the
 * count is the assertion — "viewing the same job twice makes zero Gemini calls"
 * is not a statement about cache-hit ratios, it is a statement about how many
 * times that function ran.
 */
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

import {
  companiesTable,
  db,
  jobsTable,
  profilesTable,
  jobMatchScoresTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { jobMatchScoresRepository } from "../repositories/jobMatchScores.repository";
import {
  dailyBudget,
  getOrCompute,
  profileFingerprint,
  type MatchScoreDeps,
} from "./match-scores.service";
import type { MatchScoreResult } from "./ai-matching.service";

let testDb: TestDb;
let profileId: string;
let jobId: string;
let otherJobId: string;

const RESULT: MatchScoreResult = {
  score: 84,
  summary: "Strong fit for a backend internship.",
  matchingSkills: ["TypeScript", "SQL"],
  missingSkills: ["Java", "Kubernetes"],
  recommendations: ["Ship one Java service before applying."],
};

/**
 * A stand-in for the Gemini call that counts how many times it ran. Nothing in
 * this suite touches the network; `calls` is the number the acceptance
 * criterion is about.
 */
function countingGenerate(result: MatchScoreResult | null = RESULT) {
  const fake = vi.fn(async () => result);
  return fake;
}

function deps(generate: ReturnType<typeof countingGenerate>): MatchScoreDeps {
  return {
    generate: generate as unknown as MatchScoreDeps["generate"],
    repository: jobMatchScoresRepository,
  };
}

const PROFILE = {
  name: "Test User",
  skills: ["TypeScript", "SQL", "React"],
  degree: "B.Tech",
  branch: "IT",
  college: "NSUT",
  graduationYear: 2027,
  cgpa: 8.4,
  resumeUrl: null as string | null,
};

const JOB = {
  title: "SDE Intern",
  company: "Acme",
  description: "Build things.",
  requirements: "DSA",
  requiredSkills: ["Java"],
  location: "Bengaluru",
  jobType: "internship",
  eligibleBranches: ["IT"],
  minCgpa: 7,
};

beforeAll(async () => {
  testDb = await getTestDb();
});

beforeEach(async () => {
  await truncateAll(testDb);
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  // The default (200) — individual tests lower it to prove the budget path.
  vi.stubEnv("AI_DAILY_BUDGET", "200");

  const [profile] = await testDb
    .insert(profilesTable)
    .values({
      clerkId: "user_phase8",
      name: PROFILE.name,
      email: "phase8@example.com",
      skills: PROFILE.skills,
    })
    .returning({ id: profilesTable.id });
  profileId = profile!.id;

  const [company] = await testDb
    .insert(companiesTable)
    .values({ name: "Acme", slug: "acme" })
    .returning({ id: companiesTable.id });

  const [job, other] = await testDb
    .insert(jobsTable)
    .values([
      {
        companyId: company!.id,
        title: "SDE Intern",
        jobType: "internship" as const,
        isFresherEligible: true,
        relevanceScore: 90,
      },
      {
        companyId: company!.id,
        title: "Backend Intern",
        jobType: "internship" as const,
        isFresherEligible: true,
        relevanceScore: 80,
      },
    ])
    .returning({ id: jobsTable.id });
  jobId = job!.id;
  otherJobId = other!.id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function input(
  overrides: Partial<{
    skills: string[];
    resumeUrl: string | null;
    jobId: string;
  }> = {},
) {
  return {
    profileId,
    profile: {
      ...PROFILE,
      ...(overrides.skills ? { skills: overrides.skills } : {}),
      ...(overrides.resumeUrl !== undefined
        ? { resumeUrl: overrides.resumeUrl }
        : {}),
    },
    jobId: overrides.jobId ?? jobId,
    job: JOB,
  };
}

describe("getOrCompute — the zero-call path", () => {
  /**
   * THE PHASE 8 ACCEPTANCE CRITERION.
   *
   * "A test proves viewing the same job twice makes zero Gemini calls."
   * The first view is allowed exactly one; the second must add none, and the
   * answer must still be the real one rather than a degraded placeholder.
   */
  it("makes exactly one Gemini call for the first view and none for the second", async () => {
    const generate = countingGenerate();

    const first = await getOrCompute(input(), deps(generate));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(first?.score).toBe(84);
    expect(first?.cached).toBe(false);

    const second = await getOrCompute(input(), deps(generate));
    // The number that matters.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(second?.score).toBe(84);
    expect(second?.missingSkills).toEqual(["Java", "Kubernetes"]);
    expect(second?.cached).toBe(true);
    expect(second?.stale).toBe(false);
  });

  it("still makes zero calls on a third and fourth view", async () => {
    const generate = countingGenerate();
    await getOrCompute(input(), deps(generate));
    await getOrCompute(input(), deps(generate));
    await getOrCompute(input(), deps(generate));
    await getOrCompute(input(), deps(generate));
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("persists exactly one row per (profile, job), not one per view", async () => {
    const generate = countingGenerate();
    await getOrCompute(input(), deps(generate));
    await getOrCompute(input(), deps(generate));

    const rows = await testDb
      .select()
      .from(jobMatchScoresTable)
      .where(eq(jobMatchScoresTable.profileId, profileId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.missingSkills).toEqual(["Java", "Kubernetes"]);
    expect(rows[0]!.model).toBe("gemini-3.5-flash-lite");
  });

  it("caches per job — a different job is a separate call", async () => {
    const generate = countingGenerate();
    await getOrCompute(input(), deps(generate));
    await getOrCompute(input({ jobId: otherJobId }), deps(generate));
    expect(generate).toHaveBeenCalledTimes(2);

    // And neither of them is recomputed on a revisit.
    await getOrCompute(input(), deps(generate));
    await getOrCompute(input({ jobId: otherJobId }), deps(generate));
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe("the recompute rule", () => {
  it("recomputes when skills change", async () => {
    const generate = countingGenerate();
    await getOrCompute(input(), deps(generate));
    expect(generate).toHaveBeenCalledTimes(1);

    await getOrCompute(
      input({ skills: ["TypeScript", "SQL", "React", "Go"] }),
      deps(generate),
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("recomputes when resumeUrl changes", async () => {
    const generate = countingGenerate();
    await getOrCompute(input(), deps(generate));
    await getOrCompute(
      input({ resumeUrl: "https://example.com/resume.pdf" }),
      deps(generate),
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  /**
   * The reason the row stores a fingerprint of two fields instead of comparing
   * `profiles.updated_at` against `computed_at`. On the live table, invalidating
   * on any profile edit would mean up to 2,100 recomputes because a CGPA
   * changed — and the prompt does not even read it in a way that could move a
   * score more than noise.
   */
  it("does NOT recompute when an unrelated profile field changes", async () => {
    const generate = countingGenerate();
    await getOrCompute(input(), deps(generate));

    const withNewCgpa = input();
    withNewCgpa.profile.cgpa = 9.1;
    withNewCgpa.profile.college = "Somewhere Else";
    await getOrCompute(withNewCgpa, deps(generate));

    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("treats a reordered skills array as unchanged", async () => {
    const generate = countingGenerate();
    await getOrCompute(input(), deps(generate));
    await getOrCompute(
      input({ skills: ["React", "SQL", "TypeScript"] }),
      deps(generate),
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("recomputes a row whose fingerprint was never recorded", async () => {
    // What a row written before this column existed looks like.
    await testDb.insert(jobMatchScoresTable).values({
      profileId,
      jobId,
      score: 10,
      summary: "old",
      matchingSkills: [],
      missingSkills: [],
      recommendations: [],
      profileFingerprint: null,
    });

    const generate = countingGenerate();
    const result = await getOrCompute(input(), deps(generate));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result?.score).toBe(84);
  });
});

describe("dailyBudget", () => {
  it("falls back to the default when the env var is set but empty", () => {
    vi.stubEnv("AI_DAILY_BUDGET", "");
    expect(dailyBudget()).toBe(200);
    vi.stubEnv("AI_DAILY_BUDGET", "   ");
    expect(dailyBudget()).toBe(200);
    vi.stubEnv("AI_DAILY_BUDGET", "not-a-number");
    expect(dailyBudget()).toBe(200);
  });

  it("honours an explicit zero", () => {
    vi.stubEnv("AI_DAILY_BUDGET", "0");
    expect(dailyBudget()).toBe(0);
  });
});

describe("fingerprint", () => {
  it("is stable across ordering and whitespace, and sensitive to content", () => {
    const a = profileFingerprint({ skills: ["B", "A"], resumeUrl: null });
    const b = profileFingerprint({ skills: [" A ", "B"], resumeUrl: null });
    const c = profileFingerprint({ skills: ["A", "B", "C"], resumeUrl: null });
    const d = profileFingerprint({ skills: ["A", "B"], resumeUrl: "u" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });
});

describe("degradation", () => {
  it("returns null and calls nothing when GEMINI_API_KEY is unset", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const generate = countingGenerate();
    const result = await getOrCompute(input(), deps(generate));
    expect(result).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns null rather than throwing when the model reply is unusable", async () => {
    const generate = countingGenerate(null);
    const result = await getOrCompute(input(), deps(generate));
    expect(result).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);

    // And nothing was written, so the next view retries rather than caching a
    // failure forever.
    expect(await jobMatchScoresRepository.countForProfile(profileId)).toBe(0);
  });

  it("returns the stored score without calling Gemini when the daily budget is spent", async () => {
    const generate = countingGenerate();
    await getOrCompute(input(), deps(generate));
    expect(generate).toHaveBeenCalledTimes(1);

    // One row exists and was computed in the last 24 hours, so a budget of 1 is
    // already spent.
    vi.stubEnv("AI_DAILY_BUDGET", "1");
    expect(dailyBudget()).toBe(1);

    const stale = await getOrCompute(
      input({ skills: ["Rust"] }),
      deps(generate),
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(stale?.score).toBe(84);
    expect(stale?.stale).toBe(true);
  });

  it("returns null when the budget is spent and nothing was ever stored", async () => {
    const generate = countingGenerate();
    // Spend the budget on the other job.
    await getOrCompute(input({ jobId: otherJobId }), deps(generate));
    vi.stubEnv("AI_DAILY_BUDGET", "1");

    const result = await getOrCompute(input(), deps(generate));
    expect(result).toBeNull();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("falls back to the stored score when Gemini throws", async () => {
    const generate = countingGenerate();
    await getOrCompute(input(), deps(generate));

    const throwing = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await getOrCompute(input({ skills: ["Rust"] }), {
      generate: throwing as unknown as MatchScoreDeps["generate"],
      repository: jobMatchScoresRepository,
    });
    expect(result?.score).toBe(84);
    expect(result?.stale).toBe(true);
  });
});
