import { useEffect, useRef, useState } from "react";
import { Bell, Bookmark, BookmarkCheck } from "lucide-react";
import {
  motion,
  useInView,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { Monogram } from "./role-card";
import { RANKED, type SampleRole } from "./sample-roles";
import { Reveal } from "./motion/reveal";
import { EASE_OUT } from "./motion/tokens";
import { SOURCE_NAMES } from "./sources";
import captures from "./captures.json";

const move: Transition = { type: "spring", duration: 0.8, bounce: 0.1 };

function useOnce<T extends Element>(amount = 0.5) {
  const ref = useRef<T>(null);
  const reduced = Boolean(useReducedMotion());
  const seen = useInView(ref, { once: true, amount });
  return { ref, go: reduced || seen, reduced };
}

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
  { role: RANKED[1], col: "Applied" },
  { role: RANKED[5], col: "Applied", note: "Referral" },
  { role: RANKED[2], col: "Online assessment" },
  { role: RANKED[6], col: "Interview", note: "Interview on Thursday" },
  { role: RANKED[9], col: "Offer" },
];
/** The card that moves when the board comes into view. */
const MOVER = RANKED[1].id;

function BoardCard({
  role,
  note,
  lifted = false,
}: {
  role: SampleRole;
  note?: string;
  lifted?: boolean;
}) {
  return (
    <div className={lifted ? "lp-bcard is-lifted" : "lp-bcard"}>
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
  const { ref, go, reduced } = useOnce<HTMLDivElement>(0.4);
  const [moved, setMoved] = useState(reduced);
  // True while the moving card is in the air, for its lift shadow.
  const [lifted, setLifted] = useState(false);
  useEffect(() => {
    if (!go || reduced) return;
    const id = window.setTimeout(() => setMoved(true), 700);
    return () => window.clearTimeout(id);
  }, [go, reduced]);
  const colOf = (role: SampleRole, col: Column): Column =>
    role.id === MOVER && moved ? "Online assessment" : col;

  return (
    <div ref={ref} className="lp-board" inert>
      {COLUMNS.map((col) => {
        const cards = BOARD.filter((b) => colOf(b.role, b.col) === col);
        return (
          <div key={col} className="lp-board__col">
            <p className="lp-board__head">
              <span>{col}</span>
              <span className="lp-mono">{cards.length}</span>
            </p>
            <div className="lp-board__cards">
              {cards.map(({ role, note }) => (
                <motion.div
                  key={role.id}
                  layout="position"
                  transition={move}
                  onLayoutAnimationStart={() =>
                    role.id === MOVER && setLifted(true)
                  }
                  onLayoutAnimationComplete={() =>
                    role.id === MOVER && setLifted(false)
                  }
                  style={role.id === MOVER ? { zIndex: 1 } : undefined}
                >
                  <BoardCard
                    role={role}
                    note={note}
                    lifted={lifted && role.id === MOVER}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Reminder() {
  const { ref, go, reduced } = useOnce<HTMLDivElement>();
  const role = RANKED[1];
  return (
    <div ref={ref} className="lp-remind" inert>
      <motion.div
        className="lp-toast"
        role="presentation"
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={go ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.3 }}
      >
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
      </motion.div>
    </div>
  );
}

/** Three rows; bookmarking a company's role adds 10 to its score and lifts it. */
const DREAM_ROWS = [RANKED[1], RANKED[2], RANKED[3]];
const DREAM_ID = RANKED[3].id;

function Dream() {
  const { ref, go, reduced } = useOnce<HTMLDivElement>();
  const [on, setOn] = useState(reduced);
  useEffect(() => {
    if (!go || reduced) return;
    const id = window.setTimeout(() => setOn(true), 800);
    return () => window.clearTimeout(id);
  }, [go, reduced]);
  // The dream-company part of the score is 100 x 10%: ten points.
  const score = (r: SampleRole) => r.score + (on && r.id === DREAM_ID ? 10 : 0);
  const rows = [...DREAM_ROWS].sort((a, b) => score(b) - score(a));
  return (
    <div ref={ref} className="lp-dream" inert>
      {rows.map((r) => {
        const starred = on && r.id === DREAM_ID;
        return (
          <motion.div
            key={r.id}
            layout="position"
            transition={move}
            className="lp-dream__row"
          >
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
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Today's queue from the real app, cropped to the part that matters and
 * shown large enough to read: the crops are captured so the app's smallest
 * text lands at 14px or more here. Tilts from 6deg to flat as it enters.
 */
function Capture() {
  const reduced = Boolean(useReducedMotion());
  const { queue, "queue-sm": small } = captures;
  return (
    <motion.figure
      className="lp-browser lp-browser--crop"
      initial={reduced ? false : { rotateX: 6, y: 24 }}
      whileInView={{ rotateX: 0, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.9, ease: EASE_OUT }}
    >
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
    </motion.figure>
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
