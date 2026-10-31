import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage, PRIORITY_COMPONENTS } from "../landing";

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

  it("offers sign-in from the header", () => {
    render(<LandingPage />);
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("names the radar chart with the counts it draws", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("img", { name: /Radar chart of 4,512 active postings/ }),
    ).toBeInTheDocument();
  });

  it("publishes priority weights that add up to 100%", () => {
    // Mirrors PRIORITY_WEIGHTS in artifacts/api-server/src/queue/priority.ts.
    const total = PRIORITY_COMPONENTS.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBe(100);
  });
});
