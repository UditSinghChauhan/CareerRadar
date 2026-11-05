import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { Monogram } from "./role-card";
import { RANKED } from "./sample-roles";
import { Reveal } from "./motion/reveal";
import { EASE_OUT } from "./motion/tokens";
import { Statement } from "./statement";

const ROW = RANKED[0];
/** The pick that moves up once the first is applied to. */
const NEXT = RANKED[1];

/** The four parts of a score, weighted as in api-server/src/queue/priority.ts. */
export const PARTS = [
  { key: "relevanceScore", name: "Fit", weight: 40 },
  { key: "deadlineUrgency", name: "Closing soon", weight: 30 },
  { key: "freshness", name: "Freshness", weight: 20 },
  { key: "dreamCompanyBoost", name: "Dream company", weight: 10 },
] as const;

/** True once the element has been half in view, or at once under reduced motion. */
function usePlayed<T extends Element>() {
  const ref = useRef<T>(null);
  const reduced = Boolean(useReducedMotion());
  const seen = useInView(ref, { once: true, amount: 0.5 });
  return { ref, go: reduced || seen, reduced };
}

function Ranked() {
  const { ref, go, reduced } = usePlayed<HTMLDivElement>();
  return (
    <div ref={ref} className="lp-card lp-vig">
      <div className="lp-vig__row">
        <Monogram role={ROW} size="sm" />
        <p className="lp-vig__title">{ROW.title}</p>
        <span className="lp-score">{ROW.score}</span>
      </div>
      <ul className="lp-bars">
        {PARTS.map((p, i) => {
          const v = ROW.components[p.key] / 100;
          return (
            <li key={p.key}>
              <span className="lp-bars__name">
                {p.name} <span className="lp-bars__w">{p.weight}%</span>
              </span>
              <span className="lp-bars__track">
                <motion.span
                  className="lp-bars__fill"
                  initial={reduced ? false : { scaleX: 0 }}
                  animate={{ scaleX: go ? v : 0 }}
                  transition={{
                    duration: 0.8,
                    ease: EASE_OUT,
                    delay: 0.1 + i * 0.06,
                  }}
                />
              </span>
              <span className="lp-bars__v">{ROW.components[p.key]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Explained() {
  const { ref, go, reduced } = usePlayed<HTMLDivElement>();
  return (
    <div ref={ref} className="lp-card lp-vig">
      <div className="lp-vig__row">
        <Monogram role={ROW} size="sm" />
        <p className="lp-vig__title">{ROW.title}</p>
      </div>
      <ul className="lp-chips lp-chips--stack">
        {ROW.reasons.map((r, i) => (
          <motion.li
            key={r}
            className="lp-chip"
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={go ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{
              duration: 0.5,
              ease: EASE_OUT,
              delay: 0.2 + i * 0.25,
            }}
          >
            {r}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/** Apply is pressed, the row checks off, then drops onto the board's Applied column. */
function Tracked() {
  const { ref, go, reduced } = usePlayed<HTMLDivElement>();
  const [step, setStep] = useState(reduced ? 3 : 0);
  useEffect(() => {
    if (!go || reduced) return;
    const ids = [
      window.setTimeout(() => setStep(1), 500),
      window.setTimeout(() => setStep(2), 900),
      window.setTimeout(() => setStep(3), 1700),
    ];
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [go, reduced]);

  const row = (
    <motion.div
      layoutId="tracked-row"
      transition={{ type: "spring", duration: 0.7, bounce: 0.1 }}
      className={step >= 2 ? "lp-trow is-done" : "lp-trow"}
    >
      <Monogram role={ROW} size="sm" />
      <p className="lp-vig__title">{ROW.title}</p>
      {step < 3 &&
        (step >= 2 ? (
          <span className="lp-trow__check">
            <Check aria-hidden="true" />
            Applied
          </span>
        ) : (
          <motion.span
            className="lp-btn lp-btn--sm"
            animate={{ scale: step === 1 ? 0.94 : 1 }}
            transition={{ duration: 0.15 }}
          >
            Apply
          </motion.span>
        ))}
    </motion.div>
  );

  // Once the first pick has moved onto the board, the next takes its place,
  // as in the real queue, so the card never shows an empty slot.
  const next = (
    <motion.div
      className="lp-trow"
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 }}
    >
      <Monogram role={NEXT} size="sm" />
      <p className="lp-vig__title">{NEXT.title}</p>
      <span className="lp-btn lp-btn--sm">Apply</span>
    </motion.div>
  );

  return (
    <div ref={ref} className="lp-card lp-vig">
      <div className="lp-vig__slot">{step < 3 ? row : next}</div>
      <div className="lp-mini-col">
        <p className="lp-mono">Applied</p>
        <div className="lp-mini-col__cards">
          {step >= 3 && row}
          <div className="lp-trow lp-trow--ghost">
            <Monogram role={RANKED[3]} size="sm" />
            <p className="lp-vig__title">{RANKED[3].title}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Ranked",
    text: "Every open role a fresher can apply to is scored on four things.",
    Vignette: Ranked,
  },
  {
    title: "Explained",
    text: "Each of your ten says, in a few words, why it made the list.",
    Vignette: Explained,
  },
  {
    title: "Tracked",
    text: "Apply opens the posting and logs it on your board.",
    Vignette: Tracked,
  },
];

/** Section 4: a statement, then three steps, each with one working fragment. */
export function HowItWorks() {
  return (
    <section id="how" className="lp-section lp-how" aria-labelledby="how-head">
      <div className="lp-container">
        <Reveal as="h2" id="how-head" className="lp-h2">
          How it works
        </Reveal>
        <Statement
          lead="One short list, every morning."
          rest="CareerRadar ranks every open role you can apply to, says why each pick is there, and keeps your applications in one place."
        />
        <ol className="lp-steps">
          {STEPS.map(({ title, text, Vignette }, i) => (
            <Reveal as="li" key={title} index={i} className="lp-step">
              <p className="lp-mono">{String(i + 1).padStart(2, "0")}</p>
              <h3 className="lp-h3">{title}</h3>
              <p className="lp-body">{text}</p>
              <div inert className="lp-step__vig">
                <Vignette />
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
