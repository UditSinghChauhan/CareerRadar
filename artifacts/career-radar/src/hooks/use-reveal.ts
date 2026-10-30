import { useLayoutEffect, useRef } from "react";

/**
 * DESIGN.md "Motion": reveal a section the first time it scrolls into view.
 *
 * The element is only hidden ("pending") once this has run and the browser can
 * observe it, so content is never stuck invisible without JavaScript or an
 * IntersectionObserver. The CSS in index.css applies the hidden state only
 * under prefers-reduced-motion: no-preference, so reduced motion shows
 * everything immediately. useLayoutEffect marks it pending before first paint,
 * which avoids a visible-hidden-visible flicker for sections already on screen.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    el.dataset.reveal = "pending";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.reveal = "shown";
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
