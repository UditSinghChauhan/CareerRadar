import { describe, expect, it } from "vitest";
import { CLEAR_ZONE, cardSize, layoutField, type Rect } from "../field";
import {
  MAX_SPAN_VH,
  cardProgress,
  crossfade,
  flightProgress,
  flightRange,
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
    sharp.forEach((c, i) => expect(c.role.rank).toBe(i + 1));
  });

  it("places all ten ranked cards somewhere in the field", () => {
    const ranks = layout.cards.map((c) => c.role.rank).filter((r) => r > 0);
    expect([...ranks].sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("puts rank 1 just below the button, centred", () => {
    const one = layout.cards.find((c) => c.role.rank === 1)!;
    expect(one.x).toBeCloseTo((zone.l + zone.r) / 2, 0);
    const top = one.y - h / 2;
    expect(top).toBeGreaterThanOrEqual(zone.b + CLEAR_ZONE);
    expect(top).toBeLessThan(zone.b + CLEAR_ZONE + 16);
  });
});

describe("the flight", () => {
  it("spans no more than 120vh of scroll", () => {
    const vh = 900;
    const { start, end } = flightRange(5000, vh);
    expect(end - start).toBeLessThanOrEqual(vh * MAX_SPAN_VH);
    expect(flightProgress(0, { start, end })).toBe(0);
    expect(flightProgress(end, { start, end })).toBe(1);
  });

  it("is scrubbed: the same scroll gives the same place, both ways", () => {
    const range = flightRange(900, 900);
    const there = flightProgress(500, range);
    flightProgress(800, range);
    expect(flightProgress(500, range)).toBe(there);
  });

  it("lands every card by the end, rank 10 last", () => {
    for (let r = 1; r <= 10; r++) expect(cardProgress(1, r)).toBe(1);
    expect(cardProgress(0.5, 1)).toBeGreaterThan(cardProgress(0.5, 10));
  });

  it("hands the card from field to flight to row without a blink", () => {
    for (let e = 0; e <= 1; e += 0.05) {
      const o = crossfade(e);
      expect(Math.max(o.field, o.flying, o.row)).toBeGreaterThan(0.45);
    }
    expect(crossfade(0)).toEqual({ field: 1, flying: 0, row: 0 });
    expect(crossfade(1)).toEqual({ field: 0, flying: 0, row: 1 });
  });
});
