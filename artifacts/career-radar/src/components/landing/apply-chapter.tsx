import { useEffect, useRef, useState } from "react";
import {
  LayoutGroup,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { ExternalLink, Flame } from "lucide-react";
import { STATUS_LABELS } from "@/components/applications/status";
import { ILLUSTRATIVE_QUEUE } from "./landing-queue";
import { Reveal } from "./motion/reveal";
import { EASE_OUT } from "./motion/tokens";
import { QUEUE_SIZE } from "./use-public-stats";

/** The board's first four stages, labelled as the app labels them. */
export const BOARD_STAGES = [
  "applied",
  "oa_pending",
  "interview_pending",
  "offered",
] as const;

const [first, second] = ILLUSTRATIVE_QUEUE.items;

/**
 * Apply, and it's logged. Plays once, when the stage is 40% in view: Apply
 * is pressed, the card leaves the queue, the counter goes from 0 / 10 to
 * 1 / 10, the streak lights, the board assembles and the card drops into
 * Applied. The card is one element moving between two parents (a shared
 * layout animation), so it is the same card the whole way. Reduced motion
 * shows the end state.
 */
export function ApplyChapter() {
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { once: true, amount: 0.4 });
  const reduced = useReducedMotion();
  // 0 queued · 1 pressed · 2 applied (counter, streak) · 3 board · 4 landed
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) {
      setStep(4);
      return;
    }
    if (!inView) return;
    const at = [250, 650, 900, 1500];
    const ids = at.map((ms, i) => window.setTimeout(() => setStep(i + 1), ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [inView, reduced]);

  const applied = step >= 2 ? 1 : 0;
  const t = { duration: reduced ? 0 : 0.6, ease: EASE_OUT };

  return (
    <section className="lp-apply" aria-labelledby="apply-head">
      <div className="lp-container">
        <Reveal as="h2" id="apply-head" className="lp-h2 lp-apply__head">
          Apply, and it’s logged.
        </Reveal>
        <Reveal as="p" index={1} className="lp-lead lp-apply__lead">
          Apply opens the employer’s own posting in a new tab. The role leaves
          your queue, today’s count goes up, and it lands on your board.
        </Reveal>

        <div
          ref={stageRef}
          className="lp-apply__stage"
          aria-hidden="true"
          data-step={step}
        >
          <LayoutGroup>
            <div className="lp-panel lp-apply__queue">
              <div className="lp-apply__bar">
                <p className="lp-apply__title">Today’s queue</p>
                <p className="lp-apply__count num">
                  <motion.span
                    key={applied}
                    initial={reduced ? false : { y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={t}
                  >
                    {applied}
                  </motion.span>{" "}
                  / {QUEUE_SIZE}
                </p>
              </div>
              <div className="lp-apply__progress">
                <motion.div
                  className="lp-apply__fill"
                  initial={false}
                  animate={{ scaleX: applied / QUEUE_SIZE }}
                  transition={t}
                />
              </div>
              <p className="lp-apply__streak" data-on={applied > 0}>
                <Flame aria-hidden="true" />
                {applied > 0 ? "1-day streak" : "No streak yet"}
              </p>
              <div className="lp-apply__rows">
                {step < 4 && (
                  <QueueCard
                    rank={1}
                    item={first}
                    pressed={step >= 1}
                    leaving={step >= 2}
                    layoutId="apply-card"
                  />
                )}
                <motion.div layout transition={t}>
                  <QueueCard rank={step >= 2 ? 1 : 2} item={second} />
                </motion.div>
              </div>
            </div>

            <div className="lp-panel lp-apply__board">
              <p className="lp-apply__title">Applications</p>
              <div className="lp-apply__cols">
                {BOARD_STAGES.map((s, i) => (
                  <motion.div
                    key={s}
                    className="lp-apply__col"
                    initial={reduced ? false : { opacity: 0, y: 24 }}
                    animate={
                      step >= 3 || reduced
                        ? { opacity: 1, y: 0 }
                        : { opacity: 0.25, y: 24 }
                    }
                    transition={{ ...t, delay: reduced ? 0 : i * 0.08 }}
                  >
                    <p className="lp-apply__col-head">
                      {STATUS_LABELS[s]}
                      <span className="num">
                        {s === "applied" && step >= 4 ? 1 : 0}
                      </span>
                    </p>
                    {s === "applied" && step >= 4 && (
                      <QueueCard
                        item={first}
                        layoutId="apply-card"
                        compact
                        transition={t}
                      />
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          </LayoutGroup>
        </div>
        <p className="lp-sr">
          Illustration: applying to the first role in the queue moves it to the
          Applied column of the board and sets today’s count to 1 of 10.
        </p>
      </div>
    </section>
  );
}

type Item = (typeof ILLUSTRATIVE_QUEUE.items)[number];

function QueueCard({
  item,
  rank,
  pressed = false,
  leaving = false,
  compact = false,
  layoutId,
  transition,
}: {
  item: Item;
  rank?: number;
  pressed?: boolean;
  leaving?: boolean;
  compact?: boolean;
  layoutId?: string;
  transition?: object;
}) {
  return (
    <motion.div
      layoutId={layoutId}
      transition={transition ?? { duration: 0.7, ease: EASE_OUT }}
      className={compact ? "lp-card lp-card--compact" : "lp-card"}
      data-leaving={leaving}
      animate={leaving && !compact ? { x: 48, opacity: 0.6, rotate: 1.5 } : {}}
    >
      {rank !== undefined && <span className="lp-card__rank num">{rank}</span>}
      <div className="lp-card__body">
        <p className="lp-card__job">{item.job.title}</p>
        <p className="lp-card__co">
          {item.job.company?.name} · {item.job.location}
        </p>
        {!compact && <p className="lp-card__why">{item.reasons[0]}</p>}
      </div>
      {!compact && (
        <span className="lp-card__apply" data-pressed={pressed}>
          Apply <ExternalLink aria-hidden="true" />
        </span>
      )}
    </motion.div>
  );
}
