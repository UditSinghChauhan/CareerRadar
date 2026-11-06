import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  motion,
  styleEffect,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { SCROLL_TIMELINE } from "./motion/scroll-timeline";
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
 * Motion (DESIGN.md, Motion), transform, opacity and filter only:
 *   - ambient: every card drifts on its own slow loop (driftFor), far cards
 *     slower and smaller than near ones; the rings turn once in 120s.
 *     Both pause off screen and in a hidden tab, and stop under reduced
 *     motion (landing.css).
 *   - entrance: the cards fade in from an 8px blur to their depth's blur,
 *     near cards first (entranceDelay), all done within 1.2s of the hero.
 *   - scroll: as the hero leaves, every card spreads straight out from the
 *     centre and fades, near cards further and sooner than far ones
 *     (SPREAD), so none ever crosses the text. "Today's ten" has its own
 *     rows; no card flies anywhere.
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
 * The space kept between cards at rest. Two neighbours drifting toward each
 * other close it by at most the sum of their drift amplitudes (DRIFT), so a
 * visitor never sees under 4px.
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

/** How far a near card spreads outward as the hero leaves, in px. DESIGN.md, Motion. */
export const DRIFT_OUT = 60;
/** The hero's scroll progress by which the rings, the last of the field, have faded out. */
export const FIELD_GONE = 0.7;

/**
 * The scroll spread per depth, for parallax: near cards travel the full
 * DRIFT_OUT and are gone by half the hero; far ones travel 40% of it and
 * fade last.
 */
export const SPREAD: Record<Depth, { reach: number; gone: number }> = {
  near: { reach: 1, gone: 0.5 },
  mid: { reach: 0.65, gone: 0.6 },
  far: { reach: 0.4, gone: FIELD_GONE },
};

/**
 * The ambient drift's amplitude per depth, in px either side of rest (so a
 * travel of 6 to 10px), and its loop length in seconds: far cards move less
 * and slower than near ones. Phones use the smallest amplitude, as their
 * cards sit 10px apart.
 */
export const DRIFT = {
  amp: { near: 5, mid: 4, far: 3, phone: 3 },
  seconds: { near: [8, 10.5], mid: [10.5, 13], far: [13, 16] },
  /** Largest tilt either way, in degrees. */
  rotate: { near: 0.6, mid: 0.45, far: 0.3 },
} as const;

/** A stable 32-bit hash of a card's id, so each card keeps its own loop. */
function hash(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Pure: one card's ambient loop. An ellipse of half-axes ax and ay (one of
 * them the full amplitude), turning either way, with a tilt that follows
 * it; its own length and its own phase (a negative delay), so no two cards
 * move together.
 */
export function driftFor(id: string, depth: Depth, phone: boolean) {
  const r = seeded(hash(id));
  const amp = phone ? DRIFT.amp.phone : DRIFT.amp[depth];
  const [lo, hi] = DRIFT.seconds[depth];
  const seconds = lo + r() * (hi - lo);
  const wide = r() < 0.5;
  const minor = amp * (0.55 + r() * 0.35);
  const ax = wide ? amp : minor;
  const ay = (wide ? minor : amp) * (r() < 0.5 ? -1 : 1);
  const rotate = DRIFT.rotate[depth] * (0.5 + r() * 0.5) * (r() < 0.5 ? -1 : 1);
  return { ax, ay, rotate, seconds, phase: -r() * seconds };
}

/**
 * The cards' entrance, after the copy's: it starts ENTER_START ms after the
 * hero first painted, or as soon as the field is placed if that is later
 * (about 450ms on a desktop, measured). Near cards first, then mid 60ms
 * later, then far 120ms later, 18ms apart in each layer, each ENTER_MS
 * long: the last is in ENTER_SPAN ms after the start.
 */
