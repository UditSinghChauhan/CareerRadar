import { useEffect } from "react";

/**
 * Reveals `[data-reveal]` elements once, when 15% of each is in view, by
 * adding `is-in`. The hidden starting state lives in CSS under `html.js`,
 * which this hook sets, so without script (and under reduced motion, where
 * the CSS drops the transition) content is simply shown.
 */
export function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    document.documentElement.classList.add("js");
    const targets = [...el.querySelectorAll<HTMLElement>("[data-reveal]")];
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      targets.forEach((t) => t.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [root]);
}
