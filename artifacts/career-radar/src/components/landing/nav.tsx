import { useEffect, useState } from "react";
import { Link } from "wouter";
import { LogoMark } from "@/components/logo-mark";

/**
 * Transparent over the hero. After 40px of scroll a translucent stage and a
 * hairline fade in behind it; its colours never change.
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
    const on = () => setScrolled(window.scrollY > 40);
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
          <Link
            href="/design-notes"
            className="lp-nav__link lp-nav__link--wide"
          >
            Design notes
          </Link>
          <Link href={signInHref} className="lp-nav__link">
            Sign in
          </Link>
          <Link href={signUpHref} className="lp-btn2">
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
