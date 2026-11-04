import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The landing's layout shift. With `font-display: swap` the hero painted in
 * the local fallback, whose width differs by platform (Arial, Liberation
 * Sans, DejaVu Sans), and the lead rewrapped when Geist arrived: CLS 0.033
 * at 1440 locally and 0.069 in Lighthouse. Geist is now preloaded with the
 * HTML and never swapped in after the first paint.
 */
const css = readFileSync(
  resolve(process.cwd(), "src/styles/fonts.css"),
  "utf8",
);
const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

function faceFor(family: string): string {
  const faces = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  const face = faces.find((f) =>
    new RegExp(`font-family:\\s*"${family}";`).test(f),
  );
  if (!face) throw new Error(`no @font-face for ${family}`);
  return face;
}

describe("Geist loading", () => {
  it("never swaps after the first paint", () => {
    expect(faceFor("Geist")).toMatch(/font-display:\s*optional;/);
  });

  it("is preloaded from the HTML, so it is ready for the first paint", () => {
    const src = faceFor("Geist").match(/url\("([^"]+)"\)/)?.[1];
    expect(src).toBeTruthy();
    const preload = html.match(/<link\s[^>]*rel="preload"[^>]*>/g) ?? [];
    expect(
      preload.some(
        (l) =>
          l.includes(`href="${src}"`) &&
          l.includes('as="font"') &&
          l.includes("crossorigin"),
      ),
    ).toBe(true);
  });
});
