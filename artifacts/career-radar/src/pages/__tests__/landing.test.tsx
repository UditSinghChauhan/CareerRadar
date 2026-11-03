import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { LandingPage } from "../landing";
import { QUESTIONS } from "@/components/landing/faq";
import { acceptStats } from "@/components/landing/use-public-stats";

/** Renders the landing and waits for the chapters it mounts after the hero. */
async function renderLanding() {
  const utils = render(<LandingPage />);
  await screen.findByRole("heading", { name: "Questions" });
  return utils;
}

describe("LandingPage", () => {
  it("has exactly one h1, stating the outcome", async () => {
    await renderLanding();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "Ten roles worth applying to, every morning.",
    );
  });

  it("sends every Get started action to sign-up", async () => {
    await renderLanding();
    const links = screen.getAllByRole("link", { name: "Get started" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/sign-up");
    }
  });

  it("offers sign-in from the header and no theme toggle", async () => {
    await renderLanding();
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.queryByRole("button", { name: /theme/i })).toBeNull();
  });

  it("links the code from the hero, the closing and the footer", async () => {
    const { container } = await renderLanding();
    const repo = [...container.querySelectorAll("a")].filter(
      (a) =>
        a.getAttribute("href") ===
        "https://github.com/UditSinghChauhan/CareerRadar",
    );
    expect(repo.map((a) => a.closest("section, footer")?.className)).toEqual([
      "lp-hero",
      "lp-footer",
    ]);
  });

  it("credits the designer and links to their GitHub, with no empty portfolio links", async () => {
    await renderLanding();
    const footer = within(screen.getByRole("contentinfo"));
    expect(
      footer.getByRole("link", { name: "Udit Singh Chauhan" }),
    ).toHaveAttribute("href", "https://github.com/UditSinghChauhan");
    expect(footer.queryByRole("link", { name: "Design notes" })).toBeNull();
    // PORTFOLIO_URL and LINKEDIN_URL are empty until they exist.
    expect(footer.queryByRole("link", { name: "Portfolio" })).toBeNull();
    expect(footer.queryByRole("link", { name: "LinkedIn" })).toBeNull();
  });

  it("prints no date anywhere on the page", async () => {
    // The page claims to be live; "Measured 16 September 2026." and
    // "Counted on 31 October 2026" contradicted that.
    const { container } = await renderLanding();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/,
    );
    expect(text).not.toMatch(/\b20\d\d\b/);
    for (const el of container.querySelectorAll("[aria-label]")) {
      expect(el.getAttribute("aria-label")).not.toMatch(/\b20\d\d\b/);
    }
  });

  it("answers four questions in an accordion, the first open", async () => {
    await renderLanding();
    const triggers = QUESTIONS.map((item) =>
      screen.getByRole("button", { name: item.q }),
    );
    expect(triggers).toHaveLength(4);
    expect(triggers[0]).toHaveAttribute("aria-expanded", "true");
    expect(triggers[1]).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(triggers[1]);
    expect(triggers[1]).toHaveAttribute("aria-expanded", "true");
    expect(triggers[0]).toHaveAttribute("aria-expanded", "false");
  });
});

describe("acceptStats", () => {
  it("takes plausible live figures and marks them live", async () => {
    expect(
      acceptStats({
        activePostings: 4600,
        openToFreshers: 2150,
        lastSyncedAt: null,
      }),
    ).toEqual({ activePostings: 4600, openToFreshers: 2150, live: true });
  });

  it("refuses an outage dressed as data, so the committed figures stay", async () => {
    expect(acceptStats({ activePostings: 0, openToFreshers: 0 })).toBeNull();
    expect(acceptStats({ activePostings: 10, openToFreshers: 20 })).toBeNull();
    expect(acceptStats({ activePostings: "4512" })).toBeNull();
    expect(acceptStats(null)).toBeNull();
  });
});
