import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Pause, Play } from "lucide-react";
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

const SWEEP_SECONDS = 7;
/** Where the still frame stops the sweep: mid-scene. */
const STILL = Math.PI * 1.15;

/**
 * The radar, lit: one point per posting at the committed scale, the ten of
 * the day in lime, and a sweep that turns only while it is on screen and
 * not paused. The page's only dark band, and the radar's only appearance.
 */
function Radar() {
  const ref = useRef<HTMLCanvasElement>(null);
  const active = useActive(ref);
  const reduced = Boolean(useReducedMotion());
  const [paused, setPaused] = useState(false);
  const sweep = useRef(STILL);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const points = buildField();
    const lit = foundInRank(points).map(() => 1);
    const pal = readPalette(canvas);
    let size = fitCanvas(canvas);
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
        sweep: sweep.current,
        lit,
      });
    };
    const tick = (now: number) => {
      // 30fps is plenty for a seven-second turn.
      if (now - last >= 30) {
        const dt = Math.min(50, now - last);
        sweep.current =
          (sweep.current + (dt / (SWEEP_SECONDS * 1000)) * TAU) % TAU;
        last = now;
        paint();
      }
      frame = requestAnimationFrame(tick);
    };
    paint();
    if (active && !reduced && !paused) {
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
  }, [active, reduced, paused]);

  return (
    <div className="lp-band__radar">
      <canvas
        ref={ref}
        role="img"
        aria-label="Radar of every open role, one point each; the ten roles of a day's queue are lit."
      />
      {!reduced && (
        <button
          type="button"
          className="lp-band__pause"
          aria-label="Pause the radar sweep"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}

/** Section 7: the only dark band. */
export function FinalBand({ signUpHref }: { signUpHref: string }) {
  return (
    <section className="lp-band" aria-labelledby="band-head">
      <div className="lp-container lp-band__in">
        <Reveal>
          <Radar />
        </Reveal>
        <div className="lp-band__text">
          <Reveal as="h2" id="band-head" className="lp-h2 lp-band__h">
            Tomorrow’s ten are already being ranked.
          </Reveal>
          <Reveal index={1}>
            <Link href={signUpHref} className="lp-btn lp-btn--lime">
              Get started
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
