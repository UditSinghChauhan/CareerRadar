import { describe, expect, it } from "vitest";
import {
  CARD_GAP,
  CLEAR_ZONE,
  cardSize,
  layoutField,
  type Rect,
} from "../field";
import {
  COPY_OUT_VH,
  LEAD_VH,
  cardProgress,
  copyOut,
  crossfade,
  easeInOut,
  planFlight,
} from "../flight-math";

/** The hero's text block as measured in Chromium at each width. */
const VIEWS: Array<{ name: string; W: number; H: number; zone: Rect }> = [
  { name: "1440", W: 1440, H: 900, zone: { l: 260, t: 304, r: 1180, b: 620 } },
  { name: "768", W: 768, H: 1080, zone: { l: 0, t: 419, r: 768, b: 685 } },
  { name: "390", W: 390, H: 920, zone: { l: 0, t: 319, r: 390, b: 625 } },
];

const grow = (z: Rect, by: number): Rect => ({
  l: z.l - by,
  t: z.t - by,
  r: z.r + by,
  b: z.b + by,
});
const overlaps = (a: Rect, b: Rect) =>
  a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

describe.each(VIEWS)("the hero's field at $name", ({ W, H, zone }) => {
  const layout = layoutField(W, H, zone, 76);
  const { w, h } = cardSize(W);
  const box = (x: number, y: number, s: number): Rect => ({
    l: x - (w * s) / 2,
    t: y - (h * s) / 2,
    r: x + (w * s) / 2,
    b: y + (h * s) / 2,
  });
  const scale = { near: 1, mid: 0.9, far: 0.8 } as const;

  it("keeps a clear zone of at least 48px around the text", () => {
    const clear = grow(zone, CLEAR_ZONE);
    for (const c of layout.cards) {
      expect(overlaps(box(c.x, c.y, scale[c.depth]), clear)).toBe(false);
    }
  });

  it("shows at most eight sharp cards, six on a phone", () => {
    const sharp = layout.cards.filter((c) => c.depth === "near");
    expect(sharp.length).toBeLessThanOrEqual(W < 640 ? 6 : 8);
    // The sharp ones are the first of the day's ten.
    expect(sharp.map((c) => c.role.rank).sort((a, b) => a - b)).toEqual(
      sharp.map((_, i) => i + 1),
    );
  });

  it("places all ten ranked cards somewhere in the field", () => {
    const ranks = layout.cards.map((c) => c.role.rank).filter((r) => r > 0);
    expect([...ranks].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  // The rows fill from the top as the list rises, so the card that leaves
  // first must have nothing still waiting below it (flight-math.ts).
  it("ranks the sharp cards from the bottom up", () => {
    const sharp = layout.cards
      .filter((c) => c.depth === "near")
      .sort((a, b) => a.role.rank - b.role.rank);
    for (let i = 1; i < sharp.length; i++) {
      expect(sharp[i].y).toBeLessThanOrEqual(sharp[i - 1].y);
    }
  });

  it("gives the soft ranked cards the highest places of the middle layer", () => {
    const mid = layout.cards.filter((c) => c.depth === "mid");
    const ranked = mid.filter((c) => c.role.rank > 0);
    const others = mid.filter((c) => c.role.rank === 0);
    const lowestRanked = Math.max(...ranked.map((c) => c.y));
    for (const c of others) expect(c.y).toBeGreaterThanOrEqual(lowestRanked);
  });

  it("keeps at least 8px between any two sharp cards", () => {
    const sharp = layout.cards
      .filter((c) => c.depth === "near")
      .map((c) => box(c.x, c.y, 1));
    expect(W < 640 ? CARD_GAP.phone : CARD_GAP.wide).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < sharp.length; i++) {
      for (let j = i + 1; j < sharp.length; j++) {
        expect(overlaps(grow(sharp[i], 4), grow(sharp[j], 4))).toBe(false);
      }
    }
  });
});

describe("the flight", () => {
  const vh = 900;
  // The rows of "Today's ten" at 1440x900, measured in Chromium: four full
  // rows, then six one-line rows, their bottoms in page coordinates.
  const rows = [1144, 1253, 1362, 1471, 1517, 1563, 1609, 1655, 1701, 1747].map(
    (bottom, i) => ({ bottom, height: i < 4 ? 103 : 40 }),
  );
  const waitForCopy = [
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    true,
    true,
    true,
  ];
  // The stage sticks at 900 and holds for 15vh (135px).
  const end = 900 + 135;
  const plan = planFlight({ rows, viewport: vh, end, waitForCopy });

  it("lands the rows in order, each once it is in view, all by the hold's end", () => {
    for (let i = 0; i < 10; i++) {
      if (i > 0) expect(plan.land[i]).toBeGreaterThan(plan.land[i - 1]);
      expect(plan.land[i]).toBeGreaterThanOrEqual(
        Math.min(rows[i].bottom - vh, end),
      );
      expect(plan.land[i]).toBeLessThanOrEqual(end);
    }
  });

  it("leaves a full row's card time to land before the next crosses it", () => {
    for (let i = 1; i < 10; i++) {
      expect(plan.land[i] - plan.land[i - 1]).toBeGreaterThanOrEqual(
        0.75 * rows[i - 1].height,
      );
    }
  });

  it("moves no card from above the copy until the copy has gone", () => {
    const gone = vh * COPY_OUT_VH;
    expect(copyOut(gone, vh).opacity).toBe(0);
    expect(copyOut(0, vh)).toEqual({ opacity: 1, y: 0 });
    waitForCopy.forEach((wait, i) => {
      if (wait) expect(plan.depart[i]).toBeGreaterThanOrEqual(gone);
      expect(plan.depart[i]).toBeLessThan(plan.land[i]);
      expect(plan.land[i] - plan.depart[i]).toBeLessThanOrEqual(vh * LEAD_VH);
    });
  });

  // A 2560x1440 screen shows the whole list at once, so every row could
  // land on the shortest gap; a card on a long diagonal path would then
  // still be crossing the row above while that row's card landed.
  it("lands a long path's card late enough to clear the row above", () => {
    const wide = planFlight({
      rows: rows.map((r) => ({ ...r, bottom: r.bottom - 600 })),
      viewport: 1440,
      end: 1100,
      waitForCopy: rows.map(() => false),
      distances: rows.map(() => 970),
      cardHeight: 73,
    });
    for (let i = 1; i < 10; i++) {
      const at = wide.land[i - 1];
      const t = (at - wide.depart[i]) / (wide.land[i] - wide.depart[i]);
      const left = (1 - easeInOut(Math.min(1, Math.max(0, t)))) * 970;
      expect(left).toBeGreaterThanOrEqual(rows[i - 1].height + 73 - 0.5);
    }
  });

  it("is scrubbed: the same scroll gives the same place, both ways", () => {
    const there = cardProgress(500, plan, 3);
    cardProgress(800, plan, 3);
    expect(cardProgress(500, plan, 3)).toBe(there);
    expect(cardProgress(0, plan, 3)).toBe(0);
    expect(cardProgress(plan.land[3], plan, 3)).toBe(1);
  });

  it("hands the card from field to flight to row without a blink", () => {
    for (const distance of [0, 48, 600, 1600]) {
      for (let e = 0; e <= 1; e += 0.01) {
        const o = crossfade(e, distance);
        expect(Math.max(o.field, o.flying, o.row)).toBeGreaterThan(0.45);
      }
      expect(crossfade(0, distance)).toEqual({ field: 1, flying: 0, row: 0 });
      expect(crossfade(1, distance)).toEqual({ field: 0, flying: 0, row: 1 });
    }
  });

  it("starts the hand-over to the row only within 8px of home", () => {
    const distance = 1600;
    for (let e = 0; e < 1; e += 0.001) {
      if (crossfade(e, distance).row > 0) {
        expect((1 - e) * distance).toBeLessThanOrEqual(8.01);
      }
    }
  });
});
