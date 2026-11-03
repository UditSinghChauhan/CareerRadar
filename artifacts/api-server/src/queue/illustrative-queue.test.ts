import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  deadlineUrgency,
  priorityContributions,
  priorityFromComponents,
  type PriorityComponents,
} from "./priority";

/**
 * The landing page shows an illustrative queue and says its scores "come
 * from the real ranking code". This keeps that sentence true: if the formula
 * changes, regenerate the file with
 * docs/screenshots/landing-redesign/concepts/build/queue-data.ts.
 *
 * The reason lines are product copy written for a student, not the engine's
 * own explanation strings. They are still derived from each row's own data,
 * by `studentReasons` below, so a row can never claim a freshness, match or
 * bookmark its scores do not have.
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

const DAY = 24 * 60 * 60 * 1000;
const TRACK: Record<string, string> = {
  new_grad: "New-grad role",
  internship: "Internship",
  early_career: "Early-career role",
};

/** The two reason lines a row may show, from its own posted date and scores. */
function studentReasons(item: Item): string[] {
  const days = Math.floor(
    (now.getTime() - new Date(item.job.postedDate).getTime()) / DAY,
  );
  const posted =
    days < 1
      ? "Posted today"
      : days < 2
        ? "Posted yesterday"
        : `Posted ${days} days ago`;
  const fit =
    item.components.relevanceScore >= 100 ? "a strong match" : "a close match";
  const track = TRACK[item.job.relevanceTrack];
  if (!track) throw new Error(`no label for ${item.job.relevanceTrack}`);
  return [
    `${posted} · ${track}, ${fit}`,
    item.components.dreamCompanyBoost >= 100
      ? "At a company you bookmarked"
      : "No closing date listed, so apply early",
  ];
}

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
      expect(item.reasons).toEqual(studentReasons(item));
    },
  );

  it("keeps every reason line short enough for two lines on a phone", () => {
    for (const item of queue.items) {
      expect(item.reasons.length).toBeLessThanOrEqual(2);
      for (const line of item.reasons)
        expect(line.length).toBeLessThanOrEqual(56);
    }
  });

  it("is ordered by priority, highest first", () => {
    const priorities = queue.items.map((i) => i.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});
