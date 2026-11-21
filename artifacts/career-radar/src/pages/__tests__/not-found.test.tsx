import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import NotFound from "../not-found";

describe("NotFound page", () => {
  it("speaks to a visitor, not a developer", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("heading", { name: "This page isn’t on the radar." }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("router");
  });

  it("offers the way home and the demo", () => {
    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("link", { name: "Explore the demo" }),
    ).toHaveAttribute("href", "/demo");
  });
});
