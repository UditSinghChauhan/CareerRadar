import { useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Bell, Bookmark, Check, X } from "lucide-react";
import { STATUS_LABELS } from "@/components/applications/status";
import { BOARD_STAGES } from "./apply-chapter";
import { ILLUSTRATIVE_QUEUE } from "./landing-queue";
import classifier from "./classifier-demo.json";
import { Reveal } from "./motion/reveal";
import { EASE_IN_OUT, EASE_OUT } from "./motion/tokens";
import { useActive } from "./motion/use-active";
import { formatCount, useCountUp } from "./motion/use-count-up";
import { SOURCES } from "./sources";

/**
 * api-server's test count, counted 2026-11-01 with
 * `pnpm --filter @workspace/api-server test`. One constant, read by the
 * tile; the page never prints the date.
 */
export const BACKEND_TESTS = 963;

/**
 * Steps through `count` states every `ms` while `active`, for three cycles.
 * Under reduced motion it holds `rest` (the end state) and never moves.
 */
function useLoop(active: boolean, count: number, ms: number, rest: number) {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(reduced ? rest : 0);
  useEffect(() => {
    if (reduced) {
      setStep(rest);
      return;
    }
    if (!active) return;
    // Three cycles each time the tile comes into view, then it rests on its
    // end state: nothing on the page moves on its own indefinitely.
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks += 1;
      if (ticks >= count * LOOP_CYCLES) {
        window.clearInterval(id);
        setStep(rest);
        return;
      }
      setStep((s) => (s + 1) % count);
    }, ms);
    return () => window.clearInterval(id);
  }, [active, count, ms, rest, reduced]);
  return step;
}

const LOOP_CYCLES = 3;

function Tile({
  className,
  title,
  body,
  index,
  children,
}: {
  className: string;
  title: string;
  body: ReactNode;
  index: number;
  children: ReactNode;
}) {
  return (
    <Reveal as="li" index={index} className={`lp-tile ${className}`}>
      <div className="lp-tile__demo" aria-hidden="true">
        {children}
      </div>
      <div className="lp-tile__text">
        <h3 className="lp-h3">{title}</h3>
        <p className="lp-tile__body">{body}</p>
      </div>
    </Reveal>
  );
}

export function Bento() {
  return (
    <section className="lp-bento-wrap" aria-labelledby="bento-head">
      <div className="lp-container">
        <Reveal as="h2" id="bento-head" className="lp-h2">
          Built to be used. Built to be checked.
        </Reveal>
        <ul className="lp-bento">
          <Tile
            index={0}
            className="lp-tile--board"
            title="From applied to offer, on one board."
            body="Online assessments, interviews and offers, with referrals and follow-ups kept beside each role."
          >
            <BoardDemo />
          </Tile>
          <Tile
            index={1}
            className="lp-tile--rules"
            title="No model decides what you see."
            body="Which roles a fresher can apply for is decided by rules in the repository, tested title by title."
          >
            <RulesDemo />
          </Tile>
          <Tile
            index={2}
            className="lp-tile--small"
            title="Reminders before a role closes."
            body="When a source publishes a deadline: 72 hours before it closes, and again at 24."
          >
            <ReminderDemo />
          </Tile>
          <Tile
            index={3}
            className="lp-tile--small"
            title="Bookmark a dream company."
            body="Bookmark one of its roles and every role there gains 10 points, often enough to move up the queue."
          >
            <DreamDemo />
          </Tile>
          <Tile
            index={4}
            className="lp-tile--small"
            title="Tested where it matters."
            body="From the ranking and the classifier to every provider’s sync, on every pull request."
          >
            <TestsDemo />
          </Tile>
          <SourcesTile />
        </ul>
      </div>
    </section>
  );
}

/** A card moving Applied → OA Pending → Interview → Offered. */
function BoardDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useLoop(useActive(ref), BOARD_STAGES.length, 1600, 3);
  const item = ILLUSTRATIVE_QUEUE.items[2];
  return (
    <div ref={ref} className="lp-mini-board">
      <LayoutGroup id="board-demo">
        {BOARD_STAGES.map((s, i) => (
          <div key={s} className="lp-mini-board__col" data-on={i === step}>
            <p className="lp-mini-board__head">{STATUS_LABELS[s]}</p>
            <div className="lp-mini-board__ghost" />
            {i === step && (
              <motion.div
                layoutId="board-card"
                className="lp-mini-card"
                transition={{ duration: 0.7, ease: EASE_IN_OUT }}
              >
                <p className="lp-mini-card__job">{item.job.title}</p>
                <p className="lp-mini-card__co">{item.job.company?.name}</p>
              </motion.div>
            )}
            <div className="lp-mini-board__ghost lp-mini-board__ghost--2" />
          </div>
        ))}
      </LayoutGroup>
    </div>
  );
}

type Answer = "yes" | "no";

