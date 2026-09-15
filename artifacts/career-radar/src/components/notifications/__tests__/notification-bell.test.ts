import { describe, it, expect } from "vitest";
import type { Notification } from "@workspace/api-client-react";
import { badgeLabel, destinationFor, relativeTime } from "../notification-bell";

const NOW = new Date("2026-09-16T12:00:00.000Z").getTime();

function minutesAgo(m: number): string {
  return new Date(NOW - m * 60 * 1000).toISOString();
}

describe("relativeTime", () => {
  it("says 'just now' inside the first minute", () => {
    expect(relativeTime(minutesAgo(0), NOW)).toBe("just now");
    expect(relativeTime(minutesAgo(0.5), NOW)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(relativeTime(minutesAgo(5), NOW)).toBe("5m ago");
    expect(relativeTime(minutesAgo(3 * 60), NOW)).toBe("3h ago");
    expect(relativeTime(minutesAgo(2 * 24 * 60), NOW)).toBe("2d ago");
  });

  it("falls back to a date past a week, where 'Nd ago' stops being useful", () => {
    expect(relativeTime("2026-09-01T12:00:00.000Z", NOW)).toBe("1 Sept");
  });

  it("never renders a negative age from a clock skew", () => {
    // The row's createdAt comes from the database; the browser's clock can be
    // behind it. "-3m ago" would be the visible symptom.
    expect(relativeTime(new Date(NOW + 3 * 60 * 1000).toISOString(), NOW)).toBe(
      "just now",
    );
  });

  it("returns an empty string rather than 'NaN' for an unparsable date", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});

describe("badgeLabel", () => {
  it("shows the exact count up to nine", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(9)).toBe("9");
  });

  it("caps at 9+ so a three-digit count cannot widen the header", () => {
    expect(badgeLabel(10)).toBe("9+");
    expect(badgeLabel(250)).toBe("9+");
  });
});

describe("destinationFor", () => {
  function notification(type: Notification["type"]): Notification {
    return {
      id: "n_1",
      clerkId: "user_1",
      title: "t",
      message: "m",
      type,
      isRead: false,
      createdAt: minutesAgo(1),
    } as Notification;
  }

  it("sends a deadline reminder to the tracker", () => {
    expect(destinationFor(notification("deadline_reminder"))).toBe(
      "/applications",
    );
  });

  it("sends a new-job alert to the feed", () => {
    expect(destinationFor(notification("new_job"))).toBe("/jobs");
  });

  it.each(["status_update", "system"] as const)(
    "leaves a %s notification unlinked rather than pointing it at a route that does not exist",
    (type) => {
      expect(destinationFor(notification(type))).toBeNull();
    },
  );
});
