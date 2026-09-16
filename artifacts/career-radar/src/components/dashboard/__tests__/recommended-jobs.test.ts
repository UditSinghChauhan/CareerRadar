import { describe, it, expect } from "vitest";
import { recommendedJobsParams } from "../recommended-jobs";

/**
 * The dashboard's "Recommended for You" card.
 *
 * This suite exists for one regression in two halves. The card used to pass
 * only `status: "active"` and `eligibleBatch`, so it recommended roles the
 * relevance classifier had already ruled out — "Sales Manager - II" at score 0
 * under a heading reading "Filtered for 2027 batch". Adding the filter fixed
 * what was shown; it did not fix the ORDER, because the server sorts `newest`
 * by default, and the card went on opening with a score-45 row above a
 * score-100 internship. Both halves are asserted below so neither can be
 * dropped without a red test.
 */
describe("recommendedJobsParams", () => {
  it("asks the server for fresher-eligible rows only", () => {
    // The regression. A card that says "Recommended for You" must not be able
    // to return a row the classifier put on the not_relevant track.
    expect(recommendedJobsParams(2027).isFresherEligible).toBe(true);
  });

  it("keeps the filter when the profile has no graduation year", () => {
    // The batch narrows; it is not the relevance filter and cannot stand in
    // for it. A user who has not filled in their year still gets engineering
    // roles rather than everything active.
    for (const year of [null, undefined, 0]) {
      const params = recommendedJobsParams(year);
      expect(params.isFresherEligible, String(year)).toBe(true);
      expect(params, String(year)).not.toHaveProperty("eligibleBatch");
    }
  });

  it("scopes to the user's batch when the profile has one", () => {
    expect(recommendedJobsParams(2027).eligibleBatch).toBe(2027);
  });

  it("orders by relevance, not by date — the six shown are the six best, not the six newest", () => {
    // The second half of the regression. With the server's default `newest`
    // the card returned six eligible rows in date order, which put a score-45
    // row above a score-100 internship under a heading that says
    // "Recommended for You".
    expect(recommendedJobsParams(2027).sort).toBe("relevance");
  });

  it("orders by relevance whether or not the profile has a graduation year", () => {
    expect(recommendedJobsParams(null).sort).toBe("relevance");
  });

  it("asks for active rows, six of them — the grid renders at most six", () => {
    const params = recommendedJobsParams(2027);
    expect(params.status).toBe("active");
    expect(params.limit).toBe(6);
  });

  it("sends no other filter, so the card stays the broad view of the feed", () => {
    // Guards the other direction: this card is deliberately not the Jobs page.
    // A stray location or track filter here would silently narrow it and the
    // "N matching" count next to the heading would stop meaning anything.
    expect(Object.keys(recommendedJobsParams(2027)).sort()).toEqual([
      "eligibleBatch",
      "isFresherEligible",
      "limit",
      "sort",
      "status",
    ]);
  });
});
