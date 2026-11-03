import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import captures from "./captures.json";
import { Reveal } from "./motion/reveal";

type Capture = (typeof captures)[keyof typeof captures];

/**
 * One capture of the real app (scripts/capture-landing.mjs): AVIF with a WebP
 * fallback, at 2x, its box reserved by width and height and filled by a
 * blurred placeholder until it loads.
 */
function Shot({
  shot,
  alt,
  className,
  eager = false,
}: {
  shot: Capture;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <picture
      className={["lp-shot", className].filter(Boolean).join(" ")}
      style={{ backgroundImage: `url(${shot.placeholder})` }}
    >
      <source type="image/avif" srcSet={`${shot.avif} 2x`} />
      <img
        srcSet={`${shot.webp} 2x`}
        src={shot.webp}
        width={shot.width}
        height={shot.height}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </picture>
  );
}

const CLOSE_UPS = [
  {
    shot: captures.queue,
    title: "The queue",
    body: "Rank, the four scores and the reason, on every row.",
    alt: "Close-up of Today's Queue: three ranked roles, each with its priority, four component scores, reason line and Apply button.",
    focus: "0 0",
  },
  {
    shot: captures.board,
    title: "The board",
    body: "Every application, from saved to offer.",
    alt: "Close-up of the applications board with Saved, Applied and OA Pending columns of role cards.",
    focus: "-300px -96px",
  },
  {
    shot: captures.detail,
    title: "The detail",
    body: "Status, referral, follow-up and notes for each role.",
    alt: "Close-up of a role's detail drawer with its status, dates, referral and outreach fields.",
    focus: "0 0",
  },
] as const;

export function Showcase() {
  const frameRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: frameRef,
    offset: ["start end", "start 0.25"],
  });
  // Tilted back and slightly small as it enters, flat and full size by the
  // time its top reaches a quarter of the way down the screen.
  const rotateX = useTransform(scrollYProgress, [0, 1], [18, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.88, 1]);
  const glow = useTransform(scrollYProgress, [0.4, 1], [0, 1]);

  return (
    <section className="lp-show" aria-labelledby="show-head">
      <div className="lp-container">
        <Reveal as="h2" id="show-head" className="lp-h2 lp-show__head">
          Your whole search, on one screen.
        </Reveal>
        <Reveal as="p" index={1} className="lp-lead lp-show__lead">
          The real app, on a demo account: today’s ten, your board, deadlines
          and dream companies in one place.
        </Reveal>
      </div>

      <div className="lp-show__stage">
        <motion.div
          ref={frameRef}
          className="lp-browser"
          style={reduced ? undefined : { rotateX, scale }}
        >
          <div className="lp-browser__bar" aria-hidden="true">
            <span className="lp-browser__dots">
              <i />
              <i />
              <i />
            </span>
            <span className="lp-browser__url">
              careerradar-34ec.onrender.com/dashboard
            </span>
          </div>
          <Shot
            shot={captures.dashboard}
            alt="The CareerRadar dashboard: a greeting, Today's Queue with ten ranked roles and their scores, two of ten applications logged today and a one-day streak."
          />
        </motion.div>
        <motion.div
          className="lp-browser__glow"
          aria-hidden="true"
          style={reduced ? undefined : { opacity: glow }}
        />
      </div>

      <div className="lp-container">
        <ul className="lp-close">
          {CLOSE_UPS.map((c, i) => (
            <Reveal as="li" index={i} key={c.title} className="lp-close__item">
              <div
                className="lp-close__crop"
                style={{ "--focus": c.focus } as React.CSSProperties}
              >
                <Shot shot={c.shot} alt={c.alt} />
              </div>
              <h3 className="lp-h3">{c.title}</h3>
              <p className="lp-tile__body">{c.body}</p>
            </Reveal>
          ))}
        </ul>

        <div className="lp-phone-row">
          <Reveal className="lp-phone-row__text">
            <h3 className="lp-h3 lp-phone-row__head">And in your pocket.</h3>
            <p className="lp-body">
              The same queue on a phone: rank, reason and Apply, within reach of
              one thumb.
            </p>
          </Reveal>
          <Reveal index={1} className="lp-phone">
            <div className="lp-phone__screen">
              <Shot
                shot={captures.phone}
                alt="Today's Queue on a phone: the applications count, the streak and the first ranked role with its scores and Apply button."
              />
            </div>
          </Reveal>
        </div>
        <p className="lp-illus">
          Captured from the real app on a local demo account. Every company and
          role in it is invented.
        </p>
      </div>
    </section>
  );
}
