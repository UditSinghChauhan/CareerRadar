import { Check } from "lucide-react";
import { Monogram } from "./role-card";
import { RANKED } from "./sample-roles";
import { Reveal } from "./motion/reveal";
import { Settle } from "./motion/scroll-motion";
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

/**
 * The three fragments are still: each shows the product's end state, and
 * the step it sits in rises in with the page's reveal and lifts on hover
 * (the fragment is inert, so the step takes the hover).
 */
function Ranked() {
  return (
    <div className="lp-card lp-vig">
      <div className="lp-vig__row">
        <Monogram role={ROW} size="sm" />
        <p className="lp-vig__title">{ROW.title}</p>
        <span className="lp-score">{ROW.score}</span>
      </div>
      <ul className="lp-bars">
        {PARTS.map((p) => (
          <li key={p.key}>
            <span className="lp-bars__name">
              {p.name} <span className="lp-bars__w">{p.weight}%</span>
            </span>
            <span className="lp-bars__track">
              <span
                className="lp-bars__fill"
                style={{ transform: `scaleX(${ROW.components[p.key] / 100})` }}
              />
            </span>
            <span className="lp-bars__v">{ROW.components[p.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Explained() {
  return (
    <div className="lp-card lp-vig">
      <div className="lp-vig__row">
        <Monogram role={ROW} size="sm" />
        <p className="lp-vig__title">{ROW.title}</p>
      </div>
      <ul className="lp-chips lp-chips--stack">
        {ROW.reasons.map((r) => (
          <li key={r} className="lp-chip">
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The first pick, applied to, sits on the board's Applied column; the next has taken its place. */
function Tracked() {
  return (
    <div className="lp-card lp-vig">
      <div className="lp-vig__slot">
        <div className="lp-trow">
          <Monogram role={NEXT} size="sm" />
          <p className="lp-vig__title">{NEXT.title}</p>
          <span className="lp-btn lp-btn--sm">Apply</span>
        </div>
      </div>
      <div className="lp-mini-col">
        <p className="lp-mono">Applied</p>
        <div className="lp-mini-col__cards">
          <div className="lp-trow">
            <Monogram role={ROW} size="sm" />
            <p className="lp-vig__title">{ROW.title}</p>
            <span className="lp-trow__check">
              <Check aria-hidden="true" />
              Applied
            </span>
          </div>
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
        <Settle as="h2" id="how-head" className="lp-h2">
          How it works
        </Settle>
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
