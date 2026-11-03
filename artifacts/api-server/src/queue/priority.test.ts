import { describe, it, expect } from "vitest";
import {
  DEADLINE_URGENCY,
  FRESHNESS,
  PRIORITY_WEIGHTS,
  deadlineUrgency,
  explainPriority,
  freshness,
  normalizeTitleForDedupe,
  priorityContributions,
  priorityFromComponents,
  type PriorityComponents,
} from "./priority";

const NOW = new Date("2026-09-15T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

describe("priority weights — UPGRADE.md §3.1", () => {
  it("are exactly the four the spec names, and sum to 1", () => {
    expect(PRIORITY_WEIGHTS).toEqual({
      relevanceScore: 0.4,
      deadlineUrgency: 0.3,
      freshness: 0.2,
      dreamCompanyBoost: 0.1,
    });
    const sum = Object.values(PRIORITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("caps priority at 100 when every component is maxed", () => {
    expect(
      priorityFromComponents({
        relevanceScore: 100,
        deadlineUrgency: 100,
        freshness: 100,
        dreamCompanyBoost: 100,
      }),
    ).toBe(100);
  });

  it("is 0 when every component is 0", () => {
    expect(
      priorityFromComponents({
        relevanceScore: 0,
        deadlineUrgency: 0,
        freshness: 0,
        dreamCompanyBoost: 0,
      }),
    ).toBe(0);
  });
});

describe("deadlineUrgency", () => {
  it("is the spec's 'none' value when there is no deadline", () => {
    expect(deadlineUrgency(null, NOW)).toBe(DEADLINE_URGENCY.none);
    expect(deadlineUrgency(undefined, NOW)).toBe(DEADLINE_URGENCY.none);
  });

  it("scores 100 inside 72 hours", () => {
    expect(deadlineUrgency(at(1 * HOUR), NOW)).toBe(100);
    expect(deadlineUrgency(at(71 * HOUR), NOW)).toBe(100);
  });

  it("scores 80 from 72 hours to 7 days", () => {
    expect(deadlineUrgency(at(72 * HOUR), NOW)).toBe(80);
    expect(deadlineUrgency(at(6 * DAY), NOW)).toBe(80);
  });

  it("scores 40 from 7 to 30 days", () => {
    expect(deadlineUrgency(at(7 * DAY), NOW)).toBe(40);
    expect(deadlineUrgency(at(29 * DAY), NOW)).toBe(40);
  });

  it("falls back to 'none' beyond 30 days — the spec lists no bucket there", () => {
    expect(deadlineUrgency(at(30 * DAY), NOW)).toBe(DEADLINE_URGENCY.none);
    expect(deadlineUrgency(at(200 * DAY), NOW)).toBe(DEADLINE_URGENCY.none);
  });

  it("treats an already-passed deadline as 'none', not as maximally urgent", () => {
    // The naive `< now + 72h` reading scores an expired deadline 100 and puts
    // dead postings at the top of the queue every morning.
    expect(deadlineUrgency(at(-1 * HOUR), NOW)).toBe(DEADLINE_URGENCY.none);
    expect(deadlineUrgency(at(-90 * DAY), NOW)).toBe(DEADLINE_URGENCY.none);
  });
});

describe("freshness", () => {
  it("is 100 for the first 48 hours", () => {
    expect(freshness(NOW, NOW)).toBe(100);
    expect(freshness(at(-47 * HOUR), NOW)).toBe(100);
    expect(freshness(at(-FRESHNESS.plateauDays * DAY), NOW)).toBe(100);
  });

  it("decays linearly to 0 at 30 days", () => {
    // Midpoint of the 2→30 day ramp is day 16.
    expect(freshness(at(-16 * DAY), NOW)).toBeCloseTo(50, 1);
    expect(freshness(at(-9 * DAY), NOW)).toBeCloseTo(75, 1);
    expect(freshness(at(-23 * DAY), NOW)).toBeCloseTo(25, 1);
  });

  it("is 0 at and beyond 30 days", () => {
    expect(freshness(at(-30 * DAY), NOW)).toBe(0);
    expect(freshness(at(-45 * DAY), NOW)).toBe(0);
    expect(freshness(at(-400 * DAY), NOW)).toBe(0);
  });

  it("is 0, not invented, when the provider gave no posted date", () => {
    expect(freshness(null, NOW)).toBe(0);
    expect(freshness(undefined, NOW)).toBe(0);
  });

  it("does not exceed 100 for a posted date in the future", () => {
    // Some aggregators stamp tomorrow. That is a provider bug, not bonus
    // freshness, and a value over 100 would break the 0–100 contract.
    expect(freshness(at(5 * DAY), NOW)).toBe(100);
  });

  it("decays monotonically — this is what turns the queue over daily", () => {
    const ages = [0, 2, 3, 5, 10, 20, 29, 30, 40];
    const scores = ages.map((d) => freshness(at(-d * DAY), NOW));
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
  });
});

describe("the saturated band — what actually separates two score-100 rows", () => {
  /**
   * The measured shape of the live table on 2026-09-15: 620 of 1,549
   * eligible rows score exactly 100. These assertions pin down that the
   * ranking still moves inside that band, because if it does not the queue
   * is an arbitrary ten.
   */
  const saturated = (
    overrides: Partial<PriorityComponents> = {},
  ): PriorityComponents => ({
    relevanceScore: 100,
    deadlineUrgency: DEADLINE_URGENCY.none,
    freshness: 0,
    dreamCompanyBoost: 0,
    ...overrides,
  });

  it("gives every score-100 row an identical 40.0 from relevance", () => {
    expect(priorityContributions(saturated()).relevanceScore).toBe(40);
  });

  it("gives every deadline-less row an identical 3.0 — this term separates nothing today", () => {
    const a = priorityContributions(saturated({ freshness: 100 }));
    const b = priorityContributions(saturated({ freshness: 0 }));
    expect(a.deadlineUrgency).toBe(3);
    expect(b.deadlineUrgency).toBe(3);
  });

  it("gives freshness a full 20-point spread inside the band", () => {
    const newest = priorityFromComponents(saturated({ freshness: 100 }));
    const oldest = priorityFromComponents(saturated({ freshness: 0 }));
    expect(newest - oldest).toBeCloseTo(20, 6);
    // The measured live range of the band, 43.00–63.00.
    expect(oldest).toBe(43);
    expect(newest).toBe(63);
  });

  it("separates two rows posted a day apart, so tomorrow's top ten differs", () => {
    const today = priorityFromComponents(
      saturated({ freshness: freshness(at(-3 * DAY), NOW) }),
    );
    const dayOlder = priorityFromComponents(
      saturated({ freshness: freshness(at(-4 * DAY), NOW) }),
    );
    expect(today).toBeGreaterThan(dayOlder);
    // A day of ageing costs 100/28 freshness points × the 0.20 weight ≈ 0.714.
    // `freshness` rounds to 2 decimals, so the realised step is 0.72; the
    // tolerance below is what that rounding allows, not a loosened assertion.
    expect(today - dayOlder).toBeCloseTo((100 / 28) * 0.2, 1);
    expect(today - dayOlder).toBeLessThan(0.75);
  });

  it("lets a bookmarked company outrank 50 days of freshness", () => {
    const dream = priorityFromComponents(
      saturated({ freshness: 0, dreamCompanyBoost: 100 }),
    );
    const fresh = priorityFromComponents(saturated({ freshness: 100 }));
    // 10 points of dream boost vs 20 of freshness: freshness still wins at
    // the extreme, which is the intended weighting, but the boost is worth
    // half the freshness range.
    expect(dream).toBe(53);
    expect(fresh).toBeGreaterThan(dream);
  });
});

describe("explainPriority — short reasons a student reads", () => {
  const base: PriorityComponents = {
    relevanceScore: 100,
    deadlineUrgency: 10,
    freshness: 100,
    dreamCompanyBoost: 0,
  };
  const ctx = {
    deadline: null,
    postedDate: at(-1 * DAY),
    duplicateCount: 1,
    track: "new_grad",
    now: NOW,
  };
  /** Words from the engine's own vocabulary that a student should never read. */
  const ENGINE =
    /relevance|classifier|\/100|separating|term|component|band|freshness|score/i;

  it("gives at most three reasons, each short and free of engine terms", () => {
    const reasons = explainPriority(
      { ...base, deadlineUrgency: 80, dreamCompanyBoost: 100 },
      { ...ctx, deadline: at(5 * DAY), duplicateCount: 4 },
    );
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.length).toBeLessThanOrEqual(3);
    for (const r of reasons) {
      expect(r).not.toMatch(ENGINE);
      expect(r.length).toBeLessThanOrEqual(32);
    }
  });

  it("reads a typical row as freshness and fit, not as a missing deadline", () => {
    expect(explainPriority(base, ctx)).toEqual([
      "Posted yesterday",
      "Strong match for new grads",
    ]);
  });

  it("never mentions a deadline the source did not publish", () => {
    const reasons = explainPriority(base, ctx).join(" ");
    expect(reasons).not.toMatch(/deadline|closing date/i);
  });

  it("puts a real closing date first", () => {
    const reasons = explainPriority(
      { ...base, deadlineUrgency: 80 },
      { ...ctx, deadline: at(5 * DAY) },
    );
    expect(reasons[0]).toBe("Closes in 5 days");
  });

  it("says tomorrow and today rather than 1 or 0 days", () => {
    expect(
      explainPriority(
        { ...base, deadlineUrgency: 100 },
        { ...ctx, deadline: at(30 * HOUR) },
      )[0],
    ).toBe("Closes tomorrow");
    expect(
      explainPriority(
        { ...base, deadlineUrgency: 100 },
        { ...ctx, deadline: at(5 * HOUR) },
      )[0],
    ).toBe("Closes today");
  });

  it("says nothing about a deadline that has passed or is far away", () => {
    for (const deadline of [at(-2 * DAY), at(60 * DAY)]) {
      const reasons = explainPriority(base, { ...ctx, deadline }).join(" ");
      expect(reasons).not.toMatch(/close/i);
    }
  });

  it("names a dream company only when the boost fired", () => {
    expect(explainPriority(base, ctx)).not.toContain("Dream company");
    expect(explainPriority({ ...base, dreamCompanyBoost: 100 }, ctx)).toContain(
      "Dream company",
    );
  });

  it("says how long ago a role was posted, in days", () => {
    expect(
      explainPriority(base, { ...ctx, postedDate: at(-3 * HOUR) })[0],
    ).toBe("Posted today");
    expect(
      explainPriority(
        { ...base, freshness: 50 },
        { ...ctx, postedDate: at(-16 * DAY) },
      )[0],
    ).toBe("Posted 16 days ago");
  });

  it("leaves the age out when the source gave no posted date", () => {
    const reasons = explainPriority(
      { ...base, freshness: 0 },
      { ...ctx, postedDate: null },
    );
    expect(reasons.join(" ")).not.toMatch(/posted/i);
  });

  it("describes the fit for each track, and softens it below the cap", () => {
    expect(explainPriority(base, { ...ctx, track: "internship" })).toContain(
      "Strong match for interns",
    );
    expect(
      explainPriority(
        { ...base, relevanceScore: 85 },
        { ...ctx, track: "early_career" },
      ),
    ).toContain("Good match for freshers");
    expect(
      explainPriority({ ...base, relevanceScore: 40 }, ctx).join(" "),
    ).not.toMatch(/match/);
  });

  it("says a role was posted more than once, shown once", () => {
    expect(explainPriority(base, { ...ctx, duplicateCount: 6 })).toContain(
      "Listed 6 times, shown once",
    );
    expect(explainPriority(base, ctx).join(" ")).not.toMatch(/Listed/);
  });

  it("keeps the most useful three when more apply", () => {
    const reasons = explainPriority(
      { ...base, deadlineUrgency: 80, dreamCompanyBoost: 100 },
      { ...ctx, deadline: at(5 * DAY), duplicateCount: 4 },
    );
    expect(reasons).toEqual([
      "Closes in 5 days",
      "Dream company",
      "Posted yesterday",
    ]);
  });
});

describe("normalizeTitleForDedupe", () => {
  it("collapses case, punctuation and repeated whitespace", () => {
    const key = normalizeTitleForDedupe("Web Developer");
    expect(normalizeTitleForDedupe("web developer")).toBe(key);
    expect(normalizeTitleForDedupe("  Web   Developer  ")).toBe(key);
    expect(normalizeTitleForDedupe("Web Developer!")).toBe(key);
    expect(normalizeTitleForDedupe("Web-Developer")).toBe(key);
    expect(normalizeTitleForDedupe("Web/Developer")).toBe(key);
  });

  it("keeps genuinely different roles apart", () => {
    // These two really are different postings at the same company, and
    // collapsing them would hide a job.
    expect(normalizeTitleForDedupe("Web Developer")).not.toBe(
      normalizeTitleForDedupe("Web Developer Internship Ahmedabad"),
    );
    expect(normalizeTitleForDedupe("Frontend Intern")).not.toBe(
      normalizeTitleForDedupe("Frontend Developer"),
    );
  });

  it("collapses the shapes the live table actually carries", () => {
    // The Sadbhav Futuretech cluster: same advert, six source_urls.
    const titles = [
      "Web Developer",
      "Web  Developer",
      "WEB DEVELOPER",
      "Web Developer ",
    ];
    expect(new Set(titles.map(normalizeTitleForDedupe)).size).toBe(1);
  });
});
