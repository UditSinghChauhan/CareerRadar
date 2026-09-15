import { describe, it, expect } from "vitest";
import {
  MIN_FTS_LENGTH,
  looksLikeWebsearchSyntax,
  prefixTsQuery,
  searchTerms,
  useFullTextSearch,
} from "./search-query";

describe("searchTerms", () => {
  it("keeps letters and digits, in order", () => {
    expect(searchTerms("Backend Intern 2027")).toEqual([
      "Backend",
      "Intern",
      "2027",
    ]);
  });

  it("drops everything a tsquery parser would choke on", () => {
    // These are the inputs that made `to_tsquery` throw, which on the Jobs
    // page meant a 500 for typing an ampersand.
    expect(searchTerms("c++ & !foo | (bar)")).toEqual(["c", "foo", "bar"]);
    expect(searchTerms("&&&")).toEqual([]);
    expect(searchTerms("")).toEqual([]);
  });

  it("keeps non-ASCII letters", () => {
    expect(searchTerms("café résumé")).toEqual(["café", "résumé"]);
  });
});

describe("prefixTsQuery", () => {
  it("prefixes every term of three characters or more", () => {
    expect(prefixTsQuery("backend intern")).toBe("backend:* & intern:*");
  });

  it("leaves short terms exact, so 'c' does not match half the table", () => {
    expect(prefixTsQuery("c++")).toBe("c");
    expect(prefixTsQuery("ml engineer")).toBe("ml & engineer:*");
  });

  it("is null when there is nothing to build a query from", () => {
    expect(prefixTsQuery("!!!")).toBeNull();
    expect(prefixTsQuery("   ")).toBeNull();
  });

  it("steps aside for websearch syntax, which a flat AND cannot express", () => {
    // Each of these would otherwise be silently undone: the prefix arm would
    // OR the excluded or alternative terms straight back in.
    expect(prefixTsQuery("engineer -platform")).toBeNull();
    expect(prefixTsQuery('"backend engineer"')).toBeNull();
    expect(prefixTsQuery("intern or trainee")).toBeNull();
    // A hyphen INSIDE a word is not a negation.
    expect(prefixTsQuery("front-end")).toBe("front:* & end:*");
  });

  it("never emits a character to_tsquery would treat as an operator", () => {
    const query = prefixTsQuery("a&b|c!d(e)");
    expect(query).not.toBeNull();
    expect(query).toBe("a & b & c & d & e");
  });
});

describe("useFullTextSearch", () => {
  it("is off below the fallback threshold", () => {
    expect(MIN_FTS_LENGTH).toBe(3);
    expect(useFullTextSearch("ml")).toBe(false);
    expect(useFullTextSearch("  x ")).toBe(false);
  });

  it("is on from the threshold up", () => {
    expect(useFullTextSearch("sde")).toBe(true);
    expect(useFullTextSearch("backend engineer")).toBe(true);
  });
});

describe("looksLikeWebsearchSyntax", () => {
  it("recognises phrases, negations and explicit or", () => {
    expect(looksLikeWebsearchSyntax('"data science"')).toBe(true);
    expect(looksLikeWebsearchSyntax("sde -senior")).toBe(true);
    expect(looksLikeWebsearchSyntax("intern OR trainee")).toBe(true);
  });

  it("leaves ordinary queries alone", () => {
    expect(looksLikeWebsearchSyntax("backend intern")).toBe(false);
    expect(looksLikeWebsearchSyntax("front-end developer")).toBe(false);
    expect(looksLikeWebsearchSyntax("")).toBe(false);
  });
});
