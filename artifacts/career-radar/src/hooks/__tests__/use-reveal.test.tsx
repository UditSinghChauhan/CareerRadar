import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReveal } from "../use-reveal";

function Section() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="section">
      Content
    </div>
  );
}

/** Captures the observer callback so a test can play an intersection. */
function stubIntersectionObserver() {
  let fire: (isIntersecting: boolean) => void = () => {};
  const disconnect = vi.fn();
  class FakeObserver {
    constructor(cb: IntersectionObserverCallback) {
      fire = (isIntersecting) =>
        cb(
          [{ isIntersecting } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
    }
    observe() {}
    disconnect = disconnect;
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return { fire: (v: boolean) => fire(v), disconnect };
}

describe("useReveal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never hides content when the browser cannot observe it", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Section />);
    expect(screen.getByTestId("section")).not.toHaveAttribute("data-reveal");
  });

  it("holds the section until it scrolls into view, then shows it once", () => {
    const io = stubIntersectionObserver();
    render(<Section />);
    const el = screen.getByTestId("section");
    expect(el).toHaveAttribute("data-reveal", "pending");

    act(() => io.fire(false));
    expect(el).toHaveAttribute("data-reveal", "pending");

    act(() => io.fire(true));
    expect(el).toHaveAttribute("data-reveal", "shown");
    expect(io.disconnect).toHaveBeenCalled();
  });
});
