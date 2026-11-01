import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { RadarField } from "@/components/landing/radar-field";
import { LandingThemeToggle } from "@/components/landing/landing-theme-toggle";
import { useReveal } from "@/components/landing/use-reveal";
import { Walkthrough } from "@/components/landing/walkthrough";
import "@/styles/landing.css";

export { PRIORITY_COMPONENTS } from "@/components/landing/walkthrough";

const REPO_URL = "https://github.com/UditSinghChauhan/CareerRadar";

const PROOF = [
  {
    title: "No model decides what you see.",
    body: "The fresher classifier and the location normalizer are deterministic rules in the repository, tested case by case.",
  },
  {
    title: "944 backend tests.",
    // Counted 2026-10-31 from `pnpm --filter @workspace/api-server test`.
    body: "From the ranking and the classifier to every provider's sync.",
  },
  {
    title: "Postings from the source.",
    body: "Employers' own careers pages and free job-board APIs. Never scraped from sites whose terms forbid it.",
  },
] as const;

const QUESTIONS = [
  {
    q: "Does an AI pick my roles?",
    a: "No. Classification and ranking are deterministic rules you can read in the repository. A language model is used only when configured, for match scores and to parse a pasted description.",
  },
  {
    q: "Why not LinkedIn or Naukri?",
    a: "Their terms forbid automated collection. A bookmarklet copies a posting from the tab you already have open instead.",
  },
  {
    q: "How fresh is the list?",
    a: "Sources sync every six hours and the queue holds steady for the day. A role that closes leaves it on the next sync.",
  },
] as const;

export const SOURCES = [
  {
    names: "Greenhouse, Lever, Ashby, SmartRecruiters, Workday",
    from: "The employer’s own careers page",
    synced: "Every six hours",
    closes: "When it leaves the employer’s listing",
  },
  {
    names: "RemoteOK, Remotive, Jobicy",
    from: "Job boards with free APIs",
    synced: "Every six hours",
    closes: "At 45 days old, or past its deadline",
  },
  {
    names: "Adzuna",
    from: "Job board, 250 requests a day",
    synced: "Every six hours",
    closes: "At 45 days old, or past its deadline",
  },
  {
    names: "JSearch",
    from: "Job board, 200 requests a month",
    synced: "Once a day",
    closes: "At 45 days old, or past its deadline",
  },
] as const;

export function LandingPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const signUpHref = `${basePath}/sign-up`;
  const signInHref = `${basePath}/sign-in`;
  const rootRef = useRef<HTMLDivElement>(null);
  const overDark = useNavOverBand(rootRef);
  useReveal(rootRef);

  return (
    <div className="lp" ref={rootRef}>
      <a className="lp-skip" href="#main">
        Skip to content
      </a>

      <header
        className={["lp-nav", overDark && "is-over-dark"]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="lp-container lp-nav__in">
          <Link href="/" className="lp-word">
            <LogoMark />
            CareerRadar
          </Link>
          <nav aria-label="Account" className="lp-nav__r">
            <Link href={signInHref} className="lp-nav__link">
              Sign in
            </Link>
            <LandingThemeToggle />
            <Link href={signUpHref} className="lp-btn2">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="lp-hero" aria-labelledby="hero-head">
          <div className="lp-hero__text">
            <h1 id="hero-head" className="lp-display" data-enter>
              Ten roles worth applying to, every morning.
            </h1>
            <p className="lp-lead" data-enter>
              A ranked queue of SDE roles for Indian CS freshers, with the
              reason for every rank.
            </p>
            <div className="lp-hero__act" data-enter>
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
          <div className="lp-hero__object" data-enter>
            <RadarField />
          </div>
        </section>

        <Walkthrough />

        <section className="lp-section" aria-labelledby="proof-head">
          <div className="lp-container">
            <h2 id="proof-head" className="lp-h2" data-reveal>
              Built to be checked
            </h2>
            <div className="lp-trio">
              {PROOF.map((p) => (
                <div key={p.title} data-reveal>
                  <h3 className="lp-h3">{p.title}</h3>
                  <p className="lp-body">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          className="lp-section lp-section--band"
          aria-labelledby="after-head"
        >
          <div className="lp-container">
            <h2 id="after-head" className="lp-h2" data-reveal>
              After you apply
            </h2>
            <div className="lp-duo">
              <div data-reveal>
                <h3 className="lp-h3">From saved to offer, on one board.</h3>
                <p className="lp-body">
                  Applied, online assessment, interview and offer, with
                  referrals and follow-ups kept beside each role.
                </p>
              </div>
              <div data-reveal>
                <h3 className="lp-h3">Reminders before a role closes.</h3>
                <p className="lp-body">
                  When a source publishes a deadline, you get a reminder 72
                  hours and again 24 hours before it closes.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section" aria-labelledby="sources-head">
          <div className="lp-container">
            <h2 id="sources-head" className="lp-h2" data-reveal>
              Where postings come from
            </h2>
            <div className="lp-sources" data-reveal>
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
              <ul className="lp-source-cards">
                {SOURCES.map((s) => (
                  <li key={s.names}>
                    <p className="lp-source-cards__name">{s.names}</p>
                    <p>{s.from}</p>
                    <p className="lp-source-cards__meta">
                      Synced {s.synced.toLowerCase()}. Closed{" "}
                      {s.closes.charAt(0).toLowerCase() + s.closes.slice(1)}.
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section
          className="lp-section lp-section--band"
          aria-labelledby="questions-head"
        >
          <div className="lp-container lp-faq">
            <h2 id="questions-head" className="lp-h2" data-reveal>
              Questions
            </h2>
            <dl>
              {QUESTIONS.map((item) => (
                <div key={item.q} data-reveal>
                  <dt>{item.q}</dt>
                  <dd>{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
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

/**
 * True while the dark walkthrough band sits under the sticky navigation, so
 * the navigation takes the band's tokens instead of laying light glass over
 * near-black.
 */
function useNavOverBand(root: React.RefObject<HTMLElement | null>) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const band = root.current?.querySelector(".lp-walk");
    if (!band || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setOver(entry.isIntersecting),
      // A 1px line just under the 56px navigation.
      {
        rootMargin: `-56px 0px -${Math.max(0, window.innerHeight - 57)}px 0px`,
        threshold: 0,
      },
    );
    io.observe(band);
    return () => io.disconnect();
  }, [root]);
  return over;
}

/** The CareerRadar mark (public/logo.svg), drawn in the current text colour. */
function LogoMark() {
  return (
    <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
      <path d="M128 24C70.5624 24 24 70.5624 24 128C24 185.438 70.5624 232 128 232C185.438 232 232 185.438 232 128C232 70.5624 185.438 24 128 24ZM128 216C79.4183 216 40 176.582 40 128C40 79.4183 79.4183 40 128 40C176.582 40 216 79.4183 216 128C216 176.582 176.582 216 128 216Z" />
      <path d="M128 72C97.0721 72 72 97.0721 72 128C72 158.928 97.0721 184 128 184C158.928 184 184 158.928 184 128C184 97.0721 158.928 72 128 72ZM128 168C105.909 168 88 150.091 88 128C88 105.909 105.909 88 128 88C150.091 88 168 105.909 168 128C168 150.091 150.091 168 128 168Z" />
      <path d="M128 112C119.163 112 112 119.163 112 128C112 136.837 119.163 144 128 144C136.837 144 144 136.837 144 128C144 119.163 136.837 112 128 112Z" />
    </svg>
  );
}
