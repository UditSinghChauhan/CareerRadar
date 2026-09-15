import { describe, it, expect } from "vitest";
import {
  parseCaptureText,
  parseDeadline,
  parseJobType,
  parseMoney,
  parseSkills,
  parseWorkMode,
} from "./parse-text";

/** A LinkedIn-shaped paste: title, then "Company · Location · when". */
const LINKEDIN_PASTE = `Software Engineer Intern
Acme Corp · Bengaluru, Karnataka, India · 2 days ago · 40 applicants

About the job
We are looking for a Software Engineer Intern to join our platform team.
Stipend: ₹40,000 - ₹60,000 /month
Apply by 30 Sep 2026
Skills: React, TypeScript, Node.js, PostgreSQL
Hybrid role based out of our Bengaluru office.
Open to 2027 batch students.`;

/** An Internshala-shaped paste: labelled fields, almost no prose. */
const LABELLED_PASTE = `Job Title: Backend Developer
Company: Zeta Suite
Location: Noida, Uttar Pradesh
Salary: ₹8,00,000 - ₹12,00,000 per annum
Last date to apply: 15/10/2026
Skills Required: Java, Spring Boot, Kafka
Work Mode: Remote`;

describe("parseMoney", () => {
  it.each([
    [
      "CTC: 12 LPA fixed",
      { stipend: null, salaryMin: 1_200_000, salaryMax: 1_200_000 },
    ],
    [
      "Compensation 12-18 LPA",
      { stipend: null, salaryMin: 1_200_000, salaryMax: 1_800_000 },
    ],
    [
      "Stipend ₹40,000 - ₹60,000 /month",
      { stipend: 60_000, salaryMin: null, salaryMax: null },
    ],
    ["₹25000 per month", { stipend: 25_000, salaryMin: null, salaryMax: null }],
    [
      "Monthly stipend of ₹30,000",
      { stipend: 30_000, salaryMin: null, salaryMax: null },
    ],
    [
      "Stipend: 15k/month",
      { stipend: 15_000, salaryMin: null, salaryMax: null },
    ],
    [
      "₹1.2 Cr per annum",
      { stipend: null, salaryMin: 12_000_000, salaryMax: 12_000_000 },
    ],
    [
      "Salary: ₹8,00,000 - ₹12,00,000 per annum",
      { stipend: null, salaryMin: 800_000, salaryMax: 1_200_000 },
    ],
  ])("reads %s", (text, expected) => {
    expect(parseMoney(text)).toEqual(expected);
  });

  it("does not read a bare number as pay", () => {
    expect(parseMoney("2 years of experience at a 500 person company")).toEqual(
      {
        stipend: null,
        salaryMin: null,
        salaryMax: null,
      },
    );
  });

  it("classifies an unqualified figure by magnitude when no period is stated", () => {
    expect(parseMoney("Compensation ₹45,000").stipend).toBe(45_000);
    expect(parseMoney("Compensation ₹9,00,000").salaryMin).toBe(900_000);
  });
});

describe("parseDeadline", () => {
  it.each([
    ["Apply by 30 Sep 2026", "2026-09-30"],
    ["Apply by 30th September, 2026", "2026-09-30"],
    ["Deadline: Sep 30, 2026", "2026-09-30"],
    ["Last date to apply: 15/10/2026", "2026-10-15"],
    ["Applications close 2026-10-15", "2026-10-15"],
    ["Registration ends 05.11.2026", "2026-11-05"],
  ])("reads %s", (text, expectedDay) => {
    expect(parseDeadline(text)?.slice(0, 10)).toBe(expectedDay);
  });

  it("reads a day-first date, the convention these boards use", () => {
    // 07/08/2026 is 7 August, not 8 July.
    expect(parseDeadline("Apply by 07/08/2026")?.slice(0, 10)).toBe(
      "2026-08-07",
    );
  });

  it("stamps the END of the stated day, so the expiry sweep does not close it that morning", () => {
    expect(parseDeadline("Apply by 30 Sep 2026")).toBe(
      "2026-09-30T23:59:59.000Z",
    );
  });

  it("ignores a date with no deadline cue in front of it", () => {
    expect(parseDeadline("Posted on 30 Sep 2026")).toBeNull();
  });

  it("returns null for an impossible date", () => {
    expect(parseDeadline("Apply by 32/13/2026")).toBeNull();
  });
});

