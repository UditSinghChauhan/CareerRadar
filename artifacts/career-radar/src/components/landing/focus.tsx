import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Monogram, RankTag } from "./role-card";
import { RANKED, type SampleRole } from "./sample-roles";
import { focusFor, setFocused, useFocused } from "./focus-store";
import { Statement } from "./statement";

/** Rows shown in full; the rest of the ten sit below as one-line rows. */
const FULL_ROWS = 4;

const travel = { type: "spring", duration: 0.9, bounce: 0.12 } as const;

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

function CompactRow({ role }: { role: SampleRole }) {
  return (
    <div className="lp-qrow lp-qrow--compact">
      <RankTag rank={role.rank} />
      <Monogram role={role} size="sm" />
      <p className="lp-qrow__title">
        {role.title}
        <span className="lp-qrow__co"> · {role.company}</span>
      </p>
      <span className="lp-score" aria-label={`Score ${role.score} of 100`}>
        {role.score}
      </span>
    </div>
  );
}

/**
 * Section 2, "Focus". As the hero scrolls away the ten ranked cards leave
 * the field and land, by shared layout animation, in one "Today's ten" card.
 * On wide screens the section holds still for a short stretch (under 120vh
 * of sticky); on phones it does not stick. Under reduced motion the ten are
 * already in the card.
 */
export function Focus() {
  const slotRef = useRef<HTMLDivElement>(null);
  const reduced = Boolean(useReducedMotion());
  const focused = useFocused();
  const shown = focused || reduced;

  useEffect(() => {
    const el = slotRef.current;
    if (!el || reduced) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      setFocused(focusFor(el.getBoundingClientRect(), window.innerHeight));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [reduced]);

  return (
    <section className="lp-focus" aria-labelledby="focus-head">
      <div className="lp-focus__stick">
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
          <div ref={slotRef} className="lp-card lp-queue" inert>
            <div className="lp-queue__head">
              <p className="lp-queue__title">Today’s ten</p>
              <p className="lp-mono">0 of 10 applied</p>
            </div>
            <ol className="lp-queue__list">
              {RANKED.map((role, i) => (
                <li
                  key={role.id}
                  className={
                    i < FULL_ROWS ? "lp-qslot" : "lp-qslot lp-qslot--compact"
                  }
                >
                  {shown &&
                    (reduced ? (
                      i < FULL_ROWS ? (
                        <FullRow role={role} />
                      ) : (
                        <CompactRow role={role} />
                      )
                    ) : (
                      <motion.div
                        layoutId={`role-${role.rank}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ ...travel, delay: i * 0.03 }}
                        className="lp-qslot__in"
                      >
                        {i < FULL_ROWS ? (
                          <FullRow role={role} />
                        ) : (
                          <CompactRow role={role} />
                        )}
                      </motion.div>
                    ))}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