/** The classifier's rules asked of one title at a time, then its verdict. */
function RulesDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const titles = classifier.titles;
  // Per title: ask each rule it needs (one step each), then hold the verdict.
  const perTitle = classifier.rules.length + 2;
  const step = useLoop(
    useActive(ref),
    titles.length * perTitle,
    700,
    perTitle - 1,
  );
  const t = titles[Math.floor(step / perTitle)];
  const local = step % perTitle;
  const asked = Math.min(local, t.answers.length);
  const decided = local > t.answers.length;
  return (
    <div ref={ref} className="lp-rules">
      <motion.p
        key={t.title}
        className="lp-rules__title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        “{t.title}”
      </motion.p>
      <ol className="lp-rules__list">
        {classifier.rules.map((rule, i) => {
          const answer = (i < asked ? t.answers[i] : undefined) as
            | Answer
            | undefined;
          const skipped = decided && i >= t.answers.length;
          return (
            <li
              key={rule}
              data-answer={answer ?? (skipped ? "skip" : "pending")}
            >
              <span className="lp-rules__mark">
                {answer === "yes" ? <Check /> : answer === "no" ? <X /> : null}
              </span>
              {rule}
            </li>
          );
        })}
      </ol>
      <p
        className="lp-rules__verdict"
        data-on={decided}
        data-ok={t.isFresherEligible}
      >
        {decided ? t.verdict : "Checking the title…"}
      </p>
    </div>
  );
}

/** The deadline reminder, sliding in and out. */
function ReminderDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useLoop(useActive(ref), 3, 1400, 1);
  const item = ILLUSTRATIVE_QUEUE.items[3];
  return (
    <div ref={ref} className="lp-toast-stage">
      <motion.div
        className="lp-toast"
        initial={false}
        animate={
          step === 1
            ? { y: 0, opacity: 1 }
            : step === 2
              ? { y: -12, opacity: 0 }
              : { y: 40, opacity: 0 }
        }
        transition={{ duration: step === 0 ? 0 : 0.5, ease: EASE_OUT }}
      >
        <span className="lp-toast__icon">
          <Bell />
        </span>
        <div>
          {/* The app's own wording: notifications/generator.ts. */}
          <p className="lp-toast__title">Closes within 24 hours</p>
          <p className="lp-toast__body">
            {item.job.title} at {item.job.company?.name} closes within 24 hours.
            You have not applied yet.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

/** Three rows; bookmarking the third's company adds its dream-company points and it rises. */
function DreamDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useLoop(useActive(ref), 3, 1500, 2);
  const rows = ILLUSTRATIVE_QUEUE.items.slice(1, 4);
  const starred = rows[2];
  const boost = 10; // dreamCompanyBoost 100 × weight 10%, priority.ts
  const lifted = step === 2;
  const order = lifted ? [starred, rows[0], rows[1]] : rows;
  return (
    <div ref={ref} className="lp-dream">
      <LayoutGroup id="dream-demo">
        {order.map((r) => {
          const isStar = r === starred;
          const score = r.priority + (isStar && step >= 1 ? boost : 0);
          return (
            <motion.div
              layout
              key={r.job.id}
              className="lp-dream__row"
              data-star={isStar && step >= 1}
              transition={{ duration: 0.6, ease: EASE_IN_OUT }}
            >
              <span className="lp-dream__star" data-on={isStar && step >= 1}>
                <Bookmark />
              </span>
              <span className="lp-dream__co">{r.job.company?.name}</span>
              <span className="lp-dream__score num">{score.toFixed(1)}</span>
            </motion.div>
          );
        })}
      </LayoutGroup>
    </div>
  );
}

function TestsDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const active = useActive(ref);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (active) setSeen(true);
  }, [active]);
  const n = useCountUp(BACKEND_TESTS, { start: seen, duration: 1400 });
  return (
    <div ref={ref} className="lp-tests">
      <p className="lp-tests__n num">{formatCount(n)}</p>
      <p className="lp-tests__label">backend tests passing</p>
      <div className="lp-tests__bar">
        <div
          className="lp-tests__fill"
          style={{ transform: `scaleX(${n / BACKEND_TESTS})` }}
        />
      </div>
    </div>
  );
}

function SourcesTile() {
  const ref = useRef<HTMLDivElement>(null);
  const active = useActive(ref);
  const names = SOURCES.flatMap((s) => s.names.split(", "));
  return (
    <Reveal as="li" index={5} className="lp-tile lp-tile--sources">
      <div className="lp-tile__text lp-tile__text--row">
        <h3 className="lp-h3">Postings from the source.</h3>
        <p className="lp-tile__body">
          Employers’ own careers pages and free job-board APIs. Never scraped
          from sites whose terms forbid it.
        </p>
      </div>
      <div
        ref={ref}
        className="lp-marquee"
        data-run={active}
        aria-label={`Sources: ${names.join(", ")}`}
        role="img"
      >
        <div className="lp-marquee__track">
          {[0, 1].map((copy) => (
            <ul key={copy} aria-hidden="true">
              {names.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ))}
        </div>
      </div>
      <details className="lp-sync">
        <summary>How each source syncs</summary>
        <div className="lp-sync__table">
          <table>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Listings from</th>
                <th scope="col">Synced</th>
                <th scope="col">Closed</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.names}>
                  <th scope="row">{s.names}</th>
                  <td>{s.from}</td>
                  <td>{s.synced}</td>
                  <td>{s.closes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Reveal>
  );
}
