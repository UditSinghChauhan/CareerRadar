import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { useGrain } from "@/components/landing/use-grain";
import { AUTHOR_NAME, REPO_URL } from "@/components/landing/links";
import { PRIORITY_COMPONENTS } from "@/components/landing/explain-card";
import { BACKEND_TESTS } from "@/components/landing/bento";
import "@/styles/landing.css";

const LIVE_URL = "https://careerradar-34ec.onrender.com";

/** Swatches read their colour from the live tokens, so the sheet cannot drift. */
const TOKENS = [
  { name: "stage", v: "--lp-stage", role: "Page ground" },
  { name: "stage-2", v: "--lp-stage-2", role: "Closing and footer bands" },
  { name: "surface", v: "--lp-surface", role: "Frames and tiles" },
  { name: "surface-2", v: "--lp-surface-2", role: "Chips, tracks" },
  { name: "ink", v: "--lp-ink", role: "Headings, body" },
  { name: "ink-2", v: "--lp-ink-2", role: "Supporting copy" },
  { name: "muted", v: "--lp-muted", role: "Captions, labels" },
  { name: "signal", v: "--lp-signal", role: "Found roles, action, focus" },
] as const;

/** Measured with docs/screenshots/revamp/contrast-stage.mjs. */
const CONTRAST = [
  ["ink on stage", "18.44"],
  ["ink-2 on stage", "11.52"],
  ["muted on surface-2 (the tightest pair)", "5.28"],
  ["signal on stage", "15.07"],
  ["signal-on on signal (button label)", "13.77"],
] as const;

