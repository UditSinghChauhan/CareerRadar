import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage } from "../landing";

/**
 * index.html carries the landing's navigation and hero as static markup so
 * the headline paints before the JavaScript runs. React then replaces it.
 * If the two drift, a visitor sees one hero swap for another: this keeps
 * their text, links and structure the same.
 */
// Vitest runs from the package root, where index.html lives.
const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const template = html.match(
  /<template\s+id="lp-pre"\s*>([\s\S]*?)<\/template>/,
)?.[1];

function shape(root: ParentNode) {
  const pick = (sel: string) =>
    [...root.querySelectorAll(sel)].map((el) =>
      // HTML collapses whitespace, so line breaks in index.html are spaces.
      el.textContent?.replace(/\s+/g, " ").trim(),
    );
  return {
    h1: pick(".lp-hero h1"),
    lead: pick(".lp-hero .lp-lead"),
    nav: pick(".lp-nav a"),
    links: [...root.querySelectorAll(".lp-nav a, .lp-hero a")].map((a) =>
      a.getAttribute("href"),
    ),
    // The radar's own children are drawn by React after it mounts.
    classes: [...root.querySelectorAll(".lp-hero *")]
      .filter((el) => !el.closest(".lp-hero__object > *"))
      .map((el) => el.getAttribute("class")),
  };
}

describe("pre-rendered hero", () => {
  it("exists in index.html", () => {
    expect(template).toBeTruthy();
  });

  it("matches what React renders", () => {
    const { container } = render(<LandingPage />);
    const pre = document.createElement("div");
    pre.innerHTML = template ?? "";
    expect(shape(pre)).toEqual(shape(container));
  });
});
