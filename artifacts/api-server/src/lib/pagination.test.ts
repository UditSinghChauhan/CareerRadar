import { describe, it, expect } from "vitest";
import { paginate, buildPaginatedResult } from "./pagination";

describe("paginate", () => {
  it("defaults to page 1, limit 20 when no params given", () => {
    expect(paginate({})).toEqual({ page: 1, limit: 20 });
  });

  it("accepts valid numeric-string page and limit", () => {
    expect(paginate({ page: "3", limit: "50" })).toEqual({ page: 3, limit: 50 });
  });

  it("clamps limit above 100 down to 100", () => {
    expect(paginate({ limit: "500" })).toEqual({ page: 1, limit: 100 });
  });

  it("clamps a zero or negative page up to 1", () => {
    expect(paginate({ page: "-5" })).toEqual({ page: 1, limit: 20 });
    expect(paginate({ page: "0" })).toEqual({ page: 1, limit: 20 });
  });

  it("clamps a negative limit up to 1", () => {
    expect(paginate({ limit: "-10" })).toEqual({ page: 1, limit: 1 });
  });

  it("treats limit=0 as unset and falls back to the default (20), not the clamp floor (1)", () => {
    // `Number(params.limit) || 20` treats 0 as falsy, same as an absent/non-numeric
    // limit — so a literal 0 does NOT reach the Math.max(1, ...) clamp below it.
    expect(paginate({ limit: "0" })).toEqual({ page: 1, limit: 20 });
  });

  it("falls back to defaults for non-numeric input", () => {
    expect(paginate({ page: "abc", limit: "xyz" })).toEqual({ page: 1, limit: 20 });
  });
});

describe("buildPaginatedResult", () => {
  it("echoes page/limit/total and computes totalPages", () => {
    const result = buildPaginatedResult(["a", "b"], 45, { page: 2, limit: 20 });
    expect(result).toEqual({
      data: ["a", "b"],
      meta: { page: 2, limit: 20, total: 45, totalPages: 3 },
    });
  });

  it("computes totalPages as 0 when total is 0", () => {
    const result = buildPaginatedResult([], 0, { page: 1, limit: 20 });
    expect(result.meta.totalPages).toBe(0);
  });
});
