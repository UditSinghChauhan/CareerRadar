import { describe, expect, it } from "vitest";
import { deadlineInfo } from "../deadline";

const NOW = new Date("2026-11-21T10:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000);

describe("deadlineInfo", () => {
  it("counts whole days left, rounded down, like the server's queue reasons", () => {
    // 1 day and 20 hours: the queue says "Closes tomorrow"; so must every card.
    expect(deadlineInfo(inHours(44), NOW).label).toBe("Closes tomorrow");
    expect(deadlineInfo(inHours(5), NOW).label).toBe("Closes today");
    expect(deadlineInfo(inHours(4 * 24 + 3), NOW)).toEqual({
      days: 4,
      label: "4d left",
      urgency: "soon",
    });
  });

  it("says closed once the deadline has passed", () => {
    expect(deadlineInfo(inHours(-1), NOW)).toMatchObject({
      label: "Closed",
      urgency: "closed",
    });
  });

  it("marks three days or fewer as critical and a week as soon", () => {
    expect(deadlineInfo(inHours(3 * 24 + 1), NOW).urgency).toBe("critical");
    expect(deadlineInfo(inHours(7 * 24 + 1), NOW).urgency).toBe("soon");
    expect(deadlineInfo(inHours(9 * 24), NOW).urgency).toBe("normal");
  });
});
