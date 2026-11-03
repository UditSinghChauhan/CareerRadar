import { describe, expect, it } from "vitest";
import { focusFor } from "../focus-store";

/** The card is 700px tall in a 900px viewport. */
const at = (top: number) => focusFor({ top, height: 700 }, 900);

describe("focusFor", () => {
  it("brings the ten into the card once 30% of it is in view", () => {
    expect(at(900)).toBe(false);
    expect(at(700)).toBe(false);
    expect(at(600)).toBe(true);
    expect(at(0)).toBe(true);
  });

  it("keeps them in the card after it has scrolled past", () => {
    expect(at(-650)).toBe(true);
    expect(at(-5000)).toBe(true);
  });

  it("sends them back to the field after a jump to the top, past every threshold", () => {
    // From the page's end straight to the hero: the card is far below the
    // fold. An observer sees no threshold crossed here; this must not care.
    expect(at(-5000)).toBe(true);
    expect(at(1600)).toBe(false);
  });
});
