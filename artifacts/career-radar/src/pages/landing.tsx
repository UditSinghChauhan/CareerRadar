import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { RadarField } from "@/components/landing/radar-field";
import "@/styles/landing.css";

const REPO_URL = "https://github.com/UditSinghChauhan/CareerRadar";

/**
 * The daily-queue priority weights, as set in
 * artifacts/api-server/src/queue/priority.ts (PRIORITY_WEIGHTS). Shown on the
 * page so the claim "you can check the ranking" is itself checkable.
 */
export const PRIORITY_COMPONENTS = [
  {
    name: "Relevance",
    weight: 40,
    detail: "How clearly the posting is for a fresher",
  },
  { name: "Deadline", weight: 30, detail: "How soon applications close" },
  { name: "Freshness", weight: 20, detail: "How recently it was posted" },
  {
    name: "Dream company",
    weight: 10,
    detail: "Whether you have bookmarked a role at that company",
  },
] as const;

const PANELS = [
  {
    title: "Ten roles, ranked",
    body: "Every morning the queue picks ten roles from everything open to you, highest priority first.",
    src: "landing/queue.webp",
    width: 2044,
    height: 1254,
    alt: "Today's Queue: four ranked internships from Microsoft, Flipkart, Swiggy and Adobe, each with its priority score and an Apply button.",
  },
  {
    title: "Only what you can apply to",
    body: "Search runs on the server across titles, descriptions and skills, with batch, location and relevance filters.",
    src: "landing/jobs.webp",
    width: 2366,
    height: 1672,
    alt: "Jobs Explorer: filters for job type, relevance and location beside cards for Canonical, Rubrik, Swiggy and Adobe roles.",
  },
  {
    title: "The reason for every rank",
    body: "Each row shows its relevance, deadline and freshness scores, and a sentence on why it sits where it does.",
    src: "landing/reason.webp",
    width: 1948,
    height: 272,
    alt: "One queue row: Relevance 40.0, Deadline 24.0, Freshness 15.2, and the line explaining that relevance is shared by hundreds of roles, so the other terms decide the order.",
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

const SOURCES = [
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
  const asset = (src: string) => `${import.meta.env.BASE_URL}${src}`;

  const barHidden = useRetractingBar();
  useDocumentTheme("vantage");
  const [activePanel, panelRefs] = useActivePanel(PANELS.length);

  return (
    <div className="vantage" data-theme="vantage">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <div className="banner">
        <div className="container">
          <p>
            The ranking, the classifier and 944 backend tests are open source.
          </p>
          <a href={REPO_URL}>Read the code on GitHub</a>
        </div>
      </div>

      <header className={barHidden ? "bar is-hidden" : "bar"}>
        <div className="container">
          <Link href="/" className="wordmark">
            <LogoMark />
            CareerRadar
          </Link>
          <nav aria-label="Account">
            <Link href={`${basePath}/sign-in`} className="link">
              Sign in
            </Link>
            <Link href={`${basePath}/sign-up`} className="btn btn--small">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <div className="container">
            <div className="hero__text">
              <h1>Ten roles worth applying to, every morning.</h1>
              <p className="lead">
                A radar over every SDE posting, ranked for Indian CS freshers.
              </p>
              <div className="hero__actions">
                <Link href={signUpHref} className="btn">
                  Get started
                </Link>
                <a href={REPO_URL} className="btn btn--quiet">
                  Read the code
                </a>
              </div>
            </div>
            <RadarField />
          </div>
        </section>

        <section className="section" aria-labelledby="product-head">
          <div className="container">
            <div className="head">
              <h2 id="product-head">What you open each morning</h2>
            </div>
            <div className="pinned">
              <div className="pinned__stage ticks" aria-hidden="true">
                <img
                  key={PANELS[activePanel].src}
                  src={asset(PANELS[activePanel].src)}
                  width={PANELS[activePanel].width}
                  height={PANELS[activePanel].height}
                  alt=""
                  loading="lazy"
                />
              </div>
              <ol className="pinned__panels">
                {PANELS.map((panel, i) => (
                  <li
                    key={panel.title}
                    ref={(el) => {
                      panelRefs.current[i] = el;
                    }}
                    className={i === activePanel ? "panel is-active" : "panel"}
                  >
                    <h3>{panel.title}</h3>
                    <p>{panel.body}</p>
                    <img
                      className="panel__shot"
                      src={asset(panel.src)}
                      width={panel.width}
                      height={panel.height}
                      alt={panel.alt}
                      loading="lazy"
                    />
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="checked-head">
          <div className="container">
            <div className="head">
              <h2 id="checked-head">Built to be checked</h2>
            </div>
            <div className="bento">
              <article className="tile tile--lead">
                <h3>How a role is ranked</h3>
                <dl className="weights">
                  {PRIORITY_COMPONENTS.map((c, i) => (
                    <div className="weight" key={c.name}>
                      <dt>{c.name}</dt>
                      <dd className="weight__value num">
                        {c.weight}
                        <span className="unit">%</span>
                      </dd>
                      <dd className="weight__track" aria-hidden="true">
                        <div
                          className={
                            i === 0
                              ? "weight__fill weight__fill--lead"
                              : "weight__fill"
                          }
                          style={{ width: `${c.weight * 2.5}%` }}
                        />
                      </dd>
                      <dd className="weight__note">{c.detail}</dd>
                    </div>
                  ))}
                </dl>
              </article>
              <article className="tile tile--wide ticks">
                <p className="tile__figure num">
                  2,109 <span className="of">of 4,512</span>
                </p>
                <p>
                  Active postings plausibly open to a fresher, measured on 16
                  September 2026.
                </p>
              </article>
              <article className="tile tile--wide">
                <h3>No model decides what you see</h3>
                <p>
                  The fresher classifier and the location normalizer are
                  deterministic rules, tested case by case.
                </p>
              </article>
              <article className="tile tile--third ticks">
                <p className="tile__figure num">944</p>
                <p>Backend tests in the repository, counted 31 October 2026.</p>
              </article>
              <article className="tile tile--third ticks">
                <p className="tile__figure num">
                  72<span className="unit"> h</span> 24
                  <span className="unit"> h</span>
                </p>
                <p>Deadline reminders before a saved role closes.</p>
              </article>
              <article className="tile tile--third">
                <h3>Saved to offer, on one board</h3>
                <p>
                  Applied, OA, interview and offer, with referrals and
                  follow-ups tracked beside each role.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          className="section section--band"
          aria-labelledby="questions-head"
        >
          <div className="container rows">
            <h2 id="questions-head">Questions</h2>
            <dl>
              {QUESTIONS.map((item) => (
                <div className="row" key={item.q}>
                  <dt>{item.q}</dt>
                  <dd>{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section
          className="section section--last"
          aria-labelledby="sources-head"
        >
          <div className="container">
            <div className="head">
              <h2 id="sources-head">Where postings come from</h2>
            </div>
            <div className="table-wrap">
              <table className="sources">
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
                      <td data-label="Source">{s.names}</td>
                      <td data-label="Listings from">{s.from}</td>
                      <td data-label="Synced">{s.synced}</td>
                      <td data-label="Closed">{s.closes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer className="mast">
        <div className="container">
          <div className="mast__top">
            <p className="mast__word">CareerRadar</p>
            <Link href={signUpHref} className="btn">
              Get started
            </Link>
          </div>
          <nav aria-label="Project" className="mast__links">
            <a href={REPO_URL}>Source</a>
            <a href={`${REPO_URL}/blob/main/docs/architecture.md`}>
              Architecture
            </a>
            <Link href={`${basePath}/sign-in`}>Sign in</Link>
            <span className="legal">Open source under the MIT licence</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/**
 * Puts the landing's theme on <html> while the page is mounted, so the
 * overscroll area and the document's tokens match the page; the app's own
 * screens never see it.
 */
function useDocumentTheme(theme: string) {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.dataset.theme;
    root.dataset.theme = theme;
    return () => {
      if (before === undefined) delete root.dataset.theme;
      else root.dataset.theme = before;
    };
  }, [theme]);
}

/** The bar slides away while scrolling down and returns on the way up. */
function useRetractingBar() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setHidden(y > lastY && y > 160);
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}

/**
 * Which pinned panel sits in the middle of the screen. The page marks the
 * root with a `js` class here, so without script every panel shows at full
 * strength instead of waiting to be activated.
 */
function useActivePanel(count: number) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLLIElement | null>>([]);
  useEffect(() => {
    document.documentElement.classList.add("js");
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const i = refs.current.indexOf(entry.target as HTMLLIElement);
            if (i >= 0) setActive(i);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.slice(0, count).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [count]);
  return [active, refs] as const;
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
