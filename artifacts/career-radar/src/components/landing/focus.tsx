import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { DURATION, EASE_OUT, REVEAL_FROM, REVEAL_TO } from "./motion/tokens";
import { Monogram, RankTag } from "./role-card";
import { RANKED, type SampleRole } from "./sample-roles";
import { Statement } from "./statement";

/** Rows shown in full; the rest of the ten sit below as one-line rows. */
const FULL_ROWS = 4;

function FullRow({ role }: { role: SampleRole }) {
  return (
    <div className="lp-qrow">
      <RankTag rank={role.rank} />
      <Monogram role={role} />
      <div className="lp-qrow__body">
        <p className="lp-qrow__title">{role.title}</p>
        <p className="lp-qrow__meta">
          {role.company} · {role.city}
        </p>
        <ul className="lp-chips" aria-label="Why it is here">
          {role.reasons.map((r) => (
            <li key={r} className="lp-chip">
              {r}
            </li>
          ))}
        </ul>
      </div>
      <div className="lp-qrow__end">
        <span className="lp-score" aria-label={`Score ${role.score} of 100`}>
          {role.score}
        </span>
        {role.rank === 1 && (
          <span className="lp-btn lp-btn--sm" aria-hidden="true">
            Apply
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * A one-line row. On hover (desktop) its title gives way, in place, to its
 * reason chips, so every one of the ten can say why it is there without
 * the list changing height.
 */
function CompactRow({ role }: { role: SampleRole }) {
  return (
    <div className="lp-qrow lp-qrow--compact">
      <RankTag rank={role.rank} />
      <Monogram role={role} size="sm" />
      <div className="lp-qrow__swap">
        <p className="lp-qrow__title">
          {role.title}
          <span className="lp-qrow__co"> · {role.company}</span>
        </p>
        <ul className="lp-chips lp-qrow__reasons">
          {role.reasons.map((r) => (
            <li key={r} className="lp-chip">
              {r}
            </li>
          ))}
        </ul>
      </div>
      <span className="lp-score" aria-label={`Score ${role.score} of 100`}>
        {role.score}
      </span>
    </div>
  );
}

/** Row reveal: each rises 8px and fades in over 400ms, 45ms after the one before. */
const ROW_S = 0.4;
const ROW_STAGGER = 0.045;
const ROW_RISE = 8;

/**
 * Section 2, "Focus". A plain two-column section: the statement, centred
 * beside "Today's ten" by the grid (no sticky stage, no script positions
 * anything). When a quarter of the card is in view it plays its reveal once:
 * the card fades in and rises 12px over 500ms, starting with its first row
 * so its frame is never seen empty; the ten rows rise in one after another;
 * once the last has landed, rank 1's lime tag pulses once (landing.css,
 * .lp-queue.is-in). Under reduced motion everything is simply there.
 *
 * The card is a picture of the product, hidden from assistive tech (the
 * section's heading and caption name it) but not inert, so its rows can
 * answer the pointer: each lifts on hover, and a one-line row shows its
 * reasons.
 */
export function Focus() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = Boolean(useReducedMotion());
  const seen = useInView(ref, { once: true, amount: 0.25 });
  const shown = reduced || seen;
  const from = reduced ? false : "hidden";
  const to = shown ? "shown" : "hidden";
  return (
    <section className="lp-focus" aria-labelledby="focus-head">
      <div className="lp-container lp-focus__grid">
        <div className="lp-focus__text">
          <h2 id="focus-head" className="lp-sr">
            Today’s ten
          </h2>
          <Statement
            lead="Ten, not ten thousand."
            rest="Ranked by fit, how soon it closes, how fresh it is and the companies you care about."
          />
          <p className="lp-caption">
            Sample roles. Ranking from the real scoring code.
          </p>
        </div>
        <motion.div
          ref={ref}
          className={shown ? "lp-card lp-queue is-in" : "lp-card lp-queue"}
          aria-hidden="true"
          initial={from}
          animate={to}
          variants={{ hidden: REVEAL_FROM, shown: REVEAL_TO }}
          transition={{ duration: DURATION.reveal, ease: EASE_OUT }}
        >
          <div className="lp-queue__head">
            <p className="lp-queue__title">Today’s ten</p>
            <p className="lp-mono">0 of 10 applied</p>
          </div>
          <ol className="lp-queue__list">
            {RANKED.map((role, i) => (
              <motion.li
                key={role.id}
                initial={from}
                animate={to}
                variants={{
                  hidden: { opacity: 0, y: ROW_RISE },
                  shown: { opacity: 1, y: 0 },
                }}
                transition={{
                  duration: ROW_S,
                  ease: EASE_OUT,
                  delay: i * ROW_STAGGER,
                }}
              >
                {i < FULL_ROWS ? (
                  <FullRow role={role} />
                ) : (
                  <CompactRow role={role} />
                )}
              </motion.li>
            ))}
          </ol>
        </motion.div>
      </div>
    </section>
  );
}
