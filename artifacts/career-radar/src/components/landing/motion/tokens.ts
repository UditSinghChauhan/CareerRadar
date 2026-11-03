/**
 * Motion tokens for the landing page. DESIGN.md, Motion, is the source; keep
 * the two in step. framer-motion takes seconds, so durations are in seconds.
 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  micro: 0.15,
  short: 0.25,
  reveal: 0.5,
  count: 0.9,
} as const;

/** Sibling stagger for reveals, in seconds. */
export const STAGGER = 0.07;

/** The reveal: rise 12px and fade in. Transform and opacity only. */
export const REVEAL_FROM = { opacity: 0, y: 12 } as const;
export const REVEAL_TO = { opacity: 1, y: 0 } as const;

/** cubic-bezier(0.16, 1, 0.3, 1) for code that animates outside framer-motion. */
export function easeOut(t: number): number {
  // Solved numerically once per call: four Newton steps on x(s) = t.
  const [x1, y1, x2, y2] = EASE_OUT;
  const bez = (s: number, a: number, b: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3;
  const dbez = (s: number, a: number, b: number) =>
    3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s ** 2;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let s = t;
  for (let i = 0; i < 4; i++) {
    const d = dbez(s, x1, x2);
    if (Math.abs(d) < 1e-6) break;
    s -= (bez(s, x1, x2) - t) / d;
    s = Math.min(1, Math.max(0, s));
  }
  return bez(s, y1, y2);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
}
