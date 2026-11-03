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
import { useFocused } from "./focus-store";

/**
 * The hero's field: faint concentric rings (the radar, as layout) with small
 * white sample job cards placed on them at three depths. Far cards are
 * smaller, softer and paler; near cards are sharp, and the ten of the day
 * carry a rank tag. No card ever sits under the headline: the layout is
 * measured from the hero's text block and every card that would overlap it,
 * the navigation, or another card is moved to the next free spot on a ring.
 *
 * Motion is transform and opacity only. Each layer moves with the scroll at
 * its own rate (parallax), far and mid drift outward and fade as the hero
 * leaves, and every card idles on a slow CSS loop of a few pixels. The blur
 * is a fixed property of each depth layer and never animates.
 */

type Depth = "far" | "mid" | "near";
type Placed = { role: SampleRole; depth: Depth; x: number; y: number };
type Layout = { cx: number; cy: number; rings: number[]; cards: Placed[] };

const DEPTH_SCALE: Record<Depth, number> = { far: 0.8, mid: 0.9, near: 1 };

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

type Rect = { l: number; t: number; r: number; b: number };
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
      ? { near: 10, mid: 8, far: 6 }
      : { near: 10, mid: 12, far: 12 };
  const cardW = phone ? 172 : 244;
  const cardH = phone ? 52 : 60;
  const gap = phone ? 10 : 16;
  const margin = phone ? 14 : 28;
  const cx = (zone.l + zone.r) / 2;
  const cy = (zone.t + zone.b) / 2;
  const clear: Rect = {
    l: zone.l - margin,
    t: zone.t - margin,
    r: zone.r + margin,
    b: zone.b + margin,
  };

  // Rings from just outside the text block to past the corners.
  const r0 = Math.max(90, (zone.b - zone.t) / 2 + (phone ? 40 : 70));
  const step = phone ? 74 : 150;
  const reach = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  const rings: number[] = [];
  for (let r = r0; r < reach + step; r += step) rings.push(r);

  const rand = seeded(20261103 + Math.round(W / 40));
  const candidates: Array<{ x: number; y: number; ring: number; k: number }> =
    [];
  rings.forEach((r, ring) => {
    const n = Math.max(8, Math.round((Math.PI * 2 * r) / (phone ? 70 : 110)));
    const offset = rand() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * Math.PI * 2;
      candidates.push({
        x: cx + Math.cos(a) * r,
        y: cy + Math.sin(a) * r,
        ring,
        k: rand(),
      });
    }
  });

  // A phone has room only above and below the text, so the cards sit in
  // staggered rows there, still drawn over the same rings.
  if (phone) {
    candidates.length = 0;
    const rowsIn = (from: number, to: number) => {
      for (let y = from + cardH / 2; y + cardH / 2 <= to; y += cardH + gap) {
        const k = Math.round(y / (cardH + gap)) % 2 ? 1 : -1;
        for (const fx of [0.27, 0.73]) {
          candidates.push({
            x: W * fx + k * 14,
            y,
            ring: fx < 0.5 ? 0 : 1,
            k: rand(),
          });
        }
      }
    };
    rowsIn(navH, clear.t);
    rowsIn(clear.b, H - 8);
  }

  const placed: Placed[] = [];
  const boxes: Rect[] = [];
  const roles = { near: [...RANKED], field: [...FIELD_ROLES] };
  const order: Depth[] = ["near", "mid", "far"];
  for (const depth of order) {
    const s = DEPTH_SCALE[depth];
    const w = cardW * s;
    const h = cardH * s;
    // Near cards hug the headline; far cards sit on the outer rings.
    const pref = (ring: number) =>
      depth === "near" ? ring : depth === "mid" ? Math.abs(ring - 2) : -ring;
    const sorted = [...candidates].sort(
      (a, b) => pref(a.ring) - pref(b.ring) || a.k - b.k,
    );
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
      const role = depth === "near" ? roles.near.shift() : roles.field.shift();
      if (!role) break;
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
  focused,
}: {
  depth: Depth;
  layout: Layout;
  progress: MotionValue<number>;
  reduced: boolean;
  focused: boolean;
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
        // The ten leave for the "Today's ten" card when it comes into view.
        if (focused && c.role.rank > 0 && !reduced) return null;
        const style = {
          left: c.x,
          top: c.y,
          "--d": `${8 + ((i * 7 + c.role.title.length) % 7)}s`,
          "--dl": `${-((i * 13) % 9)}s`,
          "--dx": `${((i % 3) - 1) * 3}px`,
          "--dy": `${i % 2 ? 6 : -5}px`,
          "--in": `${120 + i * 45}ms`,
        } as React.CSSProperties;
        return (
          <div key={c.role.id} className="lp-slot" style={style}>
            {c.role.rank > 0 && !reduced ? (
              <motion.div
                layoutId={`role-${c.role.rank}`}
                transition={{ type: "spring", duration: 0.9, bounce: 0.12 }}
              >
                <div className="lp-drift">
                  <div className="lp-enter">
                    <RoleCard role={c.role} />
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="lp-drift">
                <div className="lp-enter">
                  <RoleCard role={c.role} />
                </div>
              </div>
            )}
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
  const focused = useFocused();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const ringY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 90]);
  if (!layout) return null;
  return (
    <div className="lp-field__in">
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
      {(["far", "mid", "near"] as const).map((d) => (
        <Layer
          key={d}
          depth={d}
          layout={layout}
          progress={scrollYProgress}
          reduced={reduced}
          focused={focused}
        />
      ))}
    </div>
  );
}
