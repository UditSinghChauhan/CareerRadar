import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { useReducedMotion } from "framer-motion";
import {
  RING_FRACTIONS,
  TAU,
  buildField,
  drawField,
  fitCanvas,
  foundInRank,
  readPalette,
} from "./radar-core";
import { Reveal } from "./motion/reveal";
import { useActive } from "./motion/use-active";
import { formatCount } from "./motion/use-count-up";
import { REPO_URL } from "./links";
import type { LandingStats } from "./use-public-stats";

/** A small lit radar whose sweep turns only while it is on screen. */
function ClosingRadar() {
  const ref = useRef<HTMLCanvasElement>(null);
  const active = useActive(ref);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const points = buildField();
    const lit = foundInRank(points).map(() => 1);
    const pal = readPalette(canvas);
    let size = fitCanvas(canvas);
    let sweep = Math.PI * 1.15;
    let last = performance.now();
    let frame = 0;
    const paint = () => {
      const { w, h, dpr } = size;
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawField(ctx, points, pal, {
        cx: w / 2,
        cy: h / 2,
        R: Math.min(w, h) / 2 - 1,
        rings: RING_FRACTIONS.map(() => 1),
        reveal: () => 1,
        sweep,
        lit,
      });
    };
    const tick = (now: number) => {
      sweep = (sweep + (Math.min(50, now - last) / 7000) * TAU) % TAU;
      last = now;
      paint();
      frame = requestAnimationFrame(tick);
    };
    paint();
    if (active && !reduced) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
    const ro = new ResizeObserver(() => {
      size = fitCanvas(canvas);
      paint();
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [active, reduced]);

  return <canvas ref={ref} className="lp-closing__radar" aria-hidden="true" />;
}

export function Closing({
  stats,
  signUpHref,
}: {
  stats: LandingStats;
  signUpHref: string;
}) {
  return (
    <section className="lp-closing" aria-labelledby="closing-head">
      <div className="lp-closing__light" aria-hidden="true" />
      <Reveal>
        <ClosingRadar />
      </Reveal>
      <Reveal as="h2" index={1} id="closing-head" className="lp-display">
        Tomorrow’s ten are already being ranked.
      </Reveal>
      <Reveal as="p" index={2} className="lp-closing__count">
        {stats.live && <span className="lp-live">Live</span>}
        <span>
          <span className="num">{formatCount(stats.activePostings)}</span> open
          roles ·{" "}
          <span className="num">{formatCount(stats.openToFreshers)}</span> open
          to freshers
        </span>
      </Reveal>
      <Reveal index={3} className="lp-hero__act">
        <Link href={signUpHref} className="lp-btn">
          Get started
        </Link>
        <p className="lp-quiet">
          Free and open source.{" "}
          <a href={REPO_URL} className="lp-link">
            Read the code on GitHub
          </a>
        </p>
      </Reveal>
    </section>
  );
}
