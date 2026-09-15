import { describe, it, expect } from "vitest";
import { deslugify, parseCaptureUrl } from "./parse-url";
import { detectPlatform } from "./platform";

describe("detectPlatform", () => {
  it.each([
    ["https://www.linkedin.com/jobs/view/abc-123", "linkedin", "LinkedIn"],
    [
      "https://internshala.com/internship/detail/x",
      "internshala",
      "Internshala",
    ],
    ["https://unstop.com/internships/x-123", "unstop", "Unstop"],
    ["https://wellfound.com/jobs/1-x", "wellfound", "Wellfound"],
    ["https://www.naukri.com/job-listings-x-1", "naukri", "Naukri"],
    ["https://boards.greenhouse.io/postman/jobs/1", "greenhouse", "Greenhouse"],
    ["https://jobs.lever.co/razorpay/abc", "lever", "Lever"],
    ["https://careers.acme.co.in/roles/1", "acme", "Acme"],
  ])("derives the brand label from %s", (url, key, label) => {
    const platform = detectPlatform(url);
    expect(platform?.key).toBe(key);
    expect(platform?.label).toBe(label);
  });

  it("accepts a bare host the way an address bar would", () => {
    expect(detectPlatform("wellfound.com/jobs/1-x")?.key).toBe("wellfound");
  });

  it.each([["not a url"], [""], [null], [undefined], ["localhost"]])(
    "returns null for %s",
    (value) => {
      expect(detectPlatform(value as string | null)).toBeNull();
    },
  );
});

describe("deslugify", () => {
  it("turns a slug into a title", () => {
    expect(deslugify("software-engineer-intern")).toBe(
      "Software Engineer Intern",
    );
  });

  it("uppercases known acronyms and level numerals", () => {
    expect(deslugify("sde-intern")).toBe("SDE Intern");
    expect(deslugify("ui-ux-designer")).toBe("UI UX Designer");
    expect(deslugify("software-engineer-ii")).toBe("Software Engineer II");
  });

  it("drops a posting id but keeps a batch year — §2.1 reads it", () => {
    expect(deslugify("sde-intern-2027-4012345678")).toBe("SDE Intern 2027");
  });

  it("drops board boilerplate words", () => {
    expect(deslugify("backend-engineer-job")).toBe("Backend Engineer");
  });
});

describe("parseCaptureUrl", () => {
  // Every URL below is a STRING TO BE PARSED. Nothing in this suite, or in the
  // module under test, opens a connection — see blocked-domains.test.ts.

  it("splits a LinkedIn slug on its -at- separator", () => {
    const result = parseCaptureUrl(
      "https://www.linkedin.com/jobs/view/software-engineer-intern-at-acme-corp-4123456789/",
    );
    expect(result.title).toBe("Software Engineer Intern");
    expect(result.companyName).toBe("Acme Corp");
    expect(result.platform?.label).toBe("LinkedIn");
  });

  it("keeps the batch year out of a LinkedIn title's id", () => {
    const result = parseCaptureUrl(
      "https://www.linkedin.com/jobs/view/sde-intern-2027-at-razorpay-4012345678?refId=abc",
    );
    expect(result.title).toBe("SDE Intern 2027");
    expect(result.companyName).toBe("Razorpay");
  });

  it("falls back to the whole LinkedIn slug when there is no -at-", () => {
    const result = parseCaptureUrl(
      "https://www.linkedin.com/jobs/view/backend-engineer-intern-4123456789",
    );
    expect(result.title).toBe("Backend Engineer Intern");
    expect(result.companyName).toBeUndefined();
  });

  it("reads role, city and employer out of an Internshala slug", () => {
    const result = parseCaptureUrl(
      "https://internshala.com/internship/detail/software-development-internship-in-delhi-at-acme-corp1234567",
    );
    expect(result.title).toBe("Software Development Internship");
    expect(result.location).toBe("Delhi");
    expect(result.companyName).toBe("Acme Corp");
  });

  it("reads a Wellfound title from behind its leading id", () => {
    const result = parseCaptureUrl(
      "https://wellfound.com/jobs/1234567-frontend-engineer-intern",
    );
    expect(result.title).toBe("Frontend Engineer Intern");
  });

  it("reads the employer from a Wellfound company path", () => {
    const result = parseCaptureUrl(
      "https://wellfound.com/company/stripe/jobs/987654-backend-engineer",
    );
    expect(result.title).toBe("Backend Engineer");
    expect(result.companyName).toBe("Stripe");
  });

  it("cuts a Naukri slug at its experience band", () => {
    const result = parseCaptureUrl(
      "https://www.naukri.com/job-listings-software-engineer-acme-technologies-noida-0-to-2-years-210925123456",
    );
    // Naukri glues role, employer and city together with no separator, so the
    // title is deliberately over-inclusive — the user trims it in the dialog.
    expect(result.title).toBe("Software Engineer Acme Technologies Noida");
    expect(result.title).not.toMatch(/years/i);
  });

  it("takes only a title from Unstop, whose slug has no separator to split on", () => {
    const result = parseCaptureUrl(
      "https://unstop.com/internships/backend-development-internship-zeta-suite-1234567",
    );
    expect(result.title).toBe("Backend Development Internship Zeta Suite");
    expect(result.companyName).toBeUndefined();
  });

  it("reads the employer from an ATS path's first segment", () => {
    expect(
      parseCaptureUrl("https://boards.greenhouse.io/postman/jobs/1234567")
        .companyName,
    ).toBe("Postman");
    expect(
      parseCaptureUrl("https://jobs.lever.co/razorpay/abc-def").companyName,
    ).toBe("Razorpay");
  });

  it("returns a null platform and nothing else for a non-URL", () => {
    expect(parseCaptureUrl("paste me")).toEqual({ platform: null });
  });
});
