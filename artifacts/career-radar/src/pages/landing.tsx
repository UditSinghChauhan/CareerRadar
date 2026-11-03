import {
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "wouter";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { usePublicStats } from "@/components/landing/use-public-stats";
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

  return (
    <div className="lp">
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
                />
              </Suspense>
            )}
          </div>
          <div className="lp-container lp-hero__text" ref={textRef}>
            <h1 id="hero-head" className="lp-display">
              Ten roles worth applying to, every morning.
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
