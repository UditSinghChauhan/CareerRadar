import { useEffect, useState } from "react";
import { Link } from "wouter";
import { LogoMark } from "@/components/logo-mark";

/** The page's sections, in reading order. */
export const NAV_SECTIONS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
] as const;

/**
 * A plain transparent bar. After 24px of scroll it takes the canvas colour
 * and a bottom hairline.
 */
export function LandingNav({
  signInHref,
  signUpHref,
}: {
  signInHref: string;
  signUpHref: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header className={scrolled ? "lp-nav is-scrolled" : "lp-nav"}>
      <div className="lp-container lp-nav__in">
        <Link href="/" className="lp-word" aria-label="CareerRadar, home">
          <LogoMark />
          <span translate="no">CareerRadar</span>
        </Link>
        <nav aria-label="Main" className="lp-nav__r">
          {NAV_SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="lp-nav__link lp-nav__link--wide"
            >
              {s.label}
            </a>
          ))}
          <Link href={signInHref} className="lp-nav__link">
            Sign in
          </Link>
          <Link href={signUpHref} className="lp-btn lp-btn--nav">
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
