import { describe, expect, it } from "vitest";
import { postedDaysAgo } from "./capture-seed-id";

// The demo account's queue is photographed for the landing page and the
// walkthrough. A ranked pick a week old or more reads as stale on a page
// about "every morning", so every seeded posting is dated within 7 days.
describe("the capture seed's posting dates", () => {
  it("are all within the last seven days", () => {
    // The seed numbers its jobs from 1; 18 companies with 3 or 4 roles each.
    for (let n = 1; n <= 80; n++) {
      expect(postedDaysAgo(n)).toBeGreaterThanOrEqual(0);
      expect(postedDaysAgo(n)).toBeLessThanOrEqual(7);
    }
  });

  it("still spread across the week, so the reasons differ", () => {
    const ages = new Set(
      Array.from({ length: 40 }, (_, i) => postedDaysAgo(i + 1)),
    );
    expect(ages.size).toBeGreaterThanOrEqual(6);
  });
});
