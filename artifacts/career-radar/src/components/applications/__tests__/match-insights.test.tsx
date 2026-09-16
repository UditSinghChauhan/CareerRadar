import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * Phase 8 — the apply drawer's AI section.
 *
 * Two things are worth a render test rather than a reading of the component,
 * and they are the two acceptance criteria this file can reach from Node:
 *
 *   1. With AI unavailable it renders NOTHING and, more importantly, never
 *      issues the match request. A component that rendered null but still
 *      fired the query would pass a screenshot check and still burn quota.
 *   2. `missingSkills` is the thing on screen. §8 calls it "the genuinely
 *      useful output for interview prep", so a version that quietly dropped it
 *      while still showing a score has to fail.
 *
 * The two generated hooks are mocked at the module boundary, which is also how
 * the `enabled` flag becomes observable: the mock records the options it was
 * called with.
 */

const getAIStatus = vi.fn();
const getJobMatchScore = vi.fn();

vi.mock("@workspace/api-client-react", () => ({
  useGetAIStatus: (opts: unknown) => getAIStatus(opts),
  useGetJobMatchScore: (id: string, opts: unknown) =>
    getJobMatchScore(id, opts),
  getGetAIStatusQueryKey: () => ["ai-status"],
  getGetJobMatchScoreQueryKey: (id: string) => ["ai-match", id],
}));

import { MatchInsights } from "../match-insights";

const MATCH = {
  jobId: "job_1",
  score: 82,
  summary: "Strong overlap on the backend stack.",
  matchingSkills: ["TypeScript", "SQL"],
  missingSkills: ["Java", "Kubernetes", "gRPC"],
  recommendations: ["Build one gRPC service."],
  cached: true,
  stale: false,
};

function idle() {
  return { data: undefined, isLoading: false, isError: false };
}

beforeEach(() => {
  getAIStatus.mockReset();
  getJobMatchScore.mockReset();
  getJobMatchScore.mockReturnValue(idle());
});

afterEach(() => {
  cleanup();
});

describe("when AI is unavailable", () => {
  it("renders nothing at all", () => {
    getAIStatus.mockReturnValue({ data: { available: false } });
    const { container } = render(<MatchInsights jobId="job_1" />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The part a screenshot cannot show. With no key the section is invisible
   * either way; what must also be true is that the request was never enabled,
   * or every drawer opened on a keyless deployment would still hit the endpoint.
   */
  it("does not enable the match request", () => {
    getAIStatus.mockReturnValue({ data: { available: false } });
    render(<MatchInsights jobId="job_1" />);
    const options = getJobMatchScore.mock.calls[0]?.[1] as {
      query: { enabled: boolean };
    };
    expect(options.query.enabled).toBe(false);
  });

  it("does not enable the request when the status call has not answered yet", () => {
    getAIStatus.mockReturnValue({ data: undefined });
    render(<MatchInsights jobId="job_1" />);
    const options = getJobMatchScore.mock.calls[0]?.[1] as {
      query: { enabled: boolean };
    };
    expect(options.query.enabled).toBe(false);
  });

  it("does not enable the request when there is no job id", () => {
    getAIStatus.mockReturnValue({ data: { available: true } });
    render(<MatchInsights jobId={null} />);
    const options = getJobMatchScore.mock.calls[0]?.[1] as {
      query: { enabled: boolean };
    };
    expect(options.query.enabled).toBe(false);
  });
});

describe("when AI is available", () => {
  beforeEach(() => {
    getAIStatus.mockReturnValue({ data: { available: true } });
  });

  it("leads with the missing skills", () => {
    getJobMatchScore.mockReturnValue({
      data: MATCH,
      isLoading: false,
      isError: false,
    });
    render(<MatchInsights jobId="job_1" />);

    const missing = screen.getByTestId("missing-skills");
    for (const skill of MATCH.missingSkills) {
      expect(
        missing.querySelector(`[data-missing-skill="${skill}"]`),
      ).not.toBeNull();
    }
    expect(screen.getByText("Skills to prepare")).toBeInTheDocument();
    expect(screen.getByTestId("match-insights-score")).toHaveTextContent(
      "82% match",
    );
  });

  it("says so plainly when nothing is missing, rather than showing an empty row", () => {
    getJobMatchScore.mockReturnValue({
      data: { ...MATCH, missingSkills: [] },
      isLoading: false,
      isError: false,
    });
    render(<MatchInsights jobId="job_1" />);
    expect(screen.queryByTestId("missing-skills")).toBeNull();
    expect(
      screen.getByText(/Nothing this posting asks for is missing/),
    ).toBeInTheDocument();
  });

  it("marks a stale score instead of hiding it", () => {
    getJobMatchScore.mockReturnValue({
      data: { ...MATCH, stale: true },
      isLoading: false,
      isError: false,
    });
    render(<MatchInsights jobId="job_1" />);
    expect(screen.getByTestId("match-insights-stale")).toBeInTheDocument();
  });

  it("renders nothing when the request failed — never an error message", () => {
    getJobMatchScore.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    const { container } = render(<MatchInsights jobId="job_1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a skeleton while loading, so the drawer never waits on it", () => {
    getJobMatchScore.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    render(<MatchInsights jobId="job_1" />);
    expect(screen.getByTestId("match-insights-loading")).toBeInTheDocument();
  });
});
