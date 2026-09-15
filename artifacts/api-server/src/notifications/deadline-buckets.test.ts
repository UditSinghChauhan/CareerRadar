import { describe, it, expect } from "vitest";
import {
  DEADLINE_BUCKETS,
  bucketFor,
  deadlineDedupeKey,
  newJobDedupeKey,
} from "./deadline-buckets";

const NOW = new Date("2026-09-16T12:00:00.000Z");

function hoursFromNow(h: number): Date {
  return new Date(NOW.getTime() + h * 60 * 60 * 1000);
}

describe("bucketFor", () => {
  it("puts a deadline inside 24 hours in the 24h bucket", () => {
    expect(bucketFor(hoursFromNow(20), NOW)?.id).toBe("24h");
  });

  it("puts a deadline between 24 and 72 hours in the 72h bucket", () => {
    expect(bucketFor(hoursFromNow(60), NOW)?.id).toBe("72h");
  });

  it("prefers the narrower bucket when both windows contain the deadline", () => {
    // 20 hours is inside 24h AND inside 72h. "closes within 24 hours" is the
    // more useful of the two sentences, so it has to win — this is the reason
    // DEADLINE_BUCKETS is ordered narrowest first.
    expect(DEADLINE_BUCKETS[0].id).toBe("24h");
    expect(bucketFor(hoursFromNow(20), NOW)?.id).toBe("24h");
  });

  it("returns nothing for a deadline beyond the widest bucket", () => {
    expect(bucketFor(hoursFromNow(73), NOW)).toBeNull();
    expect(bucketFor(hoursFromNow(24 * 30), NOW)).toBeNull();
  });

  it("returns nothing for a deadline that has already passed", () => {
    // Not an alert: the user can do nothing about it, and the staleness sweep
    // closes the row anyway.
    expect(bucketFor(hoursFromNow(-1), NOW)).toBeNull();
    expect(bucketFor(NOW, NOW)).toBeNull();
  });

  it("returns nothing when there is no deadline at all", () => {
    expect(bucketFor(null, NOW)).toBeNull();
    expect(bucketFor(undefined, NOW)).toBeNull();
  });

  it("is inclusive at each boundary", () => {
    expect(bucketFor(hoursFromNow(24), NOW)?.id).toBe("24h");
    expect(bucketFor(hoursFromNow(72), NOW)?.id).toBe("72h");
  });

  it("returns nothing for an unparsable date rather than throwing", () => {
    expect(bucketFor(new Date("not a date"), NOW)).toBeNull();
  });
});

describe("dedupe keys", () => {
  it("are stable for the same job and bucket", () => {
    expect(deadlineDedupeKey("job_1", "24h")).toBe("deadline:job_1:24h");
    expect(deadlineDedupeKey("job_1", "24h")).toBe(
      deadlineDedupeKey("job_1", "24h"),
    );
  });

  it("differ per bucket, so a job can be announced once at 72h and again at 24h", () => {
    expect(deadlineDedupeKey("job_1", "72h")).not.toBe(
      deadlineDedupeKey("job_1", "24h"),
    );
  });

  it("differ per saved search, so two searches both matching one job both fire", () => {
    expect(newJobDedupeKey("search_a", "job_1")).not.toBe(
      newJobDedupeKey("search_b", "job_1"),
    );
  });

  it("never collide between the two kinds", () => {
    expect(deadlineDedupeKey("x", "24h")).not.toBe(newJobDedupeKey("x", "24h"));
  });
});
