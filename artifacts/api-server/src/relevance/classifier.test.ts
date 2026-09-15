import { describe, expect, it } from "vitest";
import {
  classifyJob,
  finalYearBatch,
  inferBatchContext,
  inferBatches,
  minYearsInText,
  toRelevanceColumns,
  type RelevanceTrack,
} from "./classifier";

/**
 * Every title in the tables below is a real value from the live jobs table
 * (sampled 2026-09-15) unless marked otherwise. The classifier is pure, so a
 * fixed clock keeps the recency modifiers out of the track assertions.
 */

const NOW = new Date("2026-09-15T12:00:00Z");

function track(
  title: string,
  extra: Partial<Parameters<typeof classifyJob>[0]> = {},
) {
  return classifyJob({ title, now: NOW, ...extra }).track;
}

// ─── The three named in UPGRADE.md §2.1 — non-negotiable ─────────────────────

describe("classifyJob — the three cases named in the spec", () => {
  it('"Senior Software Engineer Intern" → internship (intern beats senior)', () => {
    const r = classifyJob({
      title: "Senior Software Engineer Intern",
      now: NOW,
    });
    expect(r.track).toBe("internship");
    expect(r.isFresherEligible).toBe(true);
    expect(r.seniorityExcluded).toBe(false);
    expect(r.score).toBeGreaterThan(0);
    expect(r.signals).toContain(
      "seniority word in title ignored — intern beats senior",
    );
  });

  it('"SDE II" → not_relevant', () => {
    const r = classifyJob({ title: "SDE II", now: NOW });
    expect(r.track).toBe("not_relevant");
    expect(r.score).toBe(0);
    expect(r.isFresherEligible).toBe(false);
    expect(r.seniorityExcluded).toBe(true);
  });

  it('"Software Development Engineer Intern - 2027" → internship, batch 2027', () => {
    const r = classifyJob({
      title: "Software Development Engineer Intern - 2027",
      now: NOW,
    });
    expect(r.track).toBe("internship");
    expect(r.inferredBatches).toContain(2027);
  });
});

// ─── Real titles, by expected track ──────────────────────────────────────────

const INTERNSHIP: string[] = [
  "Software Engineer Intern",
  "Software Development Engineer Intern - 2027",
  "SDE Intern (Summer 2026)",
  "Senior Software Engineer Intern",
  "Graduate Engineer Trainee",
  "Data Science Intern",
  "Frontend Developer Internship",
  "Machine Learning Intern - Bangalore",
  "IT Audit Apprentice",
  "Software Engineering Co-op",
  "Backend Developer Trainee",
  "Product Management Intern",
];

const NEW_GRAD: string[] = [
  "SDE1",
  "SDE-1",
  "Software Engineer I",
  "Software Dev Engineer I, L4 (FTC), Amazon Pay - Merchant Tech",
  "Python (Django) Developer - Fresher",
  "Entry-Level AI Data Rater - English US",
  "Kgisl Hiring Freshers and Experinced For International BPO - Voice",
  "Associate Software Engineer",
  "New Grad Software Engineer 2026",
  "Junior Backend Developer",
  "Campus Hire - Software Engineer",
  "Software Engineer (0-1 years)",
];

const EARLY_CAREER: string[] = [
  "Frontend Developer",
  "Back End Developer",
  "Associate Cloud Engineer",
  "Software Engineer, Cross Border Science and Analytics",
  "Flex Developer",
  "Data Engineer, AFT BI Content",
  "Software Engineer, Internal Systems",
  "Software Development Engineer, Amazon International Seller Services",
  "Full Stack Developer",
];

const NOT_RELEVANT: string[] = [
  "SDE II",
  "Software Development Engineer II, Amazon External Payments",
  "Systems Development Engineer - II, Grocery Management Tech",
  "Software Engineer III",
  "Staff Software Engineer, Backend - Platform (Core AI Automation)",
  "Senior Staff Software Engineer, Finhub",
  "Principal Data Scientist",
  "Sr. AI Developer",
  "Computer Scientist 2 ( Full Stack Frontend Heavy )",
  "Head of Go-To-Market (GTM) - Enterprise Sales",
  "AEM and Adobe Target Architect",
  "Engineering Manager, Payments",
  "Internal Audit Manager",
  "International Voice Process",
  "Technical Support(International Voice)",
  "Customer Service Representative",
  "Office Maid",
  "barber",
  "Sales Executive",
  "Store Manager",
  "Current Openings",
  "AI Annotator",
  "Java Developer - 3+ years",
  "Backend Engineer (5 yrs exp)",
];

