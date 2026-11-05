/**
 * The arithmetic of the ten's flight from the hero's field into "Today's
 * ten" (flight.tsx), kept pure so it can be tested without a browser.
 *
 * The flight is scrubbed by the scroll, not played on a timer: scrolling
 * down carries the cards toward their rows, scrolling up carries them back,
 * and stopping stops them.
 *
 * The choreography, in scroll order:
 *
 *   1. The hero's copy fades and lifts out over the first 11% of a viewport
 *      of scroll. No card that starts above the copy's foot moves before
 *      that, so no card ever passes over the headline, the lead, the button
 *      or "Free and open source".
 *   2. Each row lands as it scrolls fully into view, top to bottom, and
 *      late enough after the row before that the next card crosses that
 *      row only once its own card is home. A card leaves its place
 *      in the field a fifth of a viewport before its row lands, so at most
 *      two or three are ever in the air.
 *   3. The field ranks its cards from the bottom up (field.tsx), so a card
 *      on its way down never meets one still waiting below it, and lands
 *      before the next card reaches its row.
 *
 * Measured with scripts/capture-focus-frames.mjs at 1440x900, every 50px
 * from 0 to 1200: no two cards overlap, no card crosses the copy, and the
 * frame of "Today's ten" never shows without a row in it.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** On-screen movement eases in and out (DESIGN.md, Motion). */
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Hermite smoothstep from a to b. */
export const smooth = (a: number, b: number, t: number) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};

/** The hero's copy is gone after this much scroll, in viewport heights. */
export const COPY_OUT_VH = 0.11;
/** How far the copy lifts as it fades, in px. */
export const COPY_LIFT = 24;
/** A card leaves this long before its row lands, in viewport heights. */
export const LEAD_VH = 0.2;
/** The least scroll between two landings, in viewport heights. */
export const LANDING_GAP_VH = 0.05;
/**
 * The least scroll between two landings, as a share of the earlier row's
 * height: the next card must cross that row, and may only once the card
 * landing in it has gone.
 */
export const LANDING_GAP_ROW = 0.75;
/** A row lands once it is this far inside the viewport, in viewport heights. */
export const LANDING_INSET_VH = 0.045;

/** The copy at this scroll: its opacity and how far it has lifted. */
export function copyOut(
  scrollY: number,
  viewport: number,
): { opacity: number; y: number } {
  const t = smooth(0, viewport * COPY_OUT_VH, scrollY);
  return { opacity: 1 - t, y: t ? -COPY_LIFT * t : 0 };
}

export type FlightPlan = {
  /** scrollY at which each card leaves the field, by rank - 1. */
  depart: number[];
  /** scrollY at which each card is in its row, by rank - 1. */
  land: number[];
};

/** The eased progress's inverse: the share of the time at which easeInOut reaches e. */
export function easeInOutInverse(e: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (easeInOut(mid) < e) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * When each card leaves and lands.
 *
 * `rows` are the rows' bottoms in page coordinates, as laid out before any
 * sticky hold, and their heights. `end`, when given, is the scroll by which
 * every row is due (the end of the sticky stage's hold on wide screens);
 * the gaps below may carry the last few a little past it. `waitForCopy` marks the cards that start above the copy's foot:
 * they leave only once it is gone. `distances` are the cards' path lengths
 * in px and `cardHeight` a flying card's height, when known: a long path
 * reaches the row above its own early, so its card must land later.
 */
export function planFlight({
  rows,
  viewport,
  end,
  waitForCopy,
  distances = [],
  cardHeight = 0,
}: {
  rows: Array<{ bottom: number; height: number }>;
  viewport: number;
  end?: number;
  waitForCopy: boolean[];
  distances?: number[];
  cardHeight?: number;
}): FlightPlan {
  const vh = viewport;
  const copyGone = vh * COPY_OUT_VH;
  const lead = vh * LEAD_VH;
  const land: number[] = [];
  let prev = -Infinity;
  let prevHeight = 0;
  rows.forEach(({ bottom, height }, i) => {
    // While the card before lands, this one must still be further from
    // home than the row above and its own height.
    const clear = prevHeight + cardHeight;
    const dist = distances[i] ?? 0;
    const crossing =
      clear > 0 && dist > 0
        ? lead * (1 - easeInOutInverse(Math.max(0, 1 - clear / dist)))
        : 0;
    const gap = Math.max(
      vh * LANDING_GAP_VH,
      prevHeight * LANDING_GAP_ROW,
      crossing,
    );
    // A row is due once it is in view, or at `end`, whichever is first;
    // the gap is never given up to meet `end`, since a card follows its
    // row wherever it is.
    let due = bottom - vh + vh * LANDING_INSET_VH;
    if (end !== undefined) due = Math.min(due, end);
    let at = Math.max(prev + gap, due);
    // Never before the copy has gone and the card has had room to move.
    at = Math.max(at, copyGone + lead * 0.5);
    land.push(at);
    prev = at;
    prevHeight = height;
  });
  const depart = land.map((at, i) => {
    let from = at - lead;
    if (waitForCopy[i]) from = Math.max(from, copyGone);
    return Math.max(0, Math.min(from, at - 1));
  });
  return { depart, land };
}

/** How far along its path one card is at this scroll, 0 to 1, eased. */
export function cardProgress(
  scrollY: number,
  plan: FlightPlan,
  index: number,
): number {
  const from = plan.depart[index];
  const to = plan.land[index];
  return easeInOut(clamp01((scrollY - from) / (to - from)));
}

/**
 * Opacity of the three things that share one card's identity: the card in
 * the field, the flying copy, and the row it becomes. The copy takes over
 * from the field card in the first tenth, which also sharpens the ranked
 * cards that rest in the blurred layer, and hands over to the row only in
 * the last 5% of its path, and never before it is within 8px of home
 * (`distance` is the whole path's length in px; rows are 6px apart), so a
 * fading card never smears across another row. The sum never drops, so the card never
 * blinks.
 */
export function crossfade(
  e: number,
  distance = 0,
): {
  field: number;
  flying: number;
  row: number;
} {
  const takeOver = smooth(0, 0.1, e);
  const landFrom = distance > 0 ? Math.max(0.95, 1 - 8 / distance) : 0.95;
  const land = smooth(landFrom, 1, e);
  return { field: 1 - takeOver, flying: takeOver * (1 - land), row: land };
}

/** Linear interpolation. */
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
