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

/**
 * Section 2, "Focus". As the hero scrolls away the ten ranked cards fly out
 * of the field into this card's rows, scrubbed by the scroll (flight.tsx).
 * On wide screens the section holds still while they land, with the
 * statement centred beside the list; on phones it does not stick. Every row
 * is always in the page, so without the flight (reduced motion, or no
 * script for it) the list is simply there.
 */
export function Focus() {
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
          <div className="lp-card lp-queue" inert>
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