describe("classifyJob — real titles by track", () => {
  const table: Array<[RelevanceTrack, string[]]> = [
    ["internship", INTERNSHIP],
    ["new_grad", NEW_GRAD],
    ["early_career", EARLY_CAREER],
    ["not_relevant", NOT_RELEVANT],
  ];

  for (const [expected, titles] of table) {
    describe(expected, () => {
      it.each(titles)("%s", (title) => {
        expect(track(title)).toBe(expected);
      });
    });
  }

  it("covers at least 25 distinct real titles", () => {
    const all = new Set([
      ...INTERNSHIP,
      ...NEW_GRAD,
      ...EARLY_CAREER,
      ...NOT_RELEVANT,
    ]);
    expect(all.size).toBeGreaterThanOrEqual(25);
  });
});

// ─── Provider jobType as a strong, but not blind, signal ─────────────────────

describe("classifyJob — provider jobType", () => {
  it("jobType internship with no intern word in the title still classifies as internship", () => {
    // Lever's commitment field said "Intern"; the title alone would not.
    const r = classifyJob({
      title: "Software engineering internAI India",
      jobType: "internship",
      now: NOW,
    });
    expect(r.track).toBe("internship");
    expect(r.signals).toContain("provider jobType: internship");
  });

  it("jobType internship on an 'International' title is the substring bug, not evidence", () => {
    const r = classifyJob({
      title: "International Customer Service Representative",
      jobType: "internship",
      now: NOW,
    });
    expect(r.track).toBe("not_relevant");
    expect(r.signals).toContain(
      "provider jobType internship ignored — title's only 'intern' is internal/international",
    );
  });

  it("jobType internship on 'Software Engineer, Internal Systems' falls through to early career", () => {
    expect(
      track("Software Engineer, Internal Systems", { jobType: "internship" }),
    ).toBe("early_career");
  });

  it("a seniority marker in the title beats jobType internship", () => {
    const r = classifyJob({
      title: "Senior Manager - International Payroll",
      jobType: "internship",
      now: NOW,
    });
    expect(r.track).toBe("not_relevant");
    expect(r.seniorityExcluded).toBe(true);
  });

  it("jobType full_time does not stop a title-level intern word", () => {
    expect(track("Software Engineer Intern", { jobType: "full_time" })).toBe(
      "internship",
    );
  });
});

// ─── Hard exclusions from the columns and the description ────────────────────

describe("classifyJob — experience", () => {
  it("experienceMin ≥ 2 excludes even a plain engineering title", () => {
    const r = classifyJob({
      title: "Backend Developer",
      experienceMin: 2,
      now: NOW,
    });
    expect(r.track).toBe("not_relevant");
    expect(r.seniorityExcluded).toBe(true);
    expect(r.signals).toContain("experienceMin 2 ≥ 2");
  });

  it("experienceMax > 2 drops an early-career candidate", () => {
    expect(track("Backend Developer", { experienceMax: 5 })).toBe(
      "not_relevant",
    );
    expect(track("Backend Developer", { experienceMax: 2 })).toBe(
      "early_career",
    );
  });

  it("'1-3 years' in a title reads as from 1, not as 3 years", () => {
    expect(track("Java Developer (1-3 years)")).toBe("early_career");
  });

  it("a description asking for 3+ years of experience is not early career", () => {
    expect(
      track("Backend Developer", {
        description: "We need 3+ years of experience with Go and Postgres.",
      }),
    ).toBe("not_relevant");
  });

  it("years in a description that are not about experience are ignored", () => {
    expect(
      track("Backend Developer", {
        description:
          "For 10 years we have built payments infrastructure across 5 countries.",
      }),
    ).toBe("early_career");
  });

  it("'freshers welcome' in a description makes an engineering title new_grad", () => {
    expect(
      track("Backend Developer", {
        description: "Freshers can apply. 0-1 years of experience.",
      }),
    ).toBe("new_grad");
  });

  it("'freshers welcome' does not rescue a non-engineering title", () => {
    expect(track("Office Maid", { description: "Freshers welcome." })).toBe(
      "not_relevant",
    );
  });

  it("an internship title ignores description years entirely", () => {
    expect(
      track("Software Engineer Intern", {
        description: "5+ years of experience mentoring interns.",
      }),
    ).toBe("internship");
  });
});

