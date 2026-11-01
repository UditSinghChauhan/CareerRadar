import { forwardRef } from "react";
import { ILLUSTRATIVE_QUEUE } from "./landing-queue";

/**
 * The daily-queue priority weights, as set in
 * artifacts/api-server/src/queue/priority.ts (PRIORITY_WEIGHTS). Shown on the
 * page so the claim "you can check the ranking" is itself checkable.
 */
export const PRIORITY_COMPONENTS = [
  { key: "relevanceScore", name: "Relevance", weight: 40 },
  { key: "deadlineUrgency", name: "Deadline", weight: 30 },
  { key: "freshness", name: "Freshness", weight: 20 },
  { key: "dreamCompanyBoost", name: "Dream company", weight: 10 },
] as const;

/** What each term means for this row, in a student's words. */
const NOTES: Record<(typeof PRIORITY_COMPONENTS)[number]["key"], string> = {
  relevanceScore: "Title and level fit a fresher",
  deadlineUrgency: "No closing date listed, so every row scores the same",
  freshness: "Posted in the last two days",
  dreamCompanyBoost: "A company you bookmarked",
};

/**
 * Why row 1 ranks first: its four weighted scores as bars, and its reasons.
 * `fill` (0 to 1) grows the bars, so the pinned chapter can scrub them and
 * the bottom sheet can play them. Numbers come from the illustrative row,
 * which illustrative-queue.test.ts checks against the real scoring code.
 */
export const ExplainCard = forwardRef<
  HTMLDivElement,
  { fill?: number; className?: string; headingId?: string }
>(function ExplainCard({ fill = 1, className, headingId }, ref) {
  const item = ILLUSTRATIVE_QUEUE.items[0];
  return (
    <div
      ref={ref}
      className={["lp-explain", className].filter(Boolean).join(" ")}
    >
      <div className="lp-explain__head">
        <span className="lp-explain__rank" aria-hidden="true">
          1
        </span>
        <div className="lp-explain__title">
          <p id={headingId} className="lp-explain__job">
            {item.job.title}
          </p>
          <p className="lp-explain__co">
            {item.job.company?.name} · {item.job.location}
          </p>
        </div>
        <p className="lp-explain__total">
          <span className="num">{item.priority}</span>
          <span className="lp-explain__unit">priority</span>
        </p>
      </div>
      <ul className="lp-explain__bars">
        {PRIORITY_COMPONENTS.map((c, i) => {
          const score = item.components[c.key];
          const share = item.contributions[c.key];
          // Each bar starts a beat after the one above it.
          const k = Math.min(1, Math.max(0, fill * 1.6 - i * 0.2));
          return (
            <li key={c.key}>
              <div className="lp-explain__row">
                <span className="lp-explain__name">
                  {c.name} <span className="lp-explain__w">{c.weight}%</span>
                </span>
                <span className="lp-explain__pts num">+{share.toFixed(1)}</span>
              </div>
              <div
                className="lp-explain__track"
                role="img"
                aria-label={`${c.name}: ${score} out of 100, adding ${share.toFixed(1)} points`}
              >
                <div
                  className="lp-explain__fill"
                  style={{ transform: `scaleX(${(score / 100) * k})` }}
                />
              </div>
              <p className="lp-explain__note">{NOTES[c.key]}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
