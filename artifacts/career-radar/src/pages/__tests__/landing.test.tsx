import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { LandingPage } from "../landing";
import { QUESTIONS } from "@/components/landing/faq";
import { NAV_SECTIONS } from "@/components/landing/nav";
import { PARTS } from "@/components/landing/how";
import { RANKED } from "@/components/landing/sample-roles";
import { SOURCE_NAMES } from "@/components/landing/sources";
import {
  COMMITTED_STATS,
  acceptStats,
  resetPublicStats,
} from "@/components/landing/use-public-stats";
import illustrative from "@/components/landing/illustrative-queue.json";

/** Renders the landing and waits for the sections it mounts after the hero. */
async function renderLanding() {
  const utils = render(<LandingPage />);
  // The first render imports the below-fold chunk; under a loaded runner
  // that alone can pass the default 1s wait.
  await screen.findByRole("heading", { name: "Questions" }, { timeout: 5000 });
  return utils;
}

const fmt = (n: number) => n.toLocaleString("en-IN");

afterEach(() => {
  vi.unstubAllGlobals();
  resetPublicStats();
});

describe("LandingPage", () => {
  it("has exactly one h1, stating the outcome", async () => {
    await renderLanding();
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "Ten roles worth applying to, every morning.",
    );
  });

  it("has seven sections in the planned order", async () => {
    const { container } = await renderLanding();
    const ids = [...container.querySelectorAll("main > section")].map((s) =>
      s.getAttribute("aria-labelledby"),
    );
    expect(ids).toEqual([
      "hero-head",
      "focus-head",
      "stats-head",
      "how-head",
      "features-head",
      "faq-head",
      "band-head",
    ]);
  });

  it("sends every Get started action to sign-up", async () => {
    await renderLanding();
    const links = screen.getAllByRole("link", { name: "Get started" });
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toHaveAttribute("href", "/sign-up");
  });

  it("links the nav to its sections, and offers sign-in, with no theme toggle or design notes", async () => {
    const { container } = await renderLanding();
    const header = within(screen.getByRole("banner"));
    for (const s of NAV_SECTIONS) {
      expect(header.getByRole("link", { name: s.label })).toHaveAttribute(
        "href",
        s.href,
      );
      expect(container.querySelector(s.href)).not.toBeNull();
    }
    expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(screen.queryByRole("button", { name: /theme/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /design notes/i })).toBeNull();
  });

  it("credits the designer, links the source and the licence, with no empty portfolio links", async () => {
    await renderLanding();
    const footer = within(screen.getByRole("contentinfo"));
    expect(
      footer.getByRole("link", { name: "Udit Singh Chauhan" }),
    ).toHaveAttribute("href", "https://github.com/UditSinghChauhan");
    expect(
      footer.getByRole("link", { name: "Source on GitHub" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/UditSinghChauhan/CareerRadar",
    );
    expect(footer.getByText("MIT licence")).toBeInTheDocument();
    expect(footer.queryByRole("link", { name: "Portfolio" })).toBeNull();
    expect(footer.queryByRole("link", { name: "LinkedIn" })).toBeNull();
  });

  it("prints no date, no test count and no engine copy", async () => {
    const { container } = await renderLanding();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/,
    );
    expect(text).not.toMatch(/\b20\d\d\b/);
    expect(text).not.toMatch(/tests? passing|backend tests/i);
    expect(text).not.toMatch(/No model decides|never scraped|not helping/i);
    for (const el of container.querySelectorAll("[aria-label]")) {
      expect(el.getAttribute("aria-label")).not.toMatch(/\b20\d\d\b/);
    }
  });

  it("labels the sample roles and shows the ten with their real reasons and whole scores", async () => {
    const { container } = await renderLanding();
    expect(
      screen.getByText("Sample roles. Ranking from the real scoring code."),
    ).toBeInTheDocument();
    const queue = container.querySelector(".lp-queue")!;
    expect(queue).toHaveAttribute("inert");
    // jsdom has reduced motion off, so the ten arrive when the card is seen;
    // the hero holds them until then.
    expect(RANKED).toHaveLength(10);
    RANKED.forEach((role, i) => {
      const row = illustrative.items[i];
      expect(role.reasons).toEqual(row.reasons);
      expect(role.score).toBe(Math.round(row.priority));
    });
    expect(container.textContent).not.toMatch(/\b\d+\.\d\b/);
  });

  it("explains the score with the four weights of the real formula", async () => {
    await renderLanding();
    expect(PARTS.reduce((sum, p) => sum + p.weight, 0)).toBe(100);
    for (const p of PARTS)
      expect(screen.getAllByText(p.name).length).toBeGreaterThan(0);
  });

  it("names every source once, as text", async () => {
    await renderLanding();
    for (const name of SOURCE_NAMES) {
      expect(
        within(document.querySelector(".lp-sources")! as HTMLElement).getByText(
          name,
        ),
      ).toBeInTheDocument();
    }
  });

  it("answers five questions in an accordion, the first open", async () => {
    await renderLanding();
    const triggers = QUESTIONS.map((item) =>
      screen.getByRole("button", { name: item.q }),
    );
    expect(triggers).toHaveLength(5);
    expect(triggers[0]).toHaveAttribute("aria-expanded", "true");
    expect(triggers[1]).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(triggers[1]);
    expect(triggers[1]).toHaveAttribute("aria-expanded", "true");
    expect(triggers[0]).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on the dark band with an icon-only pause control", async () => {
    await renderLanding();
    const band = screen
      .getByRole("heading", {
        name: "Tomorrow’s ten are already being ranked.",
      })
      .closest("section")!;
    const pause = within(band).getByRole("button", {
      name: "Pause the radar sweep",
    });
    expect(pause).toHaveTextContent("");
    expect(pause).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(pause);
    expect(pause).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/Pause the sweep/)).toBeNull();
  });
});

describe("live counts", () => {
  it("shows the live figures and one Live mark when the API answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          activePostings: 6100,
          openToFreshers: 3150,
          lastSyncedAt: "2026-11-01T00:00:00.000Z",
        }),
      ),
    );
    resetPublicStats();
    await renderLanding();
    expect(await screen.findAllByText("Live")).toHaveLength(1);
    expect(
      await screen.findByText(`${fmt(6100)} open roles`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${fmt(3150)} open to freshers`),
    ).toBeInTheDocument();
  });

  it("keeps the committed figures, without Live, when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    resetPublicStats();
    await renderLanding();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Live")).toBeNull();
    expect(
      screen.getByText(`${fmt(COMMITTED_STATS.activePostings)} open roles`),
    ).toBeInTheDocument();
  });

  it("swaps the live figures in when a sleeping API wakes", async () => {
    // A sleeping API: the first request gets the host's wake-up page (not
    // JSON) or runs out of time; the second, once it is awake, answers.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<html>waking up</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          activePostings: 6100,
          openToFreshers: 3150,
          lastSyncedAt: "2026-11-01T00:00:00.000Z",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    resetPublicStats();
    await renderLanding();
    expect(await screen.findAllByText("Live")).toHaveLength(1);
    expect(
      await screen.findByText(`${fmt(6100)} open roles`),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("prints each total in one place only, so no two can disagree", async () => {
    const { container } = await renderLanding();
    const text = container.textContent ?? "";
    for (const n of Object.values(COMMITTED_STATS)) {
      // The stats band's sentence. Its visible numeral counts up from zero
      // once the band is in view, which jsdom never reports.
      expect(text.split(fmt(n)).length - 1).toBe(1);
    }
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
