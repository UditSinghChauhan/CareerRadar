import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("lowercases a simple company name", () => {
    expect(slugify("Postman")).toBe("postman");
  });

  it("strips accents and collapses punctuation/whitespace into single hyphens", () => {
    expect(slugify("Café Solutions Pvt. Ltd.")).toBe("cafe-solutions-pvt-ltd");
  });

  it("has no leading or trailing hyphens", () => {
    expect(slugify("  --Weird Name!!--  ")).toBe("weird-name");
  });

  it("falls back to unknown-company for empty input", () => {
    expect(slugify("")).toBe("unknown-company");
  });

  it("falls back to unknown-company for input with no alphanumeric characters", () => {
    expect(slugify("!!!___$$$")).toBe("unknown-company");
  });

  it("truncates to 80 characters", () => {
    const long = "a".repeat(100);
    const result = slugify(long);
    expect(result.length).toBe(80);
    expect(result).toBe("a".repeat(80));
  });
});