describe("parseSkills", () => {
  it("finds technologies mentioned anywhere in the text", () => {
    expect(parseSkills("Strong in React, TypeScript and PostgreSQL.")).toEqual([
      "TypeScript",
      "React",
      "PostgreSQL",
    ]);
  });

  it("matches terms that are not word-boundary safe", () => {
    expect(parseSkills("C++ and .NET and Next.js")).toEqual(
      expect.arrayContaining(["C++", ".NET", "Next.js"]),
    );
  });

  it("keeps the more specific of an overlapping pair", () => {
    expect(parseSkills("We use Golang here")).toEqual(["Golang"]);
    expect(parseSkills("React Native app")).toEqual(["React Native"]);
  });
});

describe("parseWorkMode / parseJobType", () => {
  it("prefers hybrid over the remote marker it contains", () => {
    expect(parseWorkMode("Hybrid — 3 days in office, 2 remote")).toBe("hybrid");
  });

  it.each([
    ["Fully remote role", "remote"],
    ["Work from home", "remote"],
    ["This is an onsite position", "onsite"],
  ])("reads %s", (text, expected) => {
    expect(parseWorkMode(text)).toBe(expected);
  });

  it("returns null when the text says nothing about the mode", () => {
    expect(parseWorkMode("Great team, good pay")).toBeNull();
  });

  it.each([
    ["Software Engineer Intern", "internship"],
    ["Summer Analyst Programme", "internship"],
    ["Graduate Engineer Trainee", "internship"],
    ["Full-time backend role", "full_time"],
  ])("types %s", (text, expected) => {
    expect(parseJobType(text)).toBe(expected);
  });
});

describe("parseCaptureText — LinkedIn-shaped paste", () => {
  const draft = parseCaptureText(LINKEDIN_PASTE);

  it("takes the title from the first line", () => {
    expect(draft.title).toBe("Software Engineer Intern");
  });

  it("splits the company and location off the meta line", () => {
    expect(draft.companyName).toBe("Acme Corp");
    expect(draft.location).toBe("Bengaluru, Karnataka, India");
  });

  it("does not mistake the 'N days ago' fragment for a location", () => {
    expect(draft.location).not.toMatch(/ago/);
  });

  it("fills mode, type, stipend, deadline and skills", () => {
    expect(draft.workMode).toBe("hybrid");
    expect(draft.jobType).toBe("internship");
    expect(draft.stipend).toBe(60_000);
    expect(draft.deadline?.slice(0, 10)).toBe("2026-09-30");
    expect(draft.requiredSkills).toEqual([
      "React",
      "TypeScript",
      "Node.js",
      "PostgreSQL",
    ]);
  });

  it("keeps the whole paste as the description — the classifier reads it", () => {
    expect(draft.description).toContain("2027 batch");
  });
});

describe("parseCaptureText — labelled paste", () => {
  const draft = parseCaptureText(LABELLED_PASTE);

  it("prefers the labelled values over positional guesses", () => {
    expect(draft.title).toBe("Backend Developer");
    expect(draft.companyName).toBe("Zeta Suite");
    expect(draft.location).toBe("Noida, Uttar Pradesh");
    expect(draft.workMode).toBe("remote");
  });

  it("keeps the user's own skill wording when the list is labelled", () => {
    expect(draft.requiredSkills).toEqual(["Java", "Spring Boot", "Kafka"]);
  });

  it("reads the annual range into salaryMin/salaryMax, not stipend", () => {
    expect(draft.salaryMin).toBe(800_000);
    expect(draft.salaryMax).toBe(1_200_000);
    expect(draft.stipend).toBeNull();
  });
});

describe("parseCaptureText — edges", () => {
  it("returns an empty draft for empty input", () => {
    const draft = parseCaptureText("");
    expect(draft.title).toBeNull();
    expect(draft.companyName).toBeNull();
    expect(draft.requiredSkills).toEqual([]);
    expect(draft.currency).toBe("INR");
  });

  it("splits 'Role at Company' out of a single title line", () => {
    const draft = parseCaptureText("Software Engineer Intern at Acme Corp");
    expect(draft.title).toBe("Software Engineer Intern");
    expect(draft.companyName).toBe("Acme Corp");
  });

  it("skips UI chrome when choosing a title", () => {
    const draft = parseCaptureText(
      "Easy Apply\n120 applicants\nBackend Engineer Intern\nAcme",
    );
    expect(draft.title).toBe("Backend Engineer Intern");
  });

  it("never throws on junk", () => {
    expect(() => parseCaptureText("₹₹₹ -- 12/13/14 :::: ")).not.toThrow();
  });
});
