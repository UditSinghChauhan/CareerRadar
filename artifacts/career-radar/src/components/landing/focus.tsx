import { useEffect, useRef } from "react";
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

/** The fixed bar's height: the top of what a visitor can see. */
const NAV_H = 64;

/**
 * Keeps the statement centred on the part of the list that is on screen,
 * within the list's own box, where the two stand side by side (1024px and
 * wider). As the list rises into view the statement stays level with it
 * instead of sitting at the list's centre below the fold, so there is never
 * an empty band above it, and once the whole list is on screen the two are
 * centred on each other. Transform only, once per frame; without script,
 * the stylesheet centres it on the list.
 */
function useCentredBeside() {
  const textRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const text = textRef.current;
    const list = listRef.current;
    if (!text || !list) return;
    let frame = 0;
    let offset = 0;
    const update = () => {
      frame = 0;
      const wide =
        window.matchMedia?.("(min-width: 1024px)").matches ??
        window.innerWidth >= 1024;
      let next = 0;
      if (wide) {
        const q = list.getBoundingClientRect();
        const b = text.getBoundingClientRect();
        const natural = (b.top + b.bottom) / 2 - offset;
        const top = Math.max(q.top, NAV_H);
        const bottom = Math.min(q.bottom, window.innerHeight);
        const half = b.height / 2;
        const seen = bottom > top ? (top + bottom) / 2 : (q.top + q.bottom) / 2;
        const target = Math.min(
          Math.max(seen, q.top + half),
          Math.max(q.top + half, q.bottom - half),
        );
        next = Math.round(target - natural);
      }
      if (next === offset) return;
      offset = next;
      text.style.transform = next ? `translate3d(0, ${next}px, 0)` : "";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return { textRef, listRef };
}

/**
 * Section 2, "Focus". As the hero scrolls away the ten ranked cards fly out
 * of the field into this card's rows, scrubbed by the scroll (flight.tsx).
 * On wide screens the section holds still while they land, with the
 * statement kept centred beside the part of the list on screen
 * (useCentredBeside); on phones it does not stick. The card's frame is its own layer
 * so the flight can show it with the first row. Every row is always in the
 * page, so without the flight (reduced motion, or no script for it) the
 * list is simply there.
 */
export function Focus() {
  const { textRef, listRef } = useCentredBeside();
  return (
    <section className="lp-focus" aria-labelledby="focus-head">
      <div className="lp-focus__stick">
        <div className="lp-container lp-focus__grid">
          <div className="lp-focus__text" ref={textRef}>
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
          <div className="lp-queue" inert ref={listRef}>
            <div className="lp-card lp-queue__frame" aria-hidden="true" />
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
                  <div className="lp-qslot__in" data-fly-dst={role.rank}>
                    {i < FULL_ROWS ? (
                      <FullRow role={role} />
                    ) : (
                      <CompactRow role={role} />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
