import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BOARD_STAGES } from "@/components/applications/status";
import { Features } from "../features";

describe("the landing's One board card", () => {
  // The landing showed five columns ("Online assessment", no Closed) for a
  // release after the app's board became six stages. Read from the DOM, so a
  // second hard-coded list on the landing fails here.
  it("shows the app's board stages, with the same names and in the same order", () => {
    const { container } = render(<Features />);
    const board = container.querySelector<HTMLElement>(".lp-board")!;
    const cols = [...board.querySelectorAll<HTMLElement>(".lp-board__col")];

    expect(cols.map((c) => c.dataset.stage)).toEqual(
      BOARD_STAGES.map((s) => s.key),
    );
    expect(
      cols.map((c) => c.querySelector(".lp-board__head > span")?.textContent),
    ).toEqual(BOARD_STAGES.map((s) => s.label));
    // The CSS grid takes its column count from the same list.
    expect(board.style.getPropertyValue("--lp-board-cols")).toBe(
      String(BOARD_STAGES.length),
    );
  });
});
