/**
 * Motion tokens for the landing page. DESIGN.md, Motion, is the source; keep
 * the two in step. framer-motion takes seconds, so durations are in seconds.
 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const DURATION = {
  reveal: 0.5,
} as const;

/** Sibling stagger for reveals, in seconds. */
export const STAGGER = 0.07;

/** The reveal: rise 12px and fade in. Transform and opacity only. */
export const REVEAL_FROM = { opacity: 0, y: 12 } as const;
export const REVEAL_TO = { opacity: 1, y: 0 } as const;
