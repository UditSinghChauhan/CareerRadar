import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import {
  motion,
  styleEffect,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { RoleCard } from "./role-card";
import { FIELD_ROLES, RANKED, type SampleRole } from "./sample-roles";

/**
 * The hero's field: faint concentric rings (the radar, as layout) with small
 * white sample job cards placed on them at three depths. Far cards are
 * smaller, softer and paler; near cards are sharp. At most eight cards are
 * sharp on a wide screen and six on a phone: the first eight (or six) of the
 * day's ten, which carry a rank tag. The other ranked cards sit, blurred, in
 * the middle layer with the rest of the field.
 *
 * No card comes within 48px of the headline, the lead, the button or "Free
 * and open source": the layout is measured from the hero's text block and
 * every spot that would break that, overlap the navigation or another card
 * is skipped. The sharp cards fill the rings from just below the button,
 * clockwise and outward, in rank order: rank 1 sits under the button.
 *
 * Motion is transform and opacity only, and only the hero's scroll fade
 * (HeroField): as the hero leaves, every card drifts straight out from the
 * centre, at most 60px, so none ever crosses the text, and the field fades
 * out. The cards never fly anywhere; "Today's ten" has its own rows. The
 * blur is a fixed property of each depth layer and never animates.
 */

type Depth = "far" | "mid" | "near";
type Placed = { role: SampleRole; depth: Depth; x: number; y: number };
type Layout = {
  W: number;
  H: number;
  cx: number;
  cy: number;
  rings: number[];
  cards: Placed[];
};

const DEPTH_SCALE: Record<Depth, number> = { far: 0.8, mid: 0.9, near: 1 };

/** The hero's copy fades out and lifts this far by COPY_GONE of the hero's scroll. */
export const COPY_LIFT = 16;
export const COPY_GONE = 0.5;

/** The clear zone around the hero's text block. DESIGN.md, Sections. */
export const CLEAR_ZONE = 48;

/** Card size per breakpoint. Two lines of title fit without an ellipsis. */
export function cardSize(W: number) {
  return W < 640 ? { w: 176, h: 58 } : { w: 248, h: 68 };
}

/**
 * The space kept between cards. Phone cards sit in close rows and do not
 * idle (landing.css), so 10px is what a visitor sees: never under 8px.
 */
export const CARD_GAP = { phone: 10, wide: 16 } as const;

/** mulberry32, so every visitor sees the same field. */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rect = { l: number; t: number; r: number; b: number };
const overlaps = (a: Rect, b: Rect) =>
  a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

/** Pure: where each card goes for a field of this size around this text block. */
export function layoutField(
  W: number,
  H: number,
  zone: Rect,
  navH: number,
): Layout {
  const phone = W < 640;
  const tablet = !phone && W < 1024;
  const counts: Record<Depth, number> = phone
    ? { near: 6, mid: 6, far: 0 }
    : tablet
      ? { near: 8, mid: 6, far: 4 }
      : { near: 8, mid: 8, far: 8 };
  const { w: cardW, h: cardH } = cardSize(W);
  const gap = phone ? CARD_GAP.phone : CARD_GAP.wide;
  const cx = (zone.l + zone.r) / 2;
  const cy = (zone.t + zone.b) / 2;
  const clear: Rect = {
    l: zone.l - CLEAR_ZONE,
    t: zone.t - CLEAR_ZONE,
    r: zone.r + CLEAR_ZONE,
    b: zone.b + CLEAR_ZONE,
  };

  // Rings from just outside the text block to past the corners.
  const r0 = Math.max(90, (zone.b - zone.t) / 2 + (phone ? 40 : 70));
  const step = phone ? 74 : 150;
  const reach = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  const rings: number[] = [];
  for (let r = r0; r < reach + step; r += step) rings.push(r);

  type Spot = { x: number; y: number; ring: number; k: number; t: number };
  const rand = seeded(20261103 + Math.round(W / 40));
  const candidates: Spot[] = [];
  // Rank 1's spot: centred, just below the clear zone, under the button.
  const anchor = { x: cx, y: clear.b + cardH / 2 + 4 };
  // Position along a sweep that starts below the text and turns clockwise,
  // drifting outward a little per ring, like the radar's own sweep: the
  // order the ranks are read in.
  const spiral = (x: number, y: number, ring: number) => {
    const a = Math.atan2(y - cy, x - cx);
    const turn =
      (((a - Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return turn / (Math.PI * 2) + ring * 0.1;
  };
  candidates.push({ ...anchor, ring: -1, k: 0, t: -1 });
  rings.forEach((r, ring) => {
    const n = Math.max(8, Math.round((Math.PI * 2 * r) / (phone ? 70 : 110)));
    const offset = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      candidates.push({ x, y, ring, k: rand(), t: spiral(x, y, ring) });
    }
  });

  // When the text spans most of the width (phones, tablets) there is room
  // only above and below it, so the cards sit in staggered rows there,
  // still drawn over the same rings. Places are taken outward from the
  // button, below first, then above.
  if (zone.r - zone.l > W * 0.7) {
    // Two staggered columns on phones and tablets; a wide but short screen
    // (a 1280x720 laptop) takes as many as fit, so the ten find places.
    const fit = Math.floor((W - 16) / (cardW + gap));
    const cols = phone
      ? [0.26, 0.74]
      : fit <= 2
        ? [0.3, 0.7]
        : Array.from({ length: fit }, (_, i) => (i + 0.5) / fit);
    candidates.length = 0;
    candidates.push({ ...anchor, ring: -1, k: 0, t: -1 });
    const rowsIn = (from: number, to: number, below: boolean) => {
      for (let y = from + cardH / 2; y + cardH / 2 <= to; y += cardH + gap) {
        const k = Math.round(y / (cardH + gap)) % 2 ? 1 : -1;
        for (const fx of cols) {
          const x = W * fx + k * 10;
          const d = Math.abs(y - anchor.y) + Math.abs(x - anchor.x) * 0.2;
          candidates.push({
            x,
            y,
            ring: fx < 0.5 ? 0 : 1,
            k: rand(),
            t: (below ? 0 : 1000) + d,
          });
        }
      }
    };
    rowsIn(anchor.y + cardH / 2 + gap + 4, H - 8, true);
    rowsIn(navH, clear.t, false);
  }

  const placed: Placed[] = [];
  const boxes: Rect[] = [];
  const nearCount = counts.near;
  const roles = {
    near: RANKED.slice(0, nearCount),
    // The ranked cards that are not sharp go first into the middle layer.
    mid: [...RANKED.slice(nearCount), ...FIELD_ROLES],
  };
  const order: Depth[] = ["near", "mid", "far"];
  for (const depth of order) {
    const s = DEPTH_SCALE[depth];
    const w = cardW * s;
    const h = cardH * s;
    // Near cards follow the spiral; mid cards prefer the second ring; far
    // cards sit on the outer rings.
    const sorted =
      depth === "near"
        ? [...candidates].sort((a, b) => a.t - b.t)
        : [...candidates]
            .filter((c) => c.ring >= 0)
            .sort((a, b) => {
              const pref = (ring: number) =>
                depth === "mid" ? Math.abs(ring - 2) : -ring;
              return pref(a.ring) - pref(b.ring) || a.k - b.k;
            });
    // Near and mid cards stay whole on screen; far ones may crop at the edge.
    const spill = depth === "far" ? w * 0.4 : depth === "mid" ? w * 0.15 : 0;
    let left = counts[depth];
    for (const c of sorted) {
      if (left === 0) break;
      const box: Rect = {
        l: c.x - w / 2,
        t: c.y - h / 2,
        r: c.x + w / 2,
        b: c.y + h / 2,
      };
      if (box.l < 8 - spill || box.r > W - 8 + spill) continue;
      if (box.t < navH || box.b > H - 8) continue;
      if (overlaps(box, clear)) continue;
      const pad: Rect = {
        l: box.l - gap,
        t: box.t - gap,
        r: box.r + gap,
        b: box.b + gap,
      };
      if (boxes.some((b) => overlaps(pad, b))) continue;
      const role =
        depth === "near"
          ? roles.near.shift()
          : // Far cards are only ever unranked.
            depth === "far"
            ? roles.mid.find(
                (r) => r.rank === 0 && !placed.some((p) => p.role === r),
              )
            : roles.mid.shift();
      if (!role) break;
      if (depth === "far") roles.mid.splice(roles.mid.indexOf(role), 1);
      boxes.push(box);
      placed.push({ role, depth, x: c.x, y: c.y });
      left--;
    }
  }
  return { W, H, cx, cy, rings, cards: placed };
}

function useLayout(
  fieldRef: RefObject<HTMLDivElement | null>,
  textRef: RefObject<HTMLElement | null>,
) {
  const [layout, setLayout] = useState<Layout | null>(null);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const text = textRef.current;
    if (!field || !text) return;
    const measure = () => {
      const f = field.getBoundingClientRect();
      const t = text.getBoundingClientRect();
      if (!f.width || !f.height) return;
      const nav = document.querySelector(".lp-nav")?.getBoundingClientRect();
      setLayout(
        layoutField(
          f.width,
          f.height,
          {
            l: t.left - f.left,
            t: t.top - f.top,
            r: t.right - f.left,
            b: t.bottom - f.top,
          },
          (nav?.height ?? 64) + 12,
        ),
      );
    };
    measure();
    let width = window.innerWidth;
    const ro = new ResizeObserver(() => {
      // Phone browsers resize the viewport as their toolbar hides; only a
      // change of width moves the cards.
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      measure();
    });
    ro.observe(field);
    // The headline may rewrap when Geist replaces its fallback.
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [fieldRef, textRef]);
  return layout;
}

/** How far a card drifts outward as the hero leaves, in px. DESIGN.md, Motion. */
export const DRIFT_OUT = 60;
/** The hero's scroll progress by which the field has faded out. */
export const FIELD_GONE = 0.7;

/**
 * How a card drifts as the hero leaves: straight out from the field's
 * centre, so it only ever moves away from the hero's text block, by up to
 * DRIFT_OUT px, but never past the hero's edges, which clip it: a card is
 * never seen cut. (A far card that already crosses an edge does not drift.)
 */
export function outward(layout: Layout, card: Placed) {
  const { W, H, cx, cy } = layout;
  const d = Math.hypot(card.x - cx, card.y - cy);
  const ux = d < 1 ? 0 : (card.x - cx) / d;
  const uy = d < 1 ? 1 : (card.y - cy) / d;
  const { w, h } = cardSize(W);
  const s = DEPTH_SCALE[card.depth];
  const room = (lo: number, hi: number, at: number, half: number, u: number) =>
    u > 0 ? (hi - (at + half)) / u : u < 0 ? (at - half - lo) / -u : Infinity;
  const reach = Math.max(
    0,
    Math.min(
      DRIFT_OUT,
      room(8, W - 8, card.x, (w * s) / 2, ux),
      room(0, H - 8, card.y, (h * s) / 2, uy),
    ),
  );
  return { ux, uy, reach };
}

function FieldCard({
  card,
  layout,
  index,
  progress,
}: {
  card: Placed;
  layout: Layout;
  index: number;
  progress: MotionValue<number>;
}) {
  const { ux, uy, reach } = outward(layout, card);
  const x = useTransform(progress, [0, FIELD_GONE], [0, ux * reach]);
  const y = useTransform(progress, [0, FIELD_GONE], [0, uy * reach]);
  const style = {
    left: card.x,
    top: card.y,
    "--in": `${120 + index * 45}ms`,
  } as React.CSSProperties;
  return (
    <div
      className={card.depth === "mid" ? "lp-slot lp-slot--soft" : "lp-slot"}
      style={style}
    >
      <motion.div style={{ x, y }}>
        <div className="lp-enter">
          <RoleCard role={card.role} />
        </div>
      </motion.div>
    </div>
  );
}

function Layer({
  depth,
  layout,
  progress,
}: {
  depth: Depth;
  layout: Layout;
  progress: MotionValue<number>;
}) {
  return (
    <div className={`lp-layer lp-layer--${depth}`}>
      {layout.cards
        .filter((c) => c.depth === depth)
        .map((c, i) => (
          <FieldCard
            key={c.role.id}
            card={c}
            layout={layout}
            index={i}
            progress={progress}
          />
        ))}
    </div>
  );
}

/**
 * The hero's scroll fade: the field's cards drift outward and fade out, with
 * the rings, by the time 70% of the hero has scrolled past; the hero's copy
 * fades and lifts 16px a little earlier. Everything is a framer-motion value
 * derived from useScroll on the hero: the field through motion components,
 * the copy (static HTML painted before this chunk loads) through
 * styleEffect. No scroll listener, no React state. Under reduced motion
 * nothing moves.
 */
export function HeroField({
  heroRef,
  textRef,
  fieldRef,
}: {
  heroRef: RefObject<HTMLElement | null>;
  textRef: RefObject<HTMLElement | null>;
  fieldRef: RefObject<HTMLDivElement | null>;
}) {
  const layout = useLayout(fieldRef, textRef);
  const reduced = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const still = useMotionValue(0);
  const progress = reduced ? still : scrollYProgress;
  const fieldOpacity = useTransform(progress, [0, FIELD_GONE], [1, 0]);
  const copyOpacity = useTransform(progress, [0, COPY_GONE], [1, 0]);
  const copyY = useTransform(progress, [0, COPY_GONE], [0, -COPY_LIFT]);

  useEffect(() => {
    const text = textRef.current;
    if (!text || reduced) return;
    return styleEffect(text, { opacity: copyOpacity, y: copyY });
  }, [textRef, reduced, copyOpacity, copyY]);

  if (!layout) return null;
  return (
    <motion.div className="lp-field__in" style={{ opacity: fieldOpacity }}>
      <div className="lp-field__deep">
        <svg className="lp-rings" aria-hidden="true" width="100%" height="100%">
          {layout.rings.map((r, i) => (
            <circle
              key={r}
              cx={layout.cx}
              cy={layout.cy}
              r={r}
              style={{ opacity: Math.max(0.25, 1 - i * 0.16) }}
            />
          ))}
        </svg>
        {(["far", "mid"] as const).map((d) => (
          <Layer key={d} depth={d} layout={layout} progress={progress} />
        ))}
      </div>
      <Layer depth="near" layout={layout} progress={progress} />
    </motion.div>
  );
}
