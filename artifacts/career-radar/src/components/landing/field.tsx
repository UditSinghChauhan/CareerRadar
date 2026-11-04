import { useLayoutEffect, useState, type RefObject } from "react";
import {
  motion,
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
 * is skipped. Rank 1 sits just below the button and the others follow it
 * round the rings and outward, so the ranks read in order.
 *
 * Motion is transform and opacity only. Each layer moves with the scroll at
 * its own rate (parallax), far and mid drift outward and fade as the hero
 * leaves, and every card idles on a slow CSS loop of a few pixels with its
 * own period and phase. The blur is a fixed property of each depth layer and
 * never animates. The ten leave the field in flight.tsx.
 */

type Depth = "far" | "mid" | "near";
type Placed = { role: SampleRole; depth: Depth; x: number; y: number };
type Layout = { cx: number; cy: number; rings: number[]; cards: Placed[] };

const DEPTH_SCALE: Record<Depth, number> = { far: 0.8, mid: 0.9, near: 1 };

/** The clear zone around the hero's text block. DESIGN.md, Sections. */
export const CLEAR_ZONE = 48;

/** Card size per breakpoint. Two lines of title fit without an ellipsis. */
export function cardSize(W: number) {
  return W < 640 ? { w: 176, h: 58 } : { w: 248, h: 68 };
}

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
  const gap = phone ? 8 : 16;
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
  // still drawn over the same rings. Ranks are read outward from the
  // button: below first, then above.
  if (zone.r - zone.l > W * 0.7) {
    const cols = phone ? [0.26, 0.74] : [0.3, 0.7];
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
  return { cx, cy, rings, cards: placed };
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

function Layer({
  depth,
  layout,
  progress,
  reduced,
}: {
  depth: Depth;
  layout: Layout;
  progress: MotionValue<number>;
  reduced: boolean;
}) {
  const rate = { far: 140, mid: 70, near: -40 }[depth];
  const spread = { far: 0.35, mid: 0.2, near: 0 }[depth];
  const y = useTransform(progress, [0, 1], [0, reduced ? 0 : rate]);
  const scale = useTransform(progress, [0, 1], [1, reduced ? 1 : 1 + spread]);
  const opacity = useTransform(
    progress,
    [0, depth === "near" ? 1 : 0.75],
    [1, reduced || depth === "near" ? 1 : 0],
  );
  const cards = layout.cards.filter((c) => c.depth === depth);
  return (
    <motion.div
      className={`lp-layer lp-layer--${depth}`}
      style={{
        y,
        scale,
        opacity,
        transformOrigin: `${layout.cx}px ${layout.cy}px`,
      }}
    >
      {cards.map((c, i) => {
        // A slow breath: 14 to 22 seconds a cycle, a few pixels, each card
        // with its own period and phase so no two move together.
        const seed = i * 7 + c.role.title.length;
        const style = {
          left: c.x,
          top: c.y,
          "--d": `${14 + (seed % 9)}s`,
          "--dl": `${-((seed * 1.7) % 14).toFixed(2)}s`,
          "--dx": `${((i % 3) - 1) * 2}px`,
          "--dy": `${i % 2 ? 4 : -4}px`,
          "--in": `${120 + i * 45}ms`,
        } as React.CSSProperties;
        return (
          <div
            key={c.role.id}
            className="lp-slot"
            style={style}
            data-fly-src={c.role.rank > 0 ? c.role.rank : undefined}
          >
            <div className="lp-drift">
              <div className="lp-enter">
                <RoleCard role={c.role} />
              </div>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}

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
  const ringY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 90]);
  if (!layout) return null;
  return (
    <div className="lp-field__in">
      <div className="lp-field__deep">
        <motion.svg
          className="lp-rings"
          style={{ y: ringY }}
          aria-hidden="true"
          width="100%"
          height="100%"
        >
          {layout.rings.map((r, i) => (
            <circle
              key={r}
              cx={layout.cx}
              cy={layout.cy}
              r={r}
              style={{ opacity: Math.max(0.25, 1 - i * 0.16) }}
            />
          ))}
        </motion.svg>
        {(["far", "mid"] as const).map((d) => (
          <Layer
            key={d}
            depth={d}
            layout={layout}
            progress={scrollYProgress}
            reduced={reduced}
          />
        ))}
      </div>
      <Layer
        depth="near"
        layout={layout}
        progress={scrollYProgress}
        reduced={reduced}
      />
    </div>
  );
}