function Figure({
  src,
  alt,
  caption,
  width = 1200,
  height = 750,
}: {
  src: string;
  alt: string;
  caption: string;
  width?: number;
  height?: number;
}) {
  return (
    <figure className="dn-fig">
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
      />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function DesignNotesPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const rootRef = useRef<HTMLDivElement>(null);
  useGrain(rootRef);
  useEffect(() => {
    const previous = document.title;
    document.title = "Design notes · CareerRadar";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="lp dn" ref={rootRef}>
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <LandingNav
        signInHref={`${basePath}/sign-in`}
        signUpHref={`${basePath}/sign-up`}
      />

      <main id="main" className="lp-container dn-main">
        <header className="dn-head">
          <h1 className="lp-display">CareerRadar, a case study</h1>
          <p className="lp-lead dn-summary">
            CareerRadar ranks the ten SDE roles an Indian computer-science
            fresher should apply to each morning, and says why each one ranks
            where it does. I designed and built it end to end: the ranking
            rules, the data pipeline, the app and this landing page.
          </p>
          <dl className="dn-meta">
            <div>
              <dt>Role</dt>
              <dd>Product design, frontend and backend, solo</dd>
            </div>
            <div>
              <dt>Timeline</dt>
              {/* From git history: first commit 2026-07-07. */}
              <dd>July to November 2026</dd>
            </div>
            <div>
              <dt>Stack</dt>
              <dd>
                React 19, Vite, Express 5, PostgreSQL with Drizzle, Clerk,
                framer-motion
              </dd>
            </div>
            <div>
              <dt>Links</dt>
              <dd>
                <a href={LIVE_URL} className="lp-link">
                  Live app
                </a>
                {" · "}
                <a href={REPO_URL} className="lp-link">
                  Source
                </a>
              </dd>
            </div>
          </dl>
        </header>

        <section className="dn-sec" aria-labelledby="dn-problem">
          <h2 id="dn-problem" className="lp-h2">
            Problem and users
          </h2>
          <div className="dn-cols">
            <div>
              <h3 className="lp-h3">The student</h3>
              <p className="lp-body">
                A final-year computer-science student, or a recent graduate,
                looking for SDE roles in India. Their job is to apply to the
                right roles each day without scrolling every board. Most
                postings are not open to a fresher, and the ones that are look
                alike in a feed.
              </p>
            </div>
            <div>
              <h3 className="lp-h3">The visitor</h3>
              <p className="lp-body">
                A recruiter or hiring engineer who gives the landing page under
                a minute. They succeed when they understand what the product
                does and then open the app or the code.
              </p>
            </div>
          </div>
        </section>

        <section className="dn-sec" aria-labelledby="dn-constraints">
          <h2 id="dn-constraints" className="lp-h2">
            Constraints
          </h2>
          <ul className="dn-list">
            <li>
              <strong>No scraping where terms forbid it.</strong> No scrapers
              for LinkedIn, Naukri, Internshala, Unstop or Wellfound. Postings
              come from employers’ own ATS boards and free job-board APIs; a
              bookmarklet captures anything else from a tab the user opened.
            </li>
            <li>
              <strong>No model decides what a student sees.</strong> The fresher
              classifier and the location normalizer are deterministic rules,
              tested title by title. A language model is optional and never
              classifies.
            </li>
            <li>
              <strong>Deadlines are rare.</strong> Sources seldom publish one,
              so the 30%-weighted deadline term scores almost every row the
              same. The interface says so instead of implying it works.
            </li>
            <li>
              <strong>Explainable ranking.</strong> Every rank shows its four
              weighted scores:{" "}
              {PRIORITY_COMPONENTS.map(
                (c) => `${c.name.toLowerCase()} ${c.weight}%`,
              ).join(", ")}
              .
            </li>
            <li>
              <strong>Free hosting.</strong> One Render instance serves the API
              and the app, so the landing must paint without waiting for
              anything slow.
            </li>
          </ul>
        </section>

        <section className="dn-sec" aria-labelledby="dn-concepts">
          <h2 id="dn-concepts" className="lp-h2">
            Three concepts, one synthesis
          </h2>
          <p className="lp-body dn-intro">
            The first landing redesign started from three mockups. Each had a
            gap: A explained nothing after its hero, B opened on a split layout,
            and C had no signature moment. The synthesis took A’s radar hero,
            B’s walkthrough of the real queue and C’s restraint.
          </p>
          <div className="dn-grid3">
            <Figure
              src="/design-notes/concept-a.webp"
              height={374}
              alt="Concept A: a centred headline over a large radar, shown in dark and light."
              caption="A: the radar as the hero object."
            />
            <Figure
              src="/design-notes/concept-b.webp"
              alt="Concept B: a split hero with the radar on the right and a walkthrough below."
              caption="B: a guided walkthrough of the real queue."
            />
            <Figure
              src="/design-notes/concept-c.webp"
              alt="Concept C: a light, restrained page with the queue in a frame."
              caption="C: restraint, and the product in a frame."
            />
          </div>
          <h3 className="lp-h3 dn-sub">Then the revamp</h3>
          <p className="lp-body">
            The synthesis shipped as an honest but flat page: its rules banned
            light, tiles and icons and put a date on every number, so after one
            strong moment it ran about 3,300px of text. The revamp keeps the
            honesty and makes the page one dark scroll story, “From 4,512 to
            ten”: the radar becomes the queue, the queue becomes a card, the
            card becomes an application, and the application lands on a board.
          </p>
        </section>

        <section className="dn-sec" aria-labelledby="dn-before">
          <h2 id="dn-before" className="lp-h2">
            Before and after
          </h2>
          <div className="dn-grid2">
            <Figure
              src="/design-notes/before-hero.webp"
              alt="Before: the hero with a radar disc cut off by a hard horizontal edge."
              caption="Before: the radar ends in a hard crop."
            />
            <Figure
              src="/design-notes/after-hero.webp"
              alt="After: the hero radar lit from behind, with labelled rings and ten glowing roles, fading into the page."
              caption="After: a lit instrument that fades into the stage and moves within a second."
            />
            <Figure
              src="/design-notes/before-text.webp"
              alt="Before: three columns of text under the heading Built to be checked."
              caption="Before: claims as text, with a date on each."
            />
            <Figure
              src="/design-notes/after-bento.webp"
              alt="After: a bento of tiles, each a small working demo: a board, the classifier's rules, a reminder, a dream company and the test count."
              caption="After: each claim shown by a working piece of the product."
            />
          </div>
        </section>

        <section className="dn-sec" aria-labelledby="dn-tokens">
          <h2 id="dn-tokens" className="lp-h2">
            Tokens
          </h2>
          <ul className="dn-swatches">
            {TOKENS.map((t) => (
              <li key={t.name}>
                <span
                  className="dn-swatch"
                  style={{ background: `var(${t.v})` }}
                />
                <span className="dn-swatch__name">{t.name}</span>
                <span className="dn-swatch__role">{t.role}</span>
              </li>
            ))}
          </ul>
          <div className="dn-cols">
            <div>
              <h3 className="lp-h3">Contrast, measured</h3>
              <table className="dn-table">
                <tbody>
                  {CONTRAST.map(([pair, ratio]) => (
                    <tr key={pair}>
                      <th scope="row">{pair}</th>
                      <td className="num">{ratio}:1</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="lp-h3">Type</h3>
              <p className="lp-body">
                One family, Geist, self-hosted with a metric-matched fallback so
                the swap moves no line. Display runs from 48 to 96px at -0.04em;
                body is 17px; nothing smaller than 13px, inside product frames
                too.
              </p>
              <p className="dn-type-sample" aria-hidden="true">
                Ten worth your morning.
              </p>
            </div>
          </div>
        </section>

        <section className="dn-sec" aria-labelledby="dn-motion">
          <h2 id="dn-motion" className="lp-h2">
            Motion principles
          </h2>
          <ul className="dn-list">
            <li>
              <strong>Something meaningful moves in the first second.</strong>{" "}
              The radar’s rings draw in, the field fades in from the centre
              outward, the counts tick up and the ten found roles light in rank
              order before the sweep starts.
            </li>
            <li>
              <strong>Scroll is the timeline, never hijacked.</strong> The
              pinned chapter is a pure function of native scroll, so it plays
              backward exactly as it plays forward.
            </li>
            <li>
              <strong>Only transform, opacity and filter animate.</strong> One
              reveal for content: 600ms, rising 24px and sharpening from an 8px
              blur, staggered 70ms.
            </li>
            <li>
              <strong>Loops run only when seen.</strong> The sweep, the tiles
              and the marquee stop off screen and in a hidden tab.
            </li>
            <li>
              <strong>Reduced motion shows the end state.</strong> No pin, no
              sweep, no loops: every chapter appears as its final frame.
            </li>
          </ul>
        </section>

        <section className="dn-sec" aria-labelledby="dn-a11y">
          <h2 id="dn-a11y" className="lp-h2">
            Accessibility decisions
          </h2>
          <ul className="dn-list">
            <li>
              A lime focus ring for the keyboard only (
              <code>:focus-visible</code>
              ), so a mouse click never leaves a ring behind.
            </li>
            <li>
              Product demonstrations are <code>inert</code> and described in a
              sentence for screen readers; canvases carry a label with the
              counts they draw.
            </li>
            <li>
              On phones the “why this ranks first” explanation is a bottom sheet
              with focus trapped and returned, replacing a tooltip that covered
              the next card.
            </li>
            <li>
              Live counts never show zero as news: an outage keeps the committed
              figures and hides the “Live” mark.
            </li>
            <li>Every pair of text and background passes WCAG AA.</li>
          </ul>
        </section>

        <section className="dn-sec" aria-labelledby="dn-quality">
          <h2 id="dn-quality" className="lp-h2">
            How it is checked
          </h2>
          <p className="lp-body">
            {BACKEND_TESTS.toLocaleString("en-IN")} backend tests run on every
            pull request, the database-facing ones against a real Postgres
            compiled to WebAssembly (PGlite). The landing’s illustrative queue
            and its classifier demo are tested against the production scoring
            and classification code, so the page cannot drift from the product.
          </p>
        </section>

        <section className="dn-sec" aria-labelledby="dn-next">
          <h2 id="dn-next" className="lp-h2">
            Next
          </h2>
          <ul className="dn-list">
            <li>
              Rewrite the app’s own reason lines in the student-facing voice the
              landing now uses.
            </li>
            <li>
              Get real deadlines into the data, so the 30% deadline term starts
              separating roles.
            </li>
            <li>
              Move the app screens to the landing’s type and tokens, so the
              product and the page are one system.
            </li>
            <li>
              Not yet measured: real-user usage and retention. There are no
              users to report, so this page reports none.
            </li>
          </ul>
          <p className="lp-quiet dn-back">
            <Link href="/" className="lp-link">
              Back to the product
            </Link>{" "}
            · Designed and built by {AUTHOR_NAME}
          </p>
        </section>
      </main>

      <LandingFooter signInHref={`${basePath}/sign-in`} />
    </div>
  );
}

export default DesignNotesPage;
