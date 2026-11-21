import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * One posting, closing in 1 day and 20 hours, on the dashboard: Today's ten
 * (server) said "Closes tomorrow", Closing soon said "2d left" and Upcoming
 * deadlines said "1d to go". Both cards now count like the server.
 */
const NOW = new Date("2026-11-21T10:00:00Z");
const job = {
  id: "j1",
  title: "Full Stack Engineer, Entry Level",
  deadline: new Date(NOW.getTime() + 44 * 3600_000).toISOString(),
  applyUrl: null,
  company: { name: "Orbit Retail", logoUrl: null },
};

vi.mock("@workspace/api-client-react", () => ({
  useGetJobsClosingSoon: () => ({ data: [job], isLoading: false }),
}));

import { ClosingSoon } from "../closing-soon";
import { DeadlineTimeline } from "../deadline-timeline";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("deadline labels on the dashboard", () => {
  it("Closing soon says what the queue says", () => {
    render(<ClosingSoon />);
    expect(screen.getByText("Closes tomorrow")).toBeInTheDocument();
  });

  it("Upcoming deadlines says what the queue says", () => {
    render(<DeadlineTimeline />);
    expect(screen.getByText("Closes tomorrow")).toBeInTheDocument();
  });
});
