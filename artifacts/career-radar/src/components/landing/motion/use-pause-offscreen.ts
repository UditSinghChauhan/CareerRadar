import { useEffect, type RefObject } from "react";

/**
 * Sets `data-paused` on the element while it is off screen or the tab is
 * hidden, so its ambient CSS loops (landing.css) stop with
 * `animation-play-state: paused`. Runs from the first frame: the attribute
 * is absent until an observer reports the element hidden, so nothing waits
 * on an observer to start. Writes the attribute directly; no React state,
 * no re-render.
 */
export function usePauseOffscreen(ref: RefObject<Element | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let onScreen = true;
    const sync = () =>
      el.toggleAttribute("data-paused", !onScreen || document.hidden);
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting;
            sync();
          });
    io?.observe(el);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      el.removeAttribute("data-paused");
    };
  }, [ref]);
}
