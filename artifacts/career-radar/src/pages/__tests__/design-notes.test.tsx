import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DesignNotesPage } from "../design-notes";

describe("DesignNotesPage", () => {
  it("opens as a standalone case study: summary, role, timeline and stack", () => {
    render(<DesignNotesPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "CareerRadar, a case study",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Product design, frontend and backend, solo"),
    ).toBeInTheDocument();
    expect(screen.getByText("July to November 2026")).toBeInTheDocument();
    expect(screen.getByText(/React 19, Vite, Express 5/)).toBeInTheDocument();
  });

  it("covers every part of the brief", () => {
    render(<DesignNotesPage />);
    for (const name of [
      "Problem and users",
      "Constraints",
      "Three concepts, one synthesis",
      "Before and after",
      "Tokens",
      "Motion principles",
      "Accessibility decisions",
      "Next",
    ]) {
      expect(
        screen.getByRole("heading", { level: 2, name }),
      ).toBeInTheDocument();
    }
  });

  it("gives every figure alt text and a reserved box", () => {
    const { container } = render(<DesignNotesPage />);
    const imgs = [...container.querySelectorAll("figure img")];
    expect(imgs.length).toBe(7);
    for (const img of imgs) {
      expect(img.getAttribute("alt")?.length).toBeGreaterThan(20);
      expect(img).toHaveAttribute("width");
      expect(img).toHaveAttribute("height");
    }
  });
});
