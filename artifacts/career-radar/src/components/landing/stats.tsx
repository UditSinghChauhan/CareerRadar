import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { EASE_OUT } from "./motion/tokens";
import { usePauseOffscreen } from "./motion/use-pause-offscreen";
import { QUEUE_SIZE, type LandingStats } from "./use-public-stats";

/** Indian digit grouping, as everywhere else on the page: 4,512 and 2,109. */
export const formatCount = (n: number) => n.toLocaleString("en-IN");

/** The count-up's length, in seconds; a later live figure eases in faster. */
export const COUNT_S = 1.2;
const RECOUNT_S = 0.6;

/**
 * A big figure that counts up from zero once, when half of its column is
 * in view, in tabular figures so its width steps only when a digit is
 * added. Text is written by a framer-motion value, not React state. If the
 * live figure arrives later it eases from the shown one to the new one.
 * Under reduced motion it is printed as it is.
 */
function CountUp({ n }: { n: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = Boolean(useReducedMotion());
  const seen = useInView(ref, { once: true, amount: 0.5 });
  const value = useMotionValue(reduced ? n : 0);
  const text = useTransform(value, (v) => formatCount(Math.round(v)));
  const counted = useRef(false);
  useEffect(() => {
    if (reduced) {
      value.set(n);
      return;
    }
    if (!seen) return;
    const controls = animate(value, n, {
      duration: counted.current ? RECOUNT_S : COUNT_S,
      ease: EASE_OUT,
    });
    counted.current = true;
    return () => controls.stop();
  }, [n, seen, reduced, value]);
  return (
    <motion.span ref={ref} className="lp-stat__num num" aria-hidden="true">
      {text}
    </motion.span>
  );
}

/**
 * Section 3: three tall columns, each ruled on the left by a hairline, a
 * mono label at the top and a big number at the bottom. With the hero, the
 * only place the page prints a total, and the totals come only from
 * GET /api/public/stats (committed figures when it fails, with no "Live").
 * Each figure counts up once as it comes into view (CountUp); the screen
 * reader sentence beside it always carries the final figure. The "Live"
 * dot breathes while the band is on screen (landing.css).
 */
export function Stats({ stats }: { stats: LandingStats }) {
  const ref = useRef<HTMLElement>(null);
  usePauseOffscreen(ref);
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
    <section className="lp-stats" aria-labelledby="stats-head" ref={ref}>
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
                <CountUp n={c.n} />
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