// ─── Batch inference ─────────────────────────────────────────────────────────

describe("inferBatches", () => {
  it("keeps only years within ±2 of now", () => {
    expect(
      inferBatches("Batch 2025, 2026, 2027, 2028 and 2029 welcome", NOW),
    ).toEqual([2025, 2026, 2027, 2028]);
  });

  it("ignores years outside the 2025–2029 pattern", () => {
    expect(inferBatches("Founded 2019, hiring for 2024", NOW)).toEqual([]);
  });

  it("does not read a calendar date as a batch", () => {
    // Real title: the HCL walk-in drives. 2026 here is a day, not a class.
    expect(
      inferBatches(
        "Mega Walkin Drive at HCL Tech for Voice Process - Fresher - Walk in interview on 24th Aug 2026 - 11 AM to 2 PM",
        NOW,
      ),
    ).toEqual([]);
    expect(inferBatches("Apply by 30/09/2026", NOW)).toEqual([]);
    expect(inferBatches("Deadline 2026-09-30", NOW)).toEqual([]);
    expect(inferBatches("Starts January 2027", NOW)).toEqual([]);
    // …but "Hiring for 2026- 2027" and "Batch of 2027" are classes.
    expect(inferBatches("Apprentice Hiring for 2026- 2027", NOW)).toEqual([
      2026, 2027,
    ]);
    expect(inferBatches("Batch of 2027 only", NOW)).toEqual([2027]);
    expect(inferBatches("Summer 2027 SDE Intern", NOW)).toEqual([2027]);
  });

  it("unions the provider's eligibleBatch", () => {
    expect(inferBatches("no year here", NOW, [2027])).toEqual([2027]);
  });

  it("finds the year in the description, not just the title", () => {
    const r = classifyJob({
      title: "SDE Intern",
      description: "Open to 2027 graduates.",
      now: NOW,
    });
    expect(r.inferredBatches).toEqual([2027]);
  });
});

// ─── Inclusive batch phrasings — every one a real description from the 71
// live rows the −40 hit on 2026-09-15 (graduation year 2027) ────────────────

