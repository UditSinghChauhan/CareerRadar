import { lazy, startTransition, Suspense, useEffect, useState } from "react";
import { Link } from "wouter";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { REPO_URL } from "@/components/landing/links";
import "@/styles/landing.css";

export { SOURCES } from "@/components/landing/sources";

const loadBelowFold = () => import("@/components/landing/below-fold");
const BelowFold = lazy(loadBelowFold);

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

export function LandingPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const signUpHref = `${basePath}/sign-up`;
  const signInHref = `${basePath}/sign-in`;
  const belowFold = useAfterFirstPaint();

  return (
    <div className="lp">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>

      <LandingNav signInHref={signInHref} signUpHref={signUpHref} />

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-head">
          <div className="lp-container lp-hero__text">
            <h1 id="hero-head" className="lp-display" data-enter="0">
              Ten roles worth applying to, every morning.
            </h1>
            <p className="lp-lead" data-enter="1">
              A ranked queue of SDE roles for Indian CS freshers, with the
              reason for every rank.
            </p>
            <div className="lp-hero__act" data-enter="2">
              <Link href={signUpHref} className="lp-btn">
                Get started
              </Link>
              <p className="lp-quiet">
                Free and open source.{" "}
                <a href={REPO_URL} className="lp-link">
                  Read the code on GitHub
                </a>
              </p>
            </div>
          </div>
        </section>

        {belowFold ? (
          <Suspense fallback={<div className="lp-pending" />}>
            <BelowFold />
          </Suspense>
        ) : (
          <div className="lp-pending" />
        )}
      </main>

      <LandingFooter signInHref={signInHref} />
    </div>
  );
}
