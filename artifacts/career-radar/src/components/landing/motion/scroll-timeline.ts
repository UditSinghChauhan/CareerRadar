/**
 * True where the browser runs CSS scroll-driven animations
 * (`animation-timeline: view()` with `animation-range`). Matches the
 * `@supports` block in landing.css: where this is true, CSS drives every
 * scroll-linked motion on the compositor and no framer-motion scroll value
 * is created; where it is false, framer-motion `useScroll`/`useTransform`
 * values drive the same motion. Nothing is ever moved from a scroll event.
 */
export const SCROLL_TIMELINE =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("animation-timeline: view()") &&
  CSS.supports("animation-range: cover");
