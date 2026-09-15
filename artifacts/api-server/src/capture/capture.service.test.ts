import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterEach,
} from "vitest";

// Real Postgres (PGlite) so `confirm()` is proved by the row it wrote — the
// §2.0 location columns and the §2.1 relevance verdict are the point of the
// endpoint, and a mocked `db` could only show that insert() was called.
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  const { getTestDb } = await import("../test/pglite");
  return { ...schema, db: await getTestDb(), pool: {} };
});

const generateContent = vi.fn();
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent };
    }
  },
}));

import { eq } from "drizzle-orm";
import { db, companiesTable, jobsTable } from "@workspace/db";
import { getTestDb, truncateAll, type TestDb } from "../test/pglite";
import { resetGraduationYearCache } from "../relevance/graduation-year";
import { captureService, MANUAL_SOURCE_PLATFORM } from "./capture.service";

const LINKEDIN_URL =
  "https://www.linkedin.com/jobs/view/software-engineer-intern-at-acme-corp-4123456789";

const PASTED_JD = `Software Engineer Intern
Acme Corp · Gurugram, Haryana, India · 3 days ago

About the job
Join our platform team as a Software Engineer Intern for the 2027 batch.
Stipend: ₹50,000 /month
Apply by 30 Nov 2026
Skills: React, TypeScript, PostgreSQL`;

function geminiReplies(payload: unknown, { fenced = false } = {}) {
  const json = JSON.stringify(payload);
  generateContent.mockResolvedValueOnce({
    response: { text: () => (fenced ? "```json\n" + json + "\n```" : json) },
  });
}

describe("captureService.parse — no GEMINI_API_KEY (the path that runs locally)", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "");
    generateContent.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("produces a full draft from pasted text without calling the model", async () => {
    const result = await captureService.parse({
      url: LINKEDIN_URL,
      rawText: PASTED_JD,
    });

    expect(generateContent).not.toHaveBeenCalled();
    expect(result.source).toBe("heuristic");
    expect(result.aiAvailable).toBe(false);
    expect(result.platform).toBe("LinkedIn");
    expect(result.draft.title).toBe("Software Engineer Intern");
    expect(result.draft.companyName).toBe("Acme Corp");
    expect(result.draft.location).toBe("Gurugram, Haryana, India");
    expect(result.draft.jobType).toBe("internship");
    expect(result.draft.stipend).toBe(50_000);
    expect(result.draft.deadline?.slice(0, 10)).toBe("2026-11-30");
    expect(result.draft.requiredSkills).toEqual([
      "React",
      "TypeScript",
      "PostgreSQL",
    ]);
    expect(result.draft.sourceUrl).toBe(LINKEDIN_URL);
    expect(result.draft.applyUrl).toBe(LINKEDIN_URL);
  });

  it("says plainly that AI is off rather than pretending the draft is authoritative", async () => {
    const result = await captureService.parse({
      url: LINKEDIN_URL,
      rawText: PASTED_JD,
    });
    expect(result.warnings.join(" ")).toMatch(/GEMINI_API_KEY/);
  });

  it("still fills title and company from a URL alone", async () => {
    const result = await captureService.parse({ url: LINKEDIN_URL });
    expect(result.draft.title).toBe("Software Engineer Intern");
    expect(result.draft.companyName).toBe("Acme Corp");
    expect(result.draft.jobType).toBe("internship");
    expect(result.warnings.join(" ")).toMatch(/Nothing was pasted/);
  });

  it("names the fields it could not work out", async () => {
    const result = await captureService.parse({ rawText: "₹₹₹" });
    expect(result.warnings.join(" ")).toMatch(/role title/);
    expect(result.warnings.join(" ")).toMatch(/company/);
  });
});

