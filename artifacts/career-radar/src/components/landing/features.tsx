import { Bell, Bookmark, BookmarkCheck } from "lucide-react";
import { Monogram } from "./role-card";
import { RANKED, type SampleRole } from "./sample-roles";
import { Reveal } from "./motion/reveal";
import { SOURCE_NAMES } from "./sources";
import captures from "./captures.json";

/*
 * Every fragment here is still: it shows the product's state, and the card
 * it sits in rises in with the page's one reveal (DESIGN.md, Motion).
 */

/** The app's board columns, named as the board's statuses group them. */
const COLUMNS = [
  "Saved",
  "Applied",
  "Online assessment",
  "Interview",
  "Offer",
] as const;
type Column = (typeof COLUMNS)[number];

/** A little of what a real board carries: a referral, an interview day. */
const BOARD: Array<{ role: SampleRole; col: Column; note?: string }> = [
  { role: RANKED[4], col: "Saved" },
  { role: RANKED[8], col: "Saved" },
  { role: RANKED[5], col: "Applied", note: "Referral" },
  { role: RANKED[1], col: "Online assessment" },
  { role: RANKED[2], col: "Online assessment" },
  { role: RANKED[6], col: "Interview", note: "Interview on Thursday" },
  { role: RANKED[9], col: "Offer" },
];

function BoardCard({ role, note }: { role: SampleRole; note?: string }) {
  return (
    <div className="lp-bcard">
      <Monogram role={role} size="sm" />
      <div>
        <p className="lp-bcard__title">{role.title}</p>
        <p className="lp-bcard__meta">{role.company}</p>
        {note && <p className="lp-bcard__note">{note}</p>}
      </div>
    </div>
  );
}

function Board() {
  return (
    <div className="lp-board" inert>
      {COLUMNS.map((col) => {
        const cards = BOARD.filter((b) => b.col === col);
        return (
          <div key={col} className="lp-board__col">
            <p className="lp-board__head">
              <span>{col}</span>
              <span className="lp-mono">{cards.length}</span>
            </p>
            <div className="lp-board__cards">
              {cards.map(({ role, note }) => (
                <BoardCard key={role.id} role={role} note={note} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Reminder() {
  const role = RANKED[1];
  return (
    <div className="lp-remind" inert>
      <div className="lp-toast" role="presentation">
        <span className="lp-toast__icon">
          <Bell aria-hidden="true" />
        </span>
        <div>
          <p className="lp-toast__title">Closes within 24 hours</p>
          <p className="lp-toast__body">
            {role.title} at {role.company} closes within 24 hours. You have not
            applied yet.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Three rows; bookmarking a company's role adds 10 to its score and lifts it. */
const DREAM_ROWS = [RANKED[1], RANKED[2], RANKED[3]];
const DREAM_ID = RANKED[3].id;

function Dream() {
  // The dream-company part of the score is 100 x 10%: ten points, enough to
  // lift the bookmarked role to the top.
  const score = (r: SampleRole) => r.score + (r.id === DREAM_ID ? 10 : 0);
  const rows = [...DREAM_ROWS].sort((a, b) => score(b) - score(a));
  return (
    <div className="lp-dream" inert>
      {rows.map((r) => {
        const starred = r.id === DREAM_ID;
        return (
          <div key={r.id} className="lp-dream__row">
            <Monogram role={r} size="sm" />
            <div className="lp-dream__text">
              <p className="lp-bcard__title">{r.title}</p>
              <p className="lp-bcard__meta">{r.company}</p>
            </div>
            <span className="lp-score">{score(r)}</span>
            <span
              className={starred ? "lp-dream__mark is-on" : "lp-dream__mark"}
            >
              {starred ? (
                <BookmarkCheck aria-hidden="true" />
              ) : (
                <Bookmark aria-hidden="true" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Today's queue from the real app, cropped to the part that matters and
 * shown large enough to read: the crops are captured so the app's smallest
 * text lands at 14px or more here. Its foot fades out through a mask, so
 * the crop never ends on a cut row. Enters with the page's reveal.
 */
function Capture() {
  const { queue, "queue-sm": small } = captures;
  return (
    <Reveal as="figure" className="lp-browser lp-browser--crop">
      <div className="lp-browser__bar" aria-hidden="true">
        <span className="lp-browser__url">
          careerradar-34ec.onrender.com/dashboard
        </span>
      </div>
      <picture>
        {/* Each source carries its own size, so the phone crop reserves its
            own height and nothing shifts when it loads. */}
        <source
          media="(max-width: 639px)"
          srcSet={small.avif}
          type="image/avif"
          width={small.width}
          height={small.height}
        />
        <source
          media="(max-width: 639px)"
          srcSet={small.webp}
          type="image/webp"
          width={small.width}
          height={small.height}
        />
        <source srcSet={queue.avif} type="image/avif" />
        <img
          src={queue.webp}
          width={queue.width}
          height={queue.height}
          alt="Today's ten in the real CareerRadar app: ranked roles, each with its rank, score, short reasons and an Apply button, and the day's progress."
          loading="lazy"
          decoding="async"
          style={{ backgroundImage: `url(${queue.placeholder})` }}
        />
      </picture>
      <figcaption className="lp-caption">
        Today’s ten in the real app, on an invented demo account.
      </figcaption>
    </Reveal>
  );
}

/** Section 5: the board, reminders and dream companies, the real app, and the sources. */
export function Features() {
  return (
    <section
      id="features"
      className="lp-section lp-features"
      aria-labelledby="features-head"
    >
      <div className="lp-container">
        <Reveal as="h2" id="features-head" className="lp-h2">
          Everything after the shortlist
        </Reveal>

        <Reveal className="lp-card lp-feature lp-feature--board">
          <div className="lp-feature__text">
            <h3 className="lp-h3">One board for every application</h3>
            <p className="lp-body">
              Saved to offer, with online assessments and interviews in between.
              Move a card as you hear back.
            </p>
          </div>
          <Board />
        </Reveal>

        <div className="lp-feature-pair">
          <Reveal className="lp-card lp-feature">
            <div className="lp-feature__text">
              <h3 className="lp-h3">Deadline reminders</h3>
              <p className="lp-body">
                When a source publishes a closing date, you hear 72 hours before
                it closes, and again at 24.
              </p>
            </div>
            <Reminder />
          </Reveal>
          <Reveal index={1} className="lp-card lp-feature">
            <div className="lp-feature__text">
              <h3 className="lp-h3">Dream companies</h3>
              <p className="lp-body">
                Bookmark a role and its company counts as a dream company: every
                role there moves up your list.
              </p>
            </div>
            <Dream />
          </Reveal>
        </div>

        <div className="lp-feature-wide">
          <Capture />
        </div>

        <Reveal className="lp-sources">
          <p className="lp-mono">Postings from</p>
          <ul className="lp-sources__list">
            {SOURCE_NAMES.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
