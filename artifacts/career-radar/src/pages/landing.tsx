import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTheme } from "next-themes";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

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

const PIPELINE = ["Saved", "Applied", "OA", "Interview", "Offer"] as const;

export function LandingPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary/20">
      <header className="sticky top-0 z-50 h-14 border-b border-border/60 bg-surface/70 backdrop-blur-[20px]">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full font-semibold tracking-tight"
          >
            <LogoMark className="h-5 w-5 text-primary" />
            CareerRadar
          </Link>
          <nav
            aria-label="Account"
            className="flex items-center gap-1 sm:gap-2"
          >
            <ThemeToggle />
            <Link
              href={`${basePath}/sign-in`}
              className="rounded-full px-3 py-2 text-sm font-medium transition-colors hover:bg-accent"
            >
              Sign in
            </Link>
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href={`${basePath}/sign-up`}>Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <Hero signUpHref={`${basePath}/sign-up`} />

        <FeatureSection
          tone="surface"
          title="See why each role made the list."
          body="Every row breaks its score into four weighted parts and explains each one in plain language. You can check the ranking instead of trusting it."
        >
          <dl className="w-full space-y-5">
            {PRIORITY_COMPONENTS.map((c) => (
              <div key={c.name}>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="font-medium">{c.name}</dt>
                  <dd className="text-sm tabular-nums text-muted-foreground">
                    {c.weight}%
                  </dd>
                </div>
                <div
                  className="mt-2 h-2 rounded-full bg-background"
                  aria-hidden="true"
                >
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${c.weight * 2.5}%` }}
                  />
                </div>
                <p className="mt-2 text-caption text-muted-foreground">
                  {c.detail}
                </p>
              </div>
            ))}
          </dl>
        </FeatureSection>

        <FeatureSection
          tone="background"
          title="Only roles a fresher can apply to."
          body="A deterministic classifier reads each title and description for seniority, required experience and graduation batch. No language model decides what you see."
        >
          <figure className="w-full">
            <p className="text-display-sm font-semibold tabular-nums md:text-display">
              2,109
              <span className="text-muted-foreground"> of 4,512</span>
            </p>
            <figcaption className="mt-3 max-w-[420px] text-caption text-muted-foreground">
              active postings were plausibly open to freshers, from employer
              career sites and job-board APIs synced every six hours. Measured
              16 September 2026.
            </figcaption>
          </figure>
        </FeatureSection>

        <FeatureSection
          tone="surface"
          title="Deadlines come to you."
          body="Save a role and you get a reminder 72 hours and again 24 hours before it closes. Track every application on one board, from the day you save it to the offer."
        >
          <ol className="flex w-full flex-wrap items-center gap-x-2 gap-y-3 text-sm font-medium">
            {PIPELINE.map((stage, i) => (
              <li key={stage} className="flex items-center gap-2">
                <span className="rounded-full border border-border bg-background px-4 py-2">
                  {stage}
                </span>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
        </FeatureSection>

        <section className="px-4 py-16 text-center sm:px-6 md:py-20 xl:py-30">
          <h2 className="text-h2-sm font-semibold text-balance md:text-h2">
            Start with today's ten.
          </h2>
          <div className="mt-8 flex flex-col items-center gap-4">
            <Button asChild size="lg">
              <Link href={`${basePath}/sign-up`}>Get started</Link>
            </Button>
            <a
              href={REPO_URL}
              className="inline-flex items-center gap-1 rounded-full text-sm font-medium text-primary hover:underline"
            >
              Read the source on GitHub
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-8 text-caption text-muted-foreground sm:px-6">
          <span>CareerRadar</span>
          <nav aria-label="Project" className="flex gap-6">
            <a href={REPO_URL} className="rounded-full hover:text-foreground">
              Source
            </a>
            <a
              href={`${REPO_URL}/blob/main/docs/architecture.md`}
              className="rounded-full hover:text-foreground"
            >
              Architecture
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Hero({ signUpHref }: { signUpHref: string }) {
  const { resolvedTheme } = useTheme();
  // One image per theme, and only the visible one is requested.
  const image =
    resolvedTheme === "dark"
      ? "landing/queue-dark.webp"
      : "landing/queue-light.webp";

  return (
    <section className="px-4 pt-16 pb-16 text-center sm:px-6 md:pt-24 md:pb-20 xl:pt-30 xl:pb-30">
      <h1 className="mx-auto max-w-[900px] text-display-sm font-semibold text-balance md:text-display">
        Ten roles worth applying to, every morning.
      </h1>
      <p className="mx-auto mt-6 max-w-[680px] text-body-sm text-muted-foreground md:text-body">
        CareerRadar collects SDE postings from public job APIs, removes the ones
        a fresher cannot apply to, and ranks the rest with the reason for each
        rank.
      </p>
      <Button asChild size="lg" className="mt-8">
        <Link href={signUpHref}>Get started</Link>
      </Button>
      <div className="mx-auto mt-12 max-w-[1000px] overflow-hidden rounded-[20px] border border-transparent shadow-card md:mt-16 dark:border-border dark:shadow-none">
        <img
          src={`${import.meta.env.BASE_URL}${image}`}
          width={1916}
          height={1374}
          alt="Today's Queue: ranked internship roles from Microsoft, Flipkart, Swiggy and Adobe, each with its score split into relevance, deadline, freshness and dream-company parts."
          // Below md the full card would shrink past legibility, so it keeps
          // a readable width and the right edge (Apply buttons) is cropped.
          className="block h-auto w-full min-w-[560px] md:min-w-0"
          fetchPriority="high"
        />
      </div>
    </section>
  );
}

function FeatureSection({
  tone,
  title,
  body,
  children,
}: {
  tone: "surface" | "background";
  title: string;
  body: string;
  children: ReactNode;
}) {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section
      className={cn(
        "px-4 py-16 sm:px-6 md:py-20 xl:py-30",
        tone === "surface" ? "bg-surface" : "bg-background",
      )}
    >
      <div
        ref={ref}
        className="mx-auto grid max-w-[1200px] items-center gap-10 md:grid-cols-2 md:gap-16"
      >
        <div>
          <h2 className="text-h2-sm font-semibold text-balance md:text-h2">
            {title}
          </h2>
          <p className="mt-4 max-w-[520px] text-body-sm text-muted-foreground md:text-body">
            {body}
          </p>
        </div>
        <div className="flex">{children}</div>
      </div>
    </section>
  );
}

/** The CareerRadar mark (public/logo.svg), drawn in the current text colour. */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M128 24C70.5624 24 24 70.5624 24 128C24 185.438 70.5624 232 128 232C185.438 232 232 185.438 232 128C232 70.5624 185.438 24 128 24ZM128 216C79.4183 216 40 176.582 40 128C40 79.4183 79.4183 40 128 40C176.582 40 216 79.4183 216 128C216 176.582 176.582 216 128 216Z" />
      <path d="M128 72C97.0721 72 72 97.0721 72 128C72 158.928 97.0721 184 128 184C158.928 184 184 158.928 184 128C184 97.0721 158.928 72 128 72ZM128 168C105.909 168 88 150.091 88 128C88 105.909 105.909 88 128 88C150.091 88 168 105.909 168 128C168 150.091 150.091 168 128 168Z" />
      <path d="M128 112C119.163 112 112 119.163 112 128C112 136.837 119.163 144 128 144C136.837 144 144 136.837 144 128C144 119.163 136.837 112 128 112Z" />
    </svg>
  );
}