describe("classifyJob — batch text that includes the user", () => {
  const intern = (description: string, extra = {}) =>
    classifyJob({
      title: "Backend Developer Intern",
      description,
      graduationYear: 2027,
      now: NOW,
      ...extra,
    });

  it("finalYearBatch is the academic year in progress (June–May)", () => {
    expect(finalYearBatch(new Date("2026-09-15"))).toBe(2027);
    expect(finalYearBatch(new Date("2027-03-01"))).toBe(2027);
    expect(finalYearBatch(new Date("2027-06-01"))).toBe(2028);
    expect(finalYearBatch(new Date("2026-05-31"))).toBe(2026);
  });

  it('"2026 freshers & final-year student" → addressed to the user, +15, not −40', () => {
    const r = intern(
      "B.E./B.Tech (CSE/IT), BCA, MCA or M.Sc (Computer Science) — 2026 freshers & final-year student",
    );
    expect(r.batchVerdict).toBe("final_year");
    expect(r.score).toBe(100); // 90 + 15, capped
    expect(r.signals).toContain("addressed to final-year students +15");
    expect(r.signals).not.toContain("batch excludes 2027 −40");
    expect(r.inferredBatches).toEqual([2026]);
  });

  it('"Pursuing or recently completed B.E./B.Tech … — 2026 freshers & final-year student" → +15', () => {
    const r = intern(
      "Requirements: Pursuing or recently completed B.E./B.Tech/BCA/MCA — 2026 freshers & final-year student",
    );
    expect(r.batchVerdict).toBe("final_year");
  });

  it("final-year beats the generic match and does not stack with it", () => {
    const r = intern("Open to 2027 batch and final-year students.");
    expect(r.batchVerdict).toBe("final_year");
    expect(r.signals).not.toContain("batch matches 2027 +10");
  });

  it('"final year" without the hyphen, and "final-year candidates"', () => {
    expect(
      intern("Final year students of 2026 batch may apply").batchVerdict,
    ).toBe("final_year");
    expect(intern("Final-year candidates (2026)").batchVerdict).toBe(
      "final_year",
    );
  });

  it('"pre-final year students" is the batch after — not addressed to a 2027 graduate', () => {
    const r = intern("Open to pre-final year students (2026 batch only).");
    expect(r.batchVerdict).toBe("excluded");
  });

  it('"final year project" is not a student marker', () => {
    const r = intern("You built a final year project in React. 2026 batch.");
    expect(r.batchVerdict).toBe("excluded");
  });

  it("final-year is anchored to the calendar: a 2028 profile in Sept 2026 is not final year", () => {
    const r = classifyJob({
      title: "Backend Developer Intern",
      description: "2026 freshers & final-year student",
      graduationYear: 2028,
      now: NOW,
    });
    expect(r.batchVerdict).toBe("excluded");
  });

  it('"Graduated in 2025 or later" → open-ended floor includes 2027, +10', () => {
    const r = classifyJob({
      title: "Python (Django) Developer - Fresher",
      description: "Graduated in 2025 or later, and not currently a student.",
      graduationYear: 2027,
      now: NOW,
    });
    expect(r.batchVerdict).toBe("open_ended");
    expect(r.signals).toContain("batch 2025 or later includes 2027 +10");
  });

  it('"2025 onwards", "2025+", "2025 and above" are the same floor', () => {
    for (const text of [
      "Batch 2025 onwards",
      "2025+ passouts",
      "2025 and above",
    ]) {
      expect(intern(text).batchVerdict, text).toBe("open_ended");
    }
  });

  it("an open-ended floor above the user's year still excludes", () => {
    const r = intern("2028 or later graduates only");
    expect(r.batchVerdict).toBe("excluded");
    expect(r.inferredBatches).toEqual([2028]);
  });

  it('"2025-2028 batch" — a range covers the years between its ends', () => {
    expect(inferBatches("2025-2028 batch", NOW)).toEqual([
      2025, 2026, 2027, 2028,
    ]);
    expect(inferBatches("2025 to 2027 graduates", NOW)).toEqual([
      2025, 2026, 2027,
    ]);
    expect(inferBatches("2025–27", NOW)).toEqual([2025, 2026, 2027]);
    expect(intern("Eligible: 2025-2028 batch").batchVerdict).toBe("match");
  });

  it('"Students graduating in the years of 2024-2025 and 2025-2026" is a closed range — still excluded', () => {
    const r = classifyJob({
      title: "Full - Stack Developer Intern",
      description:
        "Criteria to apply: • Students graduating in the years of 2024-2025 and 2025-2026 in Stream of Computer Science",
      graduationYear: 2027,
      now: NOW,
    });
    expect(r.batchVerdict).toBe("excluded");
    expect(r.inferredBatches).toEqual([2024, 2025, 2026]);
  });

  it('"Experience: 0 Years (Freshers) - 2026 Passout" is explicit — still excluded', () => {
    expect(
      intern("Experience: 0 Years (Freshers) - 2026 Passout. Role Overview…")
        .batchVerdict,
    ).toBe("excluded");
  });

  it('"(2025 or 2026 graduate)" — a closed list — still excluded', () => {
    expect(
      intern(
        "Computer Science, Information Systems, or a related technical field (2025 or 2026 graduate).",
      ).batchVerdict,
    ).toBe("excluded");
  });

  it('"pursuing" neutralises a named year without adding', () => {
    const r = intern("Pursuing B.Tech in CSE. 2026 batch preferred.");
    expect(r.batchVerdict).toBe("pursuing");
    expect(r.score).toBe(90);
    expect(r.signals).toContain(
      "batch names another year but pursuing students welcome — no penalty",
    );
  });

  it('"pursuing" with no year named adds nothing and says nothing', () => {
    const r = intern("Pursuing a degree in Computer Science.");
    expect(r.batchVerdict).toBe("none");
    expect(r.score).toBe(90);
  });

  it("without a graduation year no batch verdict is reached", () => {
    const r = classifyJob({
      title: "Backend Developer Intern",
      description: "2026 freshers & final-year student",
      now: NOW,
    });
    expect(r.batchVerdict).toBe("none");
    expect(r.score).toBe(90);
  });

  it("a year with no batch-shaped word near it is not a batch", () => {
    for (const text of [
      "© 2026 Dlytica Inc. All Rights Reserved",
      "We are proud to be recognized as a Top Employer 2026 in Brazil",
      "Named a 2025 Gartner® Magic Quadrant™ Leader",
      "CJN- 344/2025 - Vacancy For Medical Coding",
      "Walk-in For an interview on 7 -Sept -2026 (Monday)",
    ]) {
      expect(inferBatches(text, NOW), text).toEqual([]);
    }
  });

  it("…but a year next to batch language is", () => {
    for (const [text, years] of [
      ["2026 Software Engineer Intern", [2026]],
      ["Red Hat Internship 2026", [2026]],
      ["Summer 2026", [2026]],
      ["Software Engineer Intern (2026 Batch)", [2026]],
      ["Recent graduates from the Class of 2024 or 2025", [2025]],
      ["2023–2025 pass-outs may apply", [2024, 2025]], // 2023 is outside ±2
      ["Year of Passing: 2024 or 2025", [2025]],
      ["Intern Software Engineer 2028 Graduates", [2028]],
      // A slash between two years is a list, not a reference number.
      ["degree or equivalent (or graduating in 2026/2027)", [2026, 2027]],
      ["(2025/2026 graduates preferred)", [2025, 2026]],
      // A start date is the batch in all but name.
      [
        "Able to start working full-time on or before September of 2027.",
        [2027],
      ],
    ] as Array<[string, number[]]>) {
      expect(inferBatches(text, NOW), text).toEqual(years);
    }
  });

  it("inferBatchContext exposes all four readings", () => {
    expect(
      inferBatchContext(
        "Pursuing B.Tech, final-year students, 2025 or later, 2026-2027 batch",
        NOW,
      ),
    ).toEqual({
      batches: [2025, 2026, 2027],
      openFrom: 2025,
      finalYear: true,
      pursuing: true,
    });
  });
});

