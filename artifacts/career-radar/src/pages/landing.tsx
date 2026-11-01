import { useRef } from "react";
import { Link } from "wouter";
import { HeroRadar } from "@/components/landing/hero-radar";
import { LandingNav } from "@/components/landing/nav";
import { LogoMark } from "@/components/landing/logo-mark";
import { useGrain } from "@/components/landing/use-grain";
import { usePublicStats } from "@/components/landing/use-public-stats";
import { ApplyChapter } from "@/components/landing/apply-chapter";
import { Bento } from "@/components/landing/bento";
import { Chapter } from "@/components/landing/chapter";
import { Faq } from "@/components/landing/faq";
import { Showcase } from "@/components/landing/showcase";
import "@/styles/landing.css";

export { PRIORITY_COMPONENTS } from "@/components/landing/explain-card";

const REPO_URL = "https://github.com/UditSinghChauhan/CareerRadar";

export { SOURCES } from "@/components/landing/sources";

export function LandingPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const signUpHref = `${basePath}/sign-up`;
  const signInHref = `${basePath}/sign-in`;
  const rootRef = useRef<HTMLDivElement>(null);
  const stats = usePublicStats();
  useGrain(rootRef);

  return (
    <div className="lp" ref={rootRef}>
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
          <div className="lp-hero__object">
            <HeroRadar stats={stats} />
          </div>
        </section>

        <Chapter stats={stats} />

        <ApplyChapter />
        <Bento />
        <Showcase />
        <Faq />
      </main>

      <footer className="lp-footer">
        <div className="lp-container lp-footer__in">
          <div>
            <p className="lp-word lp-word--foot">
              <LogoMark />
              CareerRadar
            </p>
            <p className="lp-quiet">
              Ten roles worth applying to, every morning.
            </p>
          </div>
          <Link href={signUpHref} className="lp-btn">
            Get started
          </Link>
        </div>
        <nav aria-label="Project" className="lp-container lp-footer__links">
          <a href={REPO_URL} className="lp-link">
            Source on GitHub
          </a>
          <Link href={signInHref} className="lp-link">
            Sign in
          </Link>
          <span className="lp-quiet">Open source under the MIT licence</span>
        </nav>
      </footer>
    </div>
  );
}
