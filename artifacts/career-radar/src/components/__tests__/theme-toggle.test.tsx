import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "../theme-toggle";

/** jsdom has no matchMedia; this stands in for the OS colour-scheme setting. */
function stubSystemScheme(prefersDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query === "(prefers-color-scheme: dark)" && prefersDark,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

function renderToggle() {
  // The same props App.tsx passes, so the test exercises the real defaults.
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

const html = () => document.documentElement;

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    html().className = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows a dark system setting before the user chooses", () => {
    stubSystemScheme(true);
    renderToggle();

    expect(html()).toHaveClass("dark");
    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument();
  });

  it("falls back to light when the system has no dark preference", () => {
    stubSystemScheme(false);
    renderToggle();

    expect(html()).not.toHaveClass("dark");
    expect(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument();
  });

  it("switches theme on click and persists the choice", async () => {
    stubSystemScheme(false);
    renderToggle();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );
    expect(html()).toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    await user.click(
      screen.getByRole("button", { name: "Switch to light theme" }),
    );
    expect(html()).not.toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("keeps a stored choice over the system setting", () => {
    localStorage.setItem("theme", "light");
    stubSystemScheme(true);
    renderToggle();

    expect(html()).not.toHaveClass("dark");
  });
});
