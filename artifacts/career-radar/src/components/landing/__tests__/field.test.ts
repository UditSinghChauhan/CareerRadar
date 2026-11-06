import { describe, expect, it } from "vitest";
import {
  CARD_GAP,
  CLEAR_ZONE,
  DRIFT_OUT,
  cardSize,
  layoutField,
  outward,
  type Rect,
} from "../field";

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

  it("puts rank 1 just under the button", () => {
    const one = layout.cards.find((c) => c.role.rank === 1)!;
    expect(one.depth).toBe("near");
    expect(one.y).toBeGreaterThan(zone.b);
  });

  // The scroll fade moves each card straight out from the centre, at most
  // 60px, so a card outside the clear zone never crosses into the text, and
  // never past the hero's edge, which would cut it.
  it("drifts every card away from the text, never across it or out of the hero", () => {
    const clear = grow(zone, CLEAR_ZONE);
    for (const c of layout.cards) {
      const { ux, uy, reach } = outward(layout, c);
      expect(Math.hypot(ux, uy)).toBeCloseTo(1, 6);
      expect(reach).toBeGreaterThanOrEqual(0);
      expect(reach).toBeLessThanOrEqual(DRIFT_OUT);
      const start = box(c.x, c.y, scale[c.depth]);
      for (let k = 0; k <= 1; k += 0.1) {
        const at = box(
          c.x + ux * reach * k,
          c.y + uy * reach * k,
          scale[c.depth],
        );
        expect(overlaps(at, clear)).toBe(false);
        if (start.b <= H) expect(at.b).toBeLessThanOrEqual(H);
      }
    }
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