// ─── Score composition ───────────────────────────────────────────────────────

describe("classifyJob — score", () => {
  const base = { title: "Software Engineer Intern", now: NOW };

  it("internship base is 90 with nothing else known", () => {
    const r = classifyJob(base);
    expect(r.score).toBe(90);
    expect(r.signals).toContain("base internship 90");
  });

  it("new_grad base 85, early_career base 60", () => {
    expect(classifyJob({ title: "SDE 1", now: NOW }).score).toBe(85);
    expect(classifyJob({ title: "Backend Developer", now: NOW }).score).toBe(
      60,
    );
  });

  it("isIndia +10, isRemote +5, deadline +5", () => {
    const r = classifyJob({
      ...base,
      isIndia: true,
      isRemote: true,
      deadline: new Date("2026-10-01"),
    });
    expect(r.score).toBe(100); // 90 + 10 + 5 + 5, clamped
    expect(r.signals).toEqual(
      expect.arrayContaining([
        "isIndia +10",
        "isRemote +5",
        "deadline present +5",
      ]),
    );
  });

  it("isIndia null (unknown) adds nothing and is never penalised", () => {
    expect(classifyJob({ ...base, isIndia: null }).score).toBe(90);
  });

  it("isIndia false on-site is −25; remote-elsewhere is not", () => {
    const abroad = classifyJob({ ...base, isIndia: false });
    expect(abroad.score).toBe(65);
    expect(abroad.signals).toContain("on-site outside India −25");
    expect(classifyJob({ ...base, isIndia: false, isRemote: true }).score).toBe(
      95,
    );
  });

  it("posted within 7 days +10, over 45 days −20", () => {
    const fresh = classifyJob({
      ...base,
      postedDate: new Date("2026-09-12T00:00:00Z"),
    });
    expect(fresh.score).toBe(100);
    const stale = classifyJob({
      ...base,
      postedDate: new Date("2026-07-01T00:00:00Z"),
    });
    expect(stale.score).toBe(70);
    expect(stale.signals).toContain("posted over 45 days ago −20");
  });

  it("a batch that includes the user's year is +10; one that excludes it is −40", () => {
    const match = classifyJob({
      title: "SDE Intern - 2027 batch",
      graduationYear: 2027,
      now: NOW,
    });
    expect(match.score).toBe(100);
    expect(match.signals).toContain("batch matches 2027 +10");

    const miss = classifyJob({
      title: "SDE Intern - 2026 batch",
      graduationYear: 2027,
      now: NOW,
    });
    expect(miss.track).toBe("internship"); // demoted, never excluded
    expect(miss.score).toBe(50);
    expect(miss.signals).toContain("batch excludes 2027 −40");
  });

  it("no batch named means no batch modifier either way", () => {
    expect(classifyJob({ ...base, graduationYear: 2027 }).score).toBe(90);
  });

  it("a non-engineering internship scores below an SDE one", () => {
    const sde = classifyJob(base).score;
    const voice = classifyJob({
      title: "International Voice Process Intern",
      now: NOW,
    });
    expect(voice.track).toBe("internship");
    expect(voice.score).toBeLessThan(sde);
    expect(voice.signals).toContain("no engineering role noun in title −15");
    expect(voice.signals).toContain("non-technical role in title −20");
  });

  it("not_relevant is always 0", () => {
    expect(
      classifyJob({
        title: "SDE II",
        isIndia: true,
        isRemote: true,
        deadline: new Date(),
        postedDate: NOW,
        now: NOW,
      }).score,
    ).toBe(0);
  });

  it("is clamped to 0–100", () => {
    const r = classifyJob({
      title: "Voice Process Intern - 2026 batch",
      graduationYear: 2027,
      postedDate: new Date("2026-01-01"),
      now: NOW,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

// ─── Determinism and the column shape ────────────────────────────────────────

describe("classifyJob — shape", () => {
  it("is deterministic for a fixed clock", () => {
    const input = {
      title: "Software Engineer Intern - 2027",
      description: "Bengaluru. 0-1 years.",
      isIndia: true,
      postedDate: new Date("2026-09-10"),
      graduationYear: 2027,
      now: NOW,
    };
    expect(classifyJob(input)).toEqual(classifyJob(input));
  });

  it("toRelevanceColumns maps one-to-one onto the jobs columns", () => {
    const at = new Date("2026-09-15T00:00:00Z");
    const cols = toRelevanceColumns(
      classifyJob({ title: "SDE Intern", now: NOW }),
      at,
    );
    expect(cols).toEqual({
      relevanceTrack: "internship",
      relevanceScore: 90,
      isFresherEligible: true,
      seniorityExcluded: false,
      relevanceSignals: expect.arrayContaining(["base internship 90"]),
      classifiedAt: at,
    });
  });
});

describe("minYearsInText", () => {
  it("reads ranges by their low end", () => {
    expect(minYearsInText("1-3 years")).toBe(1);
    expect(minYearsInText("2 to 4 yrs")).toBe(2);
  });
  it("reads single figures", () => {
    expect(minYearsInText("3+ years")).toBe(3);
    expect(minYearsInText("5 yrs exp")).toBe(5);
  });
  it("returns null when nothing is named", () => {
    expect(minYearsInText("Software Engineer")).toBeNull();
    expect(minYearsInText(null)).toBeNull();
  });
  it("with experience context, needs the word experience nearby", () => {
    const opt = { requireExperienceContext: true };
    expect(minYearsInText("10 years of building products", opt)).toBeNull();
    expect(minYearsInText("3+ years of experience", opt)).toBe(3);
    expect(minYearsInText("experience: 2-4 years", opt)).toBe(2);
    expect(minYearsInText("Experience in Java for 4 years", opt)).toBe(4);
  });
});
