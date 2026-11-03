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
 * The landing page shows sample roles and says their ranking comes "from the
 * real scoring code". This keeps that sentence true: every score and every
 * reason in the file must be what priority.ts produces for that row. If the
 * formula or the reasons change, regenerate the file's scores and reasons
 * with priorityFromComponents and explainPriority.
 */
const file = fileURLToPath(
  new URL(
    "../../../career-radar/src/components/landing/illustrative-queue.json",
    import.meta.url,
  ),
);

type Item = {
  job: { postedDate: string; relevanceTrack: string };
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
          track: item.job.relevanceTrack,
          now,
        }),
      );
    },
  );

  it("gives every row at least one reason and at most three", () => {
    for (const item of queue.items) {
      expect(item.reasons.length).toBeGreaterThan(0);
      expect(item.reasons.length).toBeLessThanOrEqual(3);
    }
  });

  it("is ordered by priority, highest first", () => {
    const priorities = queue.items.map((i) => i.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});
