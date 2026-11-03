import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyJob } from "./classifier";

/**
 * The landing's "No model decides what you see" tile animates the classifier
 * deciding three titles. This keeps every verdict it shows true: if the
 * rules change, the tile's data must change with them.
 */
const file = fileURLToPath(
  new URL(
    "../../../career-radar/src/components/landing/classifier-demo.json",
    import.meta.url,
  ),
);
const demo = JSON.parse(readFileSync(file, "utf8")) as {
  titles: Array<{
    title: string;
    track: string;
    isFresherEligible: boolean;
  }>;
};

describe("landing classifier demo", () => {
  it.each(demo.titles.map((t) => [t.title, t] as const))(
    "%s gets the verdict the tile shows",
    (title, shown) => {
      const result = classifyJob({ title, jobType: "full_time" });
      expect(result.track).toBe(shown.track);
      expect(result.isFresherEligible).toBe(shown.isFresherEligible);
    },
  );
});
