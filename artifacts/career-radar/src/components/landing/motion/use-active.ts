import { useEffect, useState, type RefObject } from "react";

/**
 * True while the element is on screen and the tab is visible. The final
 * band's radar sweep, the page's one loop, runs only while this is true.
 */
export function useActive(
  ref: RefObject<Element | null>,
  { margin = "0px" } = {},
): boolean {
  const [onScreen, setOnScreen] = useState(false);
  const [visible, setVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);

  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  return onScreen && visible;
}
