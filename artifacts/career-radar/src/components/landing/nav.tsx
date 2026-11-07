import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { LogoMark } from "@/components/logo-mark";

/** The page's sections, in reading order. */
export const NAV_SECTIONS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
] as const;

type Section = (typeof NAV_SECTIONS)[number]["href"];

/**
 * The section that holds the line 45% down the viewport, from an
 * IntersectionObserver (no scroll listener). The sections arrive with the
 * below-the-fold chunk, so this waits for them with a MutationObserver.
 */
function useActiveSection(): Section | null {
  const [active, setActive] = useState<Section | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const ids = NAV_SECTIONS.map((s) => s.href.slice(1));
    const inView = new Set<string>();
    let io: IntersectionObserver | null = null;
    const start = () => {
      const els = ids.map((id) => document.getElementById(id));
      if (els.some((e) => !e)) return false;
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) inView.add(e.target.id);
            else inView.delete(e.target.id);
          }
          const id = ids.find((i) => inView.has(i));
          setActive(id ? (`#${id}` as Section) : null);
        },
        { rootMargin: "-45% 0px -54% 0px" },
      );
      els.forEach((e) => io!.observe(e!));
      return true;
    };
    if (start()) return () => io?.disconnect();
    const mo = new MutationObserver(() => {
      if (start()) mo.disconnect();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io?.disconnect();
    };
  }, []);
  return active;
}

/**
 * A plain transparent bar. After 24px of scroll it takes the canvas colour
 * and a bottom hairline. A short ink line under the section links slides to
 * the section being read (transform only), and fades out above the first.
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

  const active = useActiveSection();
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  // Where the indicator sits: written straight to its transform, from the
  // active link's box, when the section changes or the bar resizes.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const bar = barRef.current;
    if (!nav || !bar) return;
    const place = () => {
      const link = active
        ? nav.querySelector<HTMLElement>(`a[href="${active}"]`)
        : null;
      if (!link || !link.offsetWidth) {
        bar.style.opacity = "0";
        return;
      }
      const to = `translateX(${link.offsetLeft}px) scaleX(${link.offsetWidth})`;
      // Appearing, it fades in where it belongs; only a move slides.
      if (bar.style.opacity !== "1") {
        bar.style.transition = "none";
        bar.style.transform = to;
        void bar.offsetWidth;
        bar.style.transition = "";
      }
      bar.style.opacity = "1";
      bar.style.transform = to;
    };
    place();
    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    ro?.observe(nav);
    return () => ro?.disconnect();
  }, [active]);

  return (
    <header className={scrolled ? "lp-nav is-scrolled" : "lp-nav"}>
      <div className="lp-container lp-nav__in">
        <Link href="/" className="lp-word" aria-label="CareerRadar, home">
          <LogoMark />
          <span translate="no">CareerRadar</span>
        </Link>
        <nav aria-label="Main" className="lp-nav__r" ref={navRef}>
          {NAV_SECTIONS.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className={
                active === s.href
                  ? "lp-nav__link lp-nav__link--wide is-active"
                  : "lp-nav__link lp-nav__link--wide"
              }
              aria-current={active === s.href ? "true" : undefined}
            >
              {s.label}
            </a>
          ))}
          <span className="lp-nav__bar" ref={barRef} aria-hidden="true" />
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
