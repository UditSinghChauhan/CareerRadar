import {
  Fragment,
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Link } from "wouter";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { usePublicStats } from "@/components/landing/use-public-stats";
import { usePauseOffscreen } from "@/components/landing/motion/use-pause-offscreen";
import "@/styles/landing.css";

export { SOURCES } from "@/components/landing/sources";

const loadBelowFold = () => import("@/components/landing/below-fold");
const BelowFold = lazy(loadBelowFold);
const HeroField = lazy(() =>
  loadBelowFold().then((m) => ({ default: m.HeroField })),
);

/** True one frame after the hero has painted. */
function useAfterFirstPaint() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void loadBelowFold();
    const id = requestAnimationFrame(() =>
      startTransition(() => setReady(true)),
    );
    return () => cancelAnimationFrame(id);
  }, []);
  return ready;
}

declare global {
  interface Window {
    /** Set by index.html's inline script when it pre-renders the hero. */
    __lpBorn?: number;
  }
}

const HEADLINE = "Ten roles worth applying to, every morning.";

/**
 * Numbers each headline word with the line it sits on (`--line`), before
 * the first paint, so the entrance (landing.css) lifts the headline line by
 * line. index.html runs the same loop on its pre-rendered copy.
 */
function useHeadlineLines(h1Ref: RefObject<HTMLHeadingElement | null>) {
  useLayoutEffect(() => {
    const words = h1Ref.current?.querySelectorAll<HTMLElement>(".lp-w");
    if (!words?.length) return;
    let line = -1;
    let lineTop = -Infinity;
    for (const w of words) {
      if (Math.abs(w.offsetTop - lineTop) > 2) {
        line++;
        lineTop = w.offsetTop;
      }
      w.style.setProperty("--line", String(line));
    }
  }, [h1Ref]);
}

/**
 * "Field to focus" (DESIGN.md). A light page in seven sections: the hero's
 * field of sample roles, the ten in focus, the numbers, how it works, the
 * features, questions, and one dark band with the radar.
 */
export function LandingPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const signUpHref = `${basePath}/sign-up`;
  const signInHref = `${basePath}/sign-in`;
  const stats = usePublicStats();
  const belowFold = useAfterFirstPaint();
  const heroRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useHeadlineLines(h1Ref);
  // The entrance's zero: when index.html painted its copy of the hero, or
  // now. `--since` shifts this hero's CSS entrance by the time already
  // spent, so replacing the pre-rendered hero never restarts it.
  const [bornAt] = useState(() => window.__lpBorn ?? performance.now());
  const [since] = useState(() => Math.round(performance.now() - bornAt));
  usePauseOffscreen(heroRef);

  return (
    <div className="lp" style={{ "--since": `${since}ms` } as CSSProperties}>
      <a className="lp-skip" href="#main">
        Skip to content
      </a>

      <LandingNav signInHref={signInHref} signUpHref={signUpHref} />

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-head" ref={heroRef}>
          <div className="lp-field" aria-hidden="true" ref={fieldRef}>
            {belowFold && (
              <Suspense fallback={null}>
                <HeroField
                  heroRef={heroRef}
                  textRef={textRef}
                  fieldRef={fieldRef}
                  bornAt={bornAt}
                />
              </Suspense>
            )}
          </div>
          <div className="lp-container lp-hero__text" ref={textRef}>
            <h1 id="hero-head" className="lp-display" ref={h1Ref}>
              {HEADLINE.split(" ").map((w, i) => (
                <Fragment key={i}>
                  {i > 0 && " "}
                  <span className="lp-w">{w}</span>
                </Fragment>
              ))}
            </h1>
            <p className="lp-lead">
              A ranked shortlist of SDE roles for Indian CS freshers, with the
              reason for each pick.
            </p>
            <div className="lp-hero__act">
              <Link href={signUpHref} className="lp-btn">
                Get started
              </Link>
              <p className="lp-quiet">Free and open source</p>
            </div>
          </div>
        </section>

        {belowFold ? (
          <Suspense fallback={<div className="lp-pending" />}>
            <BelowFold stats={stats} signUpHref={signUpHref} />
          </Suspense>
        ) : (
          <div className="lp-pending" />
        )}
      </main>

      <LandingFooter signInHref={signInHref} />
    </div>
  );
}
