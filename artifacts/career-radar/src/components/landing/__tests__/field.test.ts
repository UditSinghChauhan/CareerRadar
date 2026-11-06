import { describe, expect, it } from "vitest";
import {
  CARD_GAP,
  CLEAR_ZONE,
  DRIFT,
  DRIFT_OUT,
  ENTER_MS,
  ENTER_SPAN,
  ENTER_START,
  SPREAD,
  cardSize,
  driftFor,
  entranceDelay,
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
      expect(reach).toBeLessThanOrEqual(DRIFT_OUT * SPREAD[c.depth].reach);
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

describe("the field's ambient drift", () => {
  const layout = layoutField(1440, 900, VIEWS[0].zone, 76);
  const phone = layoutField(390, 920, VIEWS[2].zone, 76);

  it("gives every card its own loop, so no two move together", () => {
    const loops = layout.cards.map((c) => driftFor(c.role.id, c.depth, false));
    // No two cards share both a loop length and a phase: none move together.
    const keys = loops.map(
      (l) => `${l.seconds.toFixed(2)}|${l.phase.toFixed(2)}`,
    );
    expect(new Set(keys).size).toBe(loops.length);
    // The same card always gets the same loop.
    const c = layout.cards[0];
    expect(driftFor(c.role.id, c.depth, false)).toEqual(
      driftFor(c.role.id, c.depth, false),
    );
  });

  it("stays within the brief: 8-16s, 6-14px of travel, under 0.6deg", () => {
    for (const { cards, W } of [layout, phone]) {
      for (const c of cards) {
        const d = driftFor(c.role.id, c.depth, W < 640);
        expect(d.seconds).toBeGreaterThanOrEqual(8);
        expect(d.seconds).toBeLessThanOrEqual(16);
        const travel = 2 * Math.max(Math.abs(d.ax), Math.abs(d.ay));
        expect(travel).toBeGreaterThanOrEqual(6);
        expect(travel).toBeLessThanOrEqual(14);
        expect(Math.abs(d.rotate)).toBeLessThanOrEqual(0.6);
        expect(d.phase).toBeLessThanOrEqual(0);
        expect(-d.phase).toBeLessThan(d.seconds);
      }
    }
  });

  it("drifts far cards slower and less than near ones, for depth", () => {
    const [nearLo] = DRIFT.seconds.near;
    const [, nearHi] = DRIFT.seconds.near;
    const [farLo] = DRIFT.seconds.far;
    expect(farLo).toBeGreaterThanOrEqual(nearHi);
    expect(nearLo).toBeGreaterThanOrEqual(8);
    expect(DRIFT.amp.far).toBeLessThan(DRIFT.amp.near);
    expect(SPREAD.far.reach).toBeLessThan(SPREAD.near.reach);
    expect(SPREAD.far.gone).toBeGreaterThan(SPREAD.near.gone);
  });

  it("never lets two drifting neighbours come within 4px", () => {
    const largest = Math.max(DRIFT.amp.near, DRIFT.amp.mid, DRIFT.amp.far);
    expect(CARD_GAP.wide - 2 * largest).toBeGreaterThanOrEqual(4);
    expect(CARD_GAP.phone - 2 * DRIFT.amp.phone).toBeGreaterThanOrEqual(4);
  });

  it("keeps the clear zone around the text even at the drift's extreme", () => {
    for (const { zone, W, H } of VIEWS) {
      const l = layoutField(W, H, zone, 76);
      const { w, h } = cardSize(W);
      const amp = W < 640 ? DRIFT.amp.phone : DRIFT.amp.near;
      const clear = grow(zone, CLEAR_ZONE - amp - 2);
      const scale = { near: 1, mid: 0.9, far: 0.8 } as const;
      for (const c of l.cards) {
        const s = scale[c.depth];
        const box = {
          l: c.x - (w * s) / 2,
          t: c.y - (h * s) / 2,
          r: c.x + (w * s) / 2,
          b: c.y + (h * s) / 2,
        };
        expect(overlaps(box, clear)).toBe(false);
      }
    }
  });
});

describe("the field's entrance", () => {
  it("brings near cards in first, then mid, then far", () => {
    expect(entranceDelay("near", 7, 0)).toBeLessThan(
      entranceDelay("far", 7, 0),
    );
    expect(entranceDelay("near", 0, 0)).toBeLessThan(
      entranceDelay("mid", 0, 0),
    );
    expect(entranceDelay("mid", 0, 0)).toBeLessThan(entranceDelay("far", 0, 0));
  });

  it("is over within 1.2s when the field is placed by 500ms", () => {
    expect(ENTER_START + ENTER_SPAN).toBeLessThanOrEqual(1200);
    for (const elapsed of [0, 200, 450, 500]) {
      const last = elapsed + entranceDelay("far", 7, elapsed) + ENTER_MS;
      expect(last).toBeLessThanOrEqual(1200);
    }
  });

  it("starts at once, in order, when the field is placed late", () => {
    expect(entranceDelay("near", 0, 900)).toBe(0);
    expect(entranceDelay("near", 1, 900)).toBeGreaterThan(0);
  });
});
