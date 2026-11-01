import { useEffect, useRef } from "react";
import {
  RING_FRACTIONS,
  buildField,
  drawField,
  fitCanvas,
  foundInRank,
  readPalette,
} from "./radar-core";
import { easeOut, span } from "./motion/tokens";

/**
 * The radar at phone size, for the inline beats. "field" draws in the whole
 * field; "eligible" dims the postings a fresher cannot apply to and pulls the
 * rest inward. Each plays once when it comes into view; `still` draws the
 * end state at once.
 */
export function MiniRadar({
  mode,
  still,
}: {
  mode: "field" | "eligible";
  still: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const points = buildField();
    const lit = foundInRank(points).map(() => 1);
    const pal = readPalette(canvas);
    let size = fitCanvas(canvas);
    let frame = 0;
    let t0 = -1;
    let played = still;

    const paint = (t: number) => {
      const { w, h, dpr } = size;
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const k = mode === "field" ? 1 : easeOut(span(t, 0, 1200));
      const intro =
        mode === "field"
          ? (r: number) => easeOut(span(t, r * 600, r * 600 + 300))
          : () => 1;
      drawField(ctx, points, pal, {
        cx: w / 2,
        cy: h / 2,
        R: Math.min(w, h) / 2 - 1,
        rings: RING_FRACTIONS.map((_, i) =>
          mode === "field" ? easeOut(span(t, i * 100, 700)) : 1,
        ),
        reveal: intro,
        sweep: null,
        dimOuter: k,
        contract: 1 - 0.26 * k,
        lit,
      });
    };

    const run = (now: number) => {
      if (t0 < 0) t0 = now;
      const t = now - t0;
      paint(t);
      frame = t < 1300 ? requestAnimationFrame(run) : 0;
    };

    paint(played ? Infinity : 0);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !played) {
          played = true;
          frame = requestAnimationFrame(run);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      size = fitCanvas(canvas);
      if (!frame) paint(played ? Infinity : 0);
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      ro.disconnect();
    };
  }, [mode, still]);

  return (
    <canvas
      ref={ref}
      className="lp-mini-radar"
      role="img"
      aria-label={
        mode === "field"
          ? "Radar of every open role, the ten found ones lit."
          : "The same radar with the roles a fresher cannot apply to dimmed."
      }
    />
  );
}
