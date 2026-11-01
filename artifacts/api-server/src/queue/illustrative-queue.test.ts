import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  deadlineUrgency,
  explainPriority,
  priorityContributions,
  priorityFromComponents,
  type PriorityComponents,
} from "./priority";

/**
 * The landing page shows an illustrative queue and says its scores and
 * reasons "come from the real ranking code". This keeps that sentence true:
 * if the formula or a reason string changes, regenerate the file with
 * docs/screenshots/landing-redesign/concepts/build/queue-data.ts.
 */
const file = fileURLToPath(
  new URL(
    "../../../career-radar/src/components/landing/illustrative-queue.json",
    import.meta.url,
  ),
);

type Item = {
  job: { postedDate: string };
  priority: number;
  components: PriorityComponents;
  contributions: PriorityComponents;
  duplicateCount: number;
  reasons: string[];
};
const queue = JSON.parse(readFileSync(file, "utf8")) as {
  illustrative: boolean;
  generatedAt: string;
  items: Item[];
};
const now = new Date(queue.generatedAt);

describe("landing illustrative queue", () => {
  it("is marked illustrative", () => {
    expect(queue.illustrative).toBe(true);
  });

  it.each(queue.items.map((item, i) => [i + 1, item] as const))(
    "row %i matches the scoring code",
    (_rank, item) => {
      expect(item.components.deadlineUrgency).toBe(deadlineUrgency(null, now));
      expect(item.priority).toBe(priorityFromComponents(item.components));
      expect(item.contributions).toEqual(
        priorityContributions(item.components),
      );
      expect(item.reasons).toEqual(
        explainPriority(item.components, {
          deadline: null,
          postedDate: new Date(item.job.postedDate),
          duplicateCount: item.duplicateCount,
          now,
        }),
      );
    },
  );

  it("is ordered by priority, highest first", () => {
    const priorities = queue.items.map((i) => i.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});
