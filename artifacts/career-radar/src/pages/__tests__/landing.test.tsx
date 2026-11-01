import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingPage, PRIORITY_COMPONENTS, SOURCES } from "../landing";
import {
  acceptStats,
  resetPublicStats,
} from "@/components/landing/use-public-stats";
import { ILLUSTRATIVE_QUEUE } from "@/components/landing/landing-queue";

describe("LandingPage", () => {
  it("has exactly one h1, stating the outcome", () => {
    render(<LandingPage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "Ten roles worth applying to, every morning.",
    );
  });

  it("sends every Get started action to sign-up", () => {
    render(<LandingPage />);
    const links = screen.getAllByRole("link", { name: "Get started" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/sign-up");
    }
  });

  it("offers sign-in from the header and no theme toggle: the landing is dark only", () => {
    render(<LandingPage />);
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.queryByRole("button", { name: /theme/i })).toBeNull();
  });

  it("names the radar chart with the counts it draws", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("img", { name: /Radar chart of 4,512 open roles/ }),
    ).toBeInTheDocument();
  });

  it("links to GitHub exactly twice: once in the hero, once in the footer", () => {
    render(<LandingPage />);
    const github = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")?.includes("github.com"));
    expect(github).toHaveLength(2);
    expect(github[0].closest("section")).toHaveClass("lp-hero");
    expect(github[1].closest("footer")).not.toBeNull();
  });

  it("prints no date anywhere on the page", () => {
    // The page claims to be live; "Measured 16 September 2026." and
    // "Counted on 31 October 2026" contradicted that.
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/,
    );
    expect(text).not.toMatch(/\b20\d\d\b/);
    for (const el of container.querySelectorAll("[aria-label]")) {
      expect(el.getAttribute("aria-label")).not.toMatch(/\b20\d\d\b/);
    }
  });

  it("states the deadline caveat the README measures, not a working signal", () => {
    // Before this change the page listed "Deadline 30%: how soon applications
    // close" with no caveat, while the README measures a deadline on 13 of
    // 4,995 rows and none of the fresher-eligible ones.
    render(<LandingPage />);
    expect(screen.getByText(/13 of 4,995 rows/)).toBeInTheDocument();
    expect(screen.queryByText("How soon applications close")).toBeNull();
  });

  it("says the reminder hours as a sentence, not as bare figures", () => {
    render(<LandingPage />);
    expect(
      screen.getByText(
        /you get a reminder 72 hours and again 24 hours before it closes/,
      ),
    ).toBeInTheDocument();
  });

  it("labels the walkthrough rows as illustrative and keeps the demo inert", () => {
    const { container } = render(<LandingPage />);
    expect(screen.getByText(/Illustrative rows\./)).toBeInTheDocument();
    const stages = container.querySelectorAll(".lp-stage");
    expect(stages.length).toBeGreaterThan(0);
    stages.forEach((stage) => expect(stage).toHaveAttribute("inert"));
  });

  it("renders every source both as a table row and as a phone card", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelectorAll(".lp-sources tbody tr")).toHaveLength(
      SOURCES.length,
    );
    expect(container.querySelectorAll(".lp-source-cards li")).toHaveLength(
      SOURCES.length,
    );
  });

  it("publishes priority weights that add up to 100%", () => {
    // Mirrors PRIORITY_WEIGHTS in artifacts/api-server/src/queue/priority.ts.
    const total = PRIORITY_COMPONENTS.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBe(100);
  });
});

describe("illustrative queue", () => {
  it("records its source and date and carries no deadline", () => {
    expect(ILLUSTRATIVE_QUEUE.illustrative).toBe(true);
    expect(ILLUSTRATIVE_QUEUE.source).toMatch(/^Illustrative\./);
    expect(ILLUSTRATIVE_QUEUE.date).toBe("2026-09-16");
    expect(ILLUSTRATIVE_QUEUE.items).toHaveLength(10);
    for (const item of ILLUSTRATIVE_QUEUE.items) {
      expect(item.contributions.deadlineUrgency).toBe(3);
    }
  });
});

describe("live counts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetPublicStats();
  });

  it("shows the live figures and the Live mark when the API answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          activePostings: 4600,
          openToFreshers: 2150,
          lastSyncedAt: "2026-11-01T00:00:00.000Z",
        }),
      ),
    );
    resetPublicStats();
    render(<LandingPage />);
    expect(await screen.findByText("Live")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", {
        name: /Radar chart of 4,600 open roles/,
      }),
    ).toBeInTheDocument();
  });

  it("keeps the committed figures, without Live, when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    resetPublicStats();
    render(<LandingPage />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Live")).toBeNull();
    expect(
      screen.getByRole("img", { name: /Radar chart of 4,512 open roles/ }),
    ).toBeInTheDocument();
  });
});

describe("acceptStats", () => {
  it("takes plausible live figures and marks them live", () => {
    expect(
      acceptStats({
        activePostings: 4600,
        openToFreshers: 2150,
        lastSyncedAt: null,
      }),
    ).toEqual({ activePostings: 4600, openToFreshers: 2150, live: true });
  });

  it("refuses an outage dressed as data, so the committed figures stay", () => {
    expect(acceptStats({ activePostings: 0, openToFreshers: 0 })).toBeNull();
    expect(acceptStats({ activePostings: 10, openToFreshers: 20 })).toBeNull();
    expect(acceptStats({ activePostings: "4512" })).toBeNull();
    expect(acceptStats(null)).toBeNull();
  });
});
