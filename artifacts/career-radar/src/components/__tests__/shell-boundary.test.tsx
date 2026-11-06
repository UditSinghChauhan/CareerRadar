import { lazy } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShellBoundary } from "../shell-skeleton";

// The app shell's code arrives in its own chunk. Until it does, the screen
// shows the shell's skeleton: it used to show nothing at all.
describe("ShellBoundary", () => {
  it("shows a skeleton of the shell, not a blank screen, while the shell loads", () => {
    const Never = lazy(() => new Promise<{ default: () => null }>(() => {}));
    render(
      <ShellBoundary>
        <Never />
      </ShellBoundary>,
    );
    expect(screen.getByLabelText("Loading")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