export const ENTER_START = 360;
export const ENTER_MS = 360;
export const ENTER_AT: Record<Depth, number> = { near: 0, mid: 60, far: 120 };
export const ENTER_STAGGER = 18;
/** The longest a layer holds: eight cards. */
export const ENTER_SPAN = ENTER_AT.far + 7 * ENTER_STAGGER + ENTER_MS;
/** ms from now until this card's entrance starts; `elapsed` is ms since the hero painted. */
export function entranceDelay(depth: Depth, index: number, elapsed: number) {
  const start = Math.max(ENTER_START - elapsed, 0);
  return start + ENTER_AT[depth] + index * ENTER_STAGGER;
}

/**
 * How a card drifts as the hero leaves: straight out from the field's
 * centre, so it only ever moves away from the hero's text block, by up to
 * DRIFT_OUT px, but never past the hero's edges, which clip it: a card is
 * never seen cut. (A far card that already crosses an edge does not drift.)
 */
export function outward(layout: Layout, card: Placed) {
  const limit = DRIFT_OUT * SPREAD[card.depth].reach;
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
      limit,
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
  elapsed,
}: {
  card: Placed;
  layout: Layout;
  index: number;
  progress: MotionValue<number> | null;
  elapsed: number;
}) {
  const { ux, uy, reach } = outward(layout, card);
  const drift = driftFor(card.role.id, card.depth, layout.W < 640);
  const inner = (
    <div
      className="lp-drift"
      style={
        {
          "--ax": `${drift.ax.toFixed(2)}px`,
          "--ay": `${drift.ay.toFixed(2)}px`,
          "--rot": `${drift.rotate.toFixed(3)}deg`,
          animationDuration: `${drift.seconds.toFixed(2)}s`,
          animationDelay: `${drift.phase.toFixed(2)}s`,
        } as CSSProperties
      }
    >
      <div
        className="lp-enter"
        style={{
          animationDelay: `${Math.round(entranceDelay(card.depth, index, elapsed))}ms`,
        }}
      >
        <RoleCard role={card.role} />
      </div>
    </div>
  );
  return (
    <div
      className={card.depth === "mid" ? "lp-slot lp-slot--soft" : "lp-slot"}
      style={{ left: card.x, top: card.y }}
    >
      {progress ? (
        <SpreadFallback
          progress={progress}
          to={{ x: ux * reach, y: uy * reach }}
          gone={SPREAD[card.depth].gone}
        >
          {inner}
        </SpreadFallback>
      ) : (
        <div
          className="lp-spread"
          style={
            {
              "--sx": `${(ux * reach).toFixed(1)}px`,
              "--sy": `${(uy * reach).toFixed(1)}px`,
              "--gone": `${SPREAD[card.depth].gone * 100}%`,
            } as CSSProperties
          }
        >
          {inner}
        </div>
      )}
    </div>
  );
}

/** The spread as framer-motion values, where CSS scroll timelines are missing. */
function SpreadFallback({
  progress,
  to,
  gone,
  children,
}: {
  progress: MotionValue<number>;
  to: { x: number; y: number };
  gone: number;
  children: React.ReactNode;
}) {
  const x = useTransform(progress, [0, gone], [0, to.x]);
  const y = useTransform(progress, [0, gone], [0, to.y]);
  const opacity = useTransform(progress, [0, gone], [1, 0]);
  return <motion.div style={{ x, y, opacity }}>{children}</motion.div>;
}

function Layer({
  depth,
  layout,
  progress,
  elapsed,
}: {
  depth: Depth;
  layout: Layout;
  progress: MotionValue<number> | null;
  elapsed: number;
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
            elapsed={elapsed}
          />
        ))}
    </div>
  );
}

/**
 * The rings, all on one layer that turns once in 120s. A whole circle that
 * turns looks still, so the solid rings carry four short breaks and every
 * second ring is dotted: the turn can be seen. Rings past the farthest
 * corner are never seen and are left out, so the layer is only as large as
 * the field needs.
 */
