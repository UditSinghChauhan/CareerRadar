import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getGetDailyQueueQueryKey,
  type DailyQueue,
} from "@workspace/api-client-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TodaysQueue } from "../todays-queue";

const queue = {
  generatedAt: "2026-09-16T03:30:00.000Z",
  queueDay: "2026-09-16",
  limit: 10,
  eligibleCount: 2109,
  distinctCount: 1840,
  progress: {
    appliedToday: 0,
    target: 10,
    streakDays: 0,
    timezone: "Asia/Kolkata",
  },
  weights: {
    relevanceScore: 0.4,
    deadlineUrgency: 0.3,
    freshness: 0.2,
    dreamCompanyBoost: 0.1,
  },
  items: [
    {
      job: {
        id: "job-1",
        companyId: "co-1",
        title: "Software Engineer, New Grad",
        location: "Bengaluru",
        relevanceTrack: "new_grad",
        jobType: "full_time",
        workMode: "hybrid",
        status: "active",
        applyUrl: "https://example.test/apply",
        postedDate: "2026-09-15T03:30:00.000Z",
        createdAt: "2026-09-15T03:30:00.000Z",
        company: { id: "co-1", name: "Northwind Labs", logoUrl: null },
      },
      priority: 78.3,
      components: {
        relevanceScore: 100,
        deadlineUrgency: 10,
        freshness: 100,
        dreamCompanyBoost: 100,
      },
      contributions: {
        relevanceScore: 40,
        deadlineUrgency: 3,
        freshness: 20,
        dreamCompanyBoost: 10,
      },
      duplicateCount: 1,
      reasons: [
        "Dream company",
        "Posted yesterday",
        "Strong match for new grads",
      ],
    },
  ],
} as unknown as DailyQueue;

function renderQueue() {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(getGetDailyQueueQueryKey(), queue);
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TodaysQueue />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("TodaysQueue", () => {
  it("says how many roles open to you the ten were ranked from, and nothing about duplicates", () => {
    renderQueue();
    expect(
      screen.getByText("Ranked from 2,109 roles open to you today"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/distinct roles/)).toBeNull();
    expect(screen.queryByText(/duplicate listings collapsed/)).toBeNull();
  });

  it("shows the score as a whole number", () => {
    renderQueue();
    expect(screen.getByTestId("queue-priority")).toHaveTextContent(/^78$/);
  });

  it("shows each reason as its own chip, not engine text", () => {
    renderQueue();
    const chips = screen.getAllByTestId("queue-reason");
    expect(chips.map((c) => c.textContent)).toEqual([
      "Dream company",
      "Posted yesterday",
      "Strong match for new grads",
    ]);
    expect(document.body.textContent).not.toMatch(/Relevance 40\.0/);
  });

  it("explains the ranking in plain words behind an info button", async () => {
    renderQueue();
    await userEvent.click(
      screen.getByRole("button", { name: "How is this ranked?" }),
    );
    const note = await screen.findByTestId("queue-ranking-note");
    expect(note).toHaveTextContent(/how well the role fits a fresher/i);
    expect(note).toHaveTextContent(/how soon it closes/i);
    expect(note).toHaveTextContent(/how recently it was posted/i);
    expect(note).toHaveTextContent(/companies you starred/i);
  });
});