describe("captureService.parse — with GEMINI_API_KEY", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    generateContent.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the model's fields and reports source: gemini", async () => {
    geminiReplies({
      title: "Software Development Engineer Intern",
      companyName: "Acme Corporation",
      location: "Gurugram, Haryana",
      workMode: "hybrid",
      jobType: "internship",
      stipend: 55000,
      salaryMin: null,
      salaryMax: null,
      deadline: "2026-11-30T00:00:00.000Z",
      requiredSkills: ["React", "TypeScript"],
      description: "Join our platform team.",
    });

    const result = await captureService.parse({
      url: LINKEDIN_URL,
      rawText: PASTED_JD,
    });

    expect(result.source).toBe("gemini");
    expect(result.aiAvailable).toBe(true);
    expect(result.draft.title).toBe("Software Development Engineer Intern");
    expect(result.draft.companyName).toBe("Acme Corporation");
    expect(result.draft.stipend).toBe(55_000);
    expect(result.warnings).toEqual([]);
  });

  it("strips the markdown fences the model wraps its JSON in", async () => {
    geminiReplies(
      { title: "Backend Intern", companyName: "Zeta" },
      { fenced: true },
    );
    const result = await captureService.parse({ rawText: PASTED_JD });
    expect(result.source).toBe("gemini");
    expect(result.draft.title).toBe("Backend Intern");
  });

  it("lets the heuristics fill the fields the model left null", async () => {
    geminiReplies({ title: "SDE Intern", companyName: null, stipend: null });
    const result = await captureService.parse({
      url: LINKEDIN_URL,
      rawText: PASTED_JD,
    });
    expect(result.draft.title).toBe("SDE Intern");
    expect(result.draft.companyName).toBe("Acme Corp"); // from the paste
    expect(result.draft.stipend).toBe(50_000); // from the paste
  });

  it("falls back to the heuristics when the reply is not JSON", async () => {
    generateContent.mockResolvedValueOnce({
      response: { text: () => "I'm sorry, I can't help with that." },
    });
    const result = await captureService.parse({
      url: LINKEDIN_URL,
      rawText: PASTED_JD,
    });
    expect(result.source).toBe("heuristic");
    expect(result.draft.title).toBe("Software Engineer Intern");
    expect(result.warnings.join(" ")).toMatch(/did not return a usable result/);
  });

  it("falls back to the heuristics when the call throws", async () => {
    generateContent.mockRejectedValueOnce(new Error("429 rate limited"));
    const result = await captureService.parse({
      url: LINKEDIN_URL,
      rawText: PASTED_JD,
    });
    expect(result.source).toBe("heuristic");
    expect(result.draft.companyName).toBe("Acme Corp");
  });

  it("discards values of the wrong shape rather than storing them", async () => {
    geminiReplies({
      title: "  ",
      companyName: 42,
      workMode: "onsite-ish",
      jobType: "contract",
      stipend: "₹50,000",
      deadline: "sometime next year",
      requiredSkills: "React",
    });
    const result = await captureService.parse({ rawText: PASTED_JD });
    // Every rejected field falls through to the heuristic draft.
    expect(result.draft.title).toBe("Software Engineer Intern");
    expect(result.draft.companyName).toBe("Acme Corp");
    expect(result.draft.workMode).toBeNull();
    expect(result.draft.jobType).toBe("internship");
    expect(result.draft.stipend).toBe(50_000);
    expect(result.draft.deadline?.slice(0, 10)).toBe("2026-11-30");
    expect(result.draft.requiredSkills).toEqual([
      "React",
      "TypeScript",
      "PostgreSQL",
    ]);
  });

  it("does not call the model when there is nothing pasted to extract from", async () => {
    await captureService.parse({ url: LINKEDIN_URL });
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe("captureService.confirm", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await getTestDb();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    resetGraduationYearCache();
    vi.stubEnv("RELEVANCE_GRADUATION_YEAR", "2027");
  });
  afterEach(() => vi.unstubAllEnvs());

  const draft = {
    title: "Software Development Engineer Intern - 2027",
    companyName: "Acme Corporation",
    location: "Gurugram, Haryana",
    workMode: "hybrid" as const,
    jobType: "internship" as const,
    stipend: 50_000,
    deadline: "2026-11-30T23:59:59.000Z",
    requiredSkills: ["React", "TypeScript"],
    description: "Join our platform team for the 2027 batch.",
    applyUrl: LINKEDIN_URL,
    sourceUrl: LINKEDIN_URL,
  };

  it("creates the company when it does not exist yet", async () => {
    const { job } = await captureService.confirm(draft);
    const [company] = await db
      .select()
      .from(companiesTable)
      .where(eq(companiesTable.id, job.companyId));
    expect(company.slug).toBe("acme-corporation");
    expect(company.name).toBe("Acme Corporation");
  });

  it("reuses an existing company rather than creating a near-duplicate", async () => {
    await captureService.confirm(draft);
    await captureService.confirm({ ...draft, sourceUrl: `${LINKEDIN_URL}-2` });
    const companies = await db.select().from(companiesTable);
    expect(companies).toHaveLength(1);
  });

  it('stamps sourcePlatform "manual" and ignores anything the caller claims', async () => {
    const { job } = await captureService.confirm(draft);
    expect(job.sourcePlatform).toBe(MANUAL_SOURCE_PLATFORM);
    // "manual" is in neither AGGREGATOR_PLATFORMS nor any provider's own
    // platform, so the Phase 1.5 sweeps cannot reach this row.
    const { AGGREGATOR_PLATFORMS } = await import("../providers/staleness");
    expect([...AGGREGATOR_PLATFORMS]).not.toContain(MANUAL_SOURCE_PLATFORM);
  });

  it("runs the §2.0 location normalizer on the confirmed row", async () => {
    const { job } = await captureService.confirm(draft);
    expect(job.locationCity).toBe("Gurugram");
    expect(job.locationRegion).toBe("Haryana");
    expect(job.locationCountry).toBe("IN");
    expect(job.locationMetro).toBe("NCR");
    expect(job.isIndia).toBe(true);
    expect(job.isRemote).toBe(false);
  });

  it("leaves isIndia null — never false — for a location it cannot place", async () => {
    const { job } = await captureService.confirm({
      ...draft,
      location: "Somewhere Unrecognisable",
      sourceUrl: `${LINKEDIN_URL}-unknown`,
    });
    expect(job.isIndia).toBeNull();
  });

  it("runs the §2.1 classifier on the confirmed row", async () => {
    const { job } = await captureService.confirm(draft);
    expect(job.relevanceTrack).toBe("internship");
    expect(job.isFresherEligible).toBe(true);
    expect(job.seniorityExcluded).toBe(false);
    expect(job.relevanceScore).toBeGreaterThan(90);
    expect(job.relevanceSignals.length).toBeGreaterThan(0);
    expect(job.classifiedAt).not.toBeNull();
  });

  it("classifies a senior title as not relevant, the same as an ingested one", async () => {
    const { job } = await captureService.confirm({
      ...draft,
      title: "Senior Staff Engineer",
      jobType: "full_time",
      sourceUrl: `${LINKEDIN_URL}-senior`,
    });
    expect(job.relevanceTrack).toBe("not_relevant");
    expect(job.isFresherEligible).toBe(false);
  });

  it("returns the existing row instead of a duplicate when the sourceUrl repeats", async () => {
    const first = await captureService.confirm(draft);
    expect(first.duplicate).toBe(false);

    const second = await captureService.confirm({
      ...draft,
      title: "Retyped Title",
    });
    expect(second.duplicate).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect(second.job.title).toBe(draft.title);

    const rows = await db.select().from(jobsTable);
    expect(rows).toHaveLength(1);
  });

  it("reopens a closed row instead of returning one the app will not show", async () => {
    const first = await captureService.confirm(draft);
    await db
      .update(jobsTable)
      .set({ status: "closed" })
      .where(eq(jobsTable.id, first.job.id));

    // The sweeps close on evidence that can be stale; the user pasting the
    // posting today is fresher evidence than either sweep.
    const second = await captureService.confirm(draft);
    expect(second.duplicate).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect(second.job.status).toBe("active");

    const rows = await db.select().from(jobsTable);
    expect(rows).toHaveLength(1);
  });

  it("matches on the applyUrl when no sourceUrl was given", async () => {
    const first = await captureService.confirm({ ...draft, sourceUrl: null });
    const second = await captureService.confirm({ ...draft, sourceUrl: null });
    expect(second.duplicate).toBe(true);
    expect(second.job.id).toBe(first.job.id);
  });

  it("saves a job with no URL at all", async () => {
    const { job, duplicate } = await captureService.confirm({
      title: "Backend Intern",
      companyName: "Zeta Suite",
      applyUrl: null,
      sourceUrl: null,
    });
    expect(duplicate).toBe(false);
    expect(job.sourceUrl).toBeNull();
    expect(job.status).toBe("active");
  });

  it("defaults an unspecified draft to an active onsite internship in INR", async () => {
    const { job } = await captureService.confirm({
      title: "Intern",
      companyName: "Zeta Suite",
    });
    expect(job.workMode).toBe("onsite");
    expect(job.jobType).toBe("internship");
    expect(job.currency).toBe("INR");
    expect(job.status).toBe("active");
  });
});