function Rings({ layout }: { layout: Layout }) {
  const { W, H, cx, cy } = layout;
  const reach = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  const rings = layout.rings.filter((r) => r <= reach);
  const R = Math.ceil(Math.max(0, ...rings)) + 2;
  return (
    <div
      className="lp-rings-spin"
      style={{ left: cx - R, top: cy - R, width: R * 2, height: R * 2 }}
    >
      <svg
        className="lp-rings"
        aria-hidden="true"
        viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}
        width="100%"
        height="100%"
      >
        {rings.map((r, i) => {
          const quarter = (Math.PI * r) / 2;
          return (
            <circle
              key={r}
              cx={0}
              cy={0}
              r={r}
              className={i % 2 === 1 ? "lp-ring--dotted" : undefined}
              strokeDasharray={
                i % 2 === 1 ? undefined : `${(quarter - 10).toFixed(1)} 10`
              }
              style={{ opacity: Math.max(0.25, 1 - i * 0.16) }}
            />
          );
        })}
      </svg>
    </div>
  );
}

/**
 * The hero's field. Its scroll spread runs on a CSS scroll timeline where
 * the browser has one (the hero's `view-timeline: --hero`, landing.css), so
 * nothing in this component follows the scroll; elsewhere framer-motion
 * `useScroll` on the hero drives the same values (cards through motion
 * components, the copy, painted before this chunk, through styleEffect).
 * No scroll listener and no React state either way. Under reduced motion
 * nothing moves.
 */
export function HeroField({
  heroRef,
  textRef,
  fieldRef,
  bornAt,
}: {
  heroRef: RefObject<HTMLElement | null>;
  textRef: RefObject<HTMLElement | null>;
  fieldRef: RefObject<HTMLDivElement | null>;
  /** performance.now() when the hero first rendered: the entrance's zero. */
  bornAt: number;
}) {
  const layout = useLayout(fieldRef, textRef);
  const reduced = Boolean(useReducedMotion());
  // Measured when the field is first placed, which is when its cards mount.
  const placed = layout !== null;
  const elapsed = useMemo(
    () => (placed ? performance.now() - bornAt : 0),
    [placed, bornAt],
  );
  if (!layout) return null;
  if (SCROLL_TIMELINE || reduced) {
    return <FieldBody layout={layout} elapsed={elapsed} progress={null} />;
  }
  return (
    <FieldScrollFallback
      layout={layout}
      elapsed={elapsed}
      heroRef={heroRef}
      textRef={textRef}
    />
  );
}

/** Where CSS scroll timelines are missing: the same spread and fade from useScroll. */
function FieldScrollFallback({
  layout,
  elapsed,
  heroRef,
  textRef,
}: {
  layout: Layout;
  elapsed: number;
  heroRef: RefObject<HTMLElement | null>;
  textRef: RefObject<HTMLElement | null>;
}) {
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const ringsOpacity = useTransform(scrollYProgress, [0, FIELD_GONE], [1, 0]);
  const copyOpacity = useTransform(scrollYProgress, [0, COPY_GONE], [1, 0]);
  const copyY = useTransform(scrollYProgress, [0, COPY_GONE], [0, -COPY_LIFT]);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    return styleEffect(text, { opacity: copyOpacity, y: copyY });
  }, [textRef, copyOpacity, copyY]);

  return (
    <FieldBody
      layout={layout}
      elapsed={elapsed}
      progress={scrollYProgress}
      ringsOpacity={ringsOpacity}
    />
  );
}

function FieldBody({
  layout,
  elapsed,
  progress,
  ringsOpacity,
}: {
  layout: Layout;
  elapsed: number;
  progress: MotionValue<number> | null;
  ringsOpacity?: MotionValue<number>;
}) {
  return (
    <div className="lp-field__in">
      <div className="lp-field__deep">
        <motion.div
          className="lp-rings-fade"
          style={ringsOpacity ? { opacity: ringsOpacity } : undefined}
        >
          <Rings layout={layout} />
        </motion.div>
        {(["far", "mid"] as const).map((d) => (
          <Layer
            key={d}
            depth={d}
            layout={layout}
            progress={progress}
            elapsed={elapsed}
          />
        ))}
      </div>
      <div className="lp-field__fade" />
      <Layer
        depth="near"
        layout={layout}
        progress={progress}
        elapsed={elapsed}
      />
    </div>
  );
}
