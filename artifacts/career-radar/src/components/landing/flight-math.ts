/**
 * The arithmetic of the ten's flight from the hero's field into "Today's
 * ten" (flight.tsx), kept pure so it can be tested without a browser.
 *
 * The flight is scrubbed by the scroll, not played on a timer: scrolling
 * down carries the cards toward their rows, scrolling up carries them back,
 * and stopping stops them. It spans at most 120vh of scroll.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** On-screen movement eases in and out (DESIGN.md, Motion). */
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/** The longest stretch of scroll the flight may use, in viewport heights. */
export const MAX_SPAN_VH = 1.2;

/** Where the flight starts and ends, in scrollY. */
export function flightRange(
  /** scrollY at which the queue card reaches its resting place. */
  rest: number,
  viewport: number,
): { start: number; end: number } {
  const start = Math.round(viewport * 0.04);
  const end = Math.max(
    start + 1,
    Math.min(rest, start + viewport * MAX_SPAN_VH),
  );
  return { start, end };
}

/** 0 at the top of the page, 1 once the queue is at rest. */
export function flightProgress(
  scrollY: number,
  range: { start: number; end: number },
): number {
  return clamp01((scrollY - range.start) / (range.end - range.start));
}

/** Each rank leaves a little after the one before it. */
const STAGGER = 0.02;

/** How far along its path one card is, 0 to 1, eased. */
export function cardProgress(p: number, rank: number): number {
  const delay = (rank - 1) * STAGGER;
  const span = 1 - 9 * STAGGER;
  return easeInOut(clamp01((p - delay) / span));
}

/**
 * Opacity of the three things that share one card's identity: the card in
 * the field, the flying copy, and the row it becomes. The copy takes over
 * from the field card in the first tenth, which also sharpens the two
 * ranked cards that rest in the blurred layer, and hands over to the row in
 * the last fifth. The sum never drops, so the card never blinks.
 */
export function crossfade(e: number): {
  field: number;
  flying: number;
  row: number;
} {
  const takeOver = smooth(0, 0.1, e);
  const land = smooth(0.8, 1, e);
  return { field: 1 - takeOver, flying: takeOver * (1 - land), row: land };
}

/** Linear interpolation. */
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
