import { QUEUE_SIZE, type LandingStats } from "./use-public-stats";

/** Indian digit grouping, as everywhere else on the page: 4,512 and 2,109. */
export const formatCount = (n: number) => n.toLocaleString("en-IN");

/**
 * Section 3: three tall columns, each ruled on the left by a hairline, a
 * mono label at the top and a big number at the bottom. With the hero, the
 * only place the page prints a total, and the totals come only from
 * GET /api/public/stats (committed figures when it fails, with no "Live").
 * The figures are printed as they are: no counting, so the live ones replace
 * the committed ones in place, in tabular figures.
 */
export function Stats({ stats }: { stats: LandingStats }) {
  const cols = [
    {
      label: "Tracked",
      n: stats.activePostings,
      line: "open roles",
    },
    {
      label: "Open to you",
      n: stats.openToFreshers,
      line: "open to freshers",
    },
    {
      label: "Your queue",
      n: QUEUE_SIZE,
      line: "ranked each morning",
    },
  ];

  return (
    <section className="lp-stats" aria-labelledby="stats-head">
      <div className="lp-container">
        <h2 id="stats-head" className="lp-sr">
          In numbers
        </h2>
        <dl className="lp-stats__cols">
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
                  {formatCount(c.n)} {c.line}
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
