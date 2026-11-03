import { useRef } from "react";
import { useInView } from "framer-motion";
import { formatCount, useCountUp } from "./motion/use-count-up";
import { QUEUE_SIZE, type LandingStats } from "./use-public-stats";

/**
 * Section 3: three tall columns, each ruled on the left by a hairline, a
 * mono label at the top and a big number at the bottom. With the hero, the
 * only place the page prints a total, and the totals come only from
 * GET /api/public/stats (committed figures when it fails, with no "Live").
 */
export function Stats({ stats }: { stats: LandingStats }) {
  const ref = useRef<HTMLDListElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.4 });
  const active = useCountUp(stats.activePostings, { start: seen });
  const freshers = useCountUp(stats.openToFreshers, { start: seen });
  const ten = useCountUp(QUEUE_SIZE, { start: seen });

  const cols = [
    {
      label: "Tracked",
      n: active,
      final: stats.activePostings,
      line: "open roles",
    },
    {
      label: "Open to you",
      n: freshers,
      final: stats.openToFreshers,
      line: "open to freshers",
    },
    {
      label: "Your queue",
      n: ten,
      final: QUEUE_SIZE,
      line: "ranked each morning",
    },
  ];

  return (
    <section className="lp-stats" aria-labelledby="stats-head">
      <div className="lp-container">
        <h2 id="stats-head" className="lp-sr">
          In numbers
        </h2>
        <dl ref={ref} className="lp-stats__cols">
          {cols.map((c, i) => (
            <div key={c.label} className="lp-stat">
              <dt className="lp-mono lp-stat__label">
                {c.label}
                {i === 0 && stats.live && (
                  <span className="lp-live">
                    <span className="lp-live__dot" aria-hidden="true" />
                    Live
                  </span>
                )}
              </dt>
              <dd className="lp-stat__value">
                <span className="lp-stat__num num" aria-hidden="true">
                  {formatCount(c.n)}
                </span>
                <span className="lp-sr">
                  {formatCount(c.final)} {c.line}
                </span>
                <span className="lp-stat__line" aria-hidden="true">
                  {c.line}
                </span>
                <span className="lp-mono lp-stat__index" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
