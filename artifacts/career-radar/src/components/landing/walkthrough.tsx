import { useEffect, useRef, useState } from "react";
import { buildField } from "./radar-field";
import { ILLUSTRATIVE_QUEUE, LandingQueue } from "./landing-queue";

/**
 * The walkthrough: rank, reason, apply. The radar's ten found roles leave
 * the field in rank order (step 1), land on the rank badges of the real
 * queue component and one rank explains itself (step 2), then the queue takes
 * an application (step 3). From 1024px the stage is sticky and follows the
 * step in view; below that each step carries its own stage inline.
 */
/**
 * The daily-queue priority weights, as set in
 * artifacts/api-server/src/queue/priority.ts (PRIORITY_WEIGHTS). Shown on the
 * page so the claim "you can check the ranking" is itself checkable.
 */
export const PRIORITY_COMPONENTS = [
  { name: "relevance", weight: 40 },
  { name: "deadline", weight: 30 },
  { name: "freshness", weight: 20 },
  { name: "dream company", weight: 10 },
] as const;

const weights = PRIORITY_COMPONENTS.map((c) => `${c.name} ${c.weight}%`);

export const STEPS = [
  {
    title: "Ten rise out of the field, in order.",
    body: `Every open role you can apply to is scored on ${weights.slice(0, -1).join(", ")} and ${weights.at(-1)}. The highest ten become your queue.`,
  },
  {
    title: "Each one tells you why.",
    body: "Every row shows its four scores and a plain reason, including what isn't working. Sources rarely publish deadlines (13 of 4,995 rows), so today that term gives every role the same score, and the row says so.",
  },
  {
    title: "Apply, and it's logged.",
    body: "Apply opens the employer's own posting and records the application. The row leaves your queue and today's count goes up.",
  },
] as const;

const TAU = Math.PI * 2;
const WIDE = "(min-width: 1024px)";

function useMedia(query: string) {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(query).matches
      : true;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

export function Walkthrough() {
  const wide = useMedia(WIDE);
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (!wide || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActive(stepRefs.current.indexOf(e.target as HTMLElement));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [wide]);

  return (
    <section className="lp-walk" aria-labelledby="walk-head">
      <div className="lp-container lp-walk__grid">
        <div className="lp-walk__steps">
          <h2 id="walk-head" className="lp-h2" data-reveal>
            How the queue works
          </h2>
          <ol className="lp-steps">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className={
                  wide && i !== active ? "lp-step" : "lp-step is-active"
                }
                data-step={i}
              >
                <h3>{step.title}</h3>
                <p className="lp-body">{step.body}</p>
                {!wide && <Stage state={i} inline />}
              </li>
            ))}
          </ol>
          <p className="lp-illus">
            Illustrative rows. Scores and reasons come from the real ranking
            code.
          </p>
        </div>
        {wide && (
          <div className="lp-walk__stage-col">
            <Stage state={active} />
          </div>
        )}
      </div>
    </section>
  );
}

/** The product frame for one step. Inert: it demonstrates, it does not act. */
function Stage({ state, inline = false }: { state: number; inline?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const limit = inline ? 3 : 10;
  const first = ILLUSTRATIVE_QUEUE.items[0];

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!stage || !canvas || !ctx) return;
    const field = buildField();
    const found = field.filter((p) => p.found);
    // Rank 1 is the found point nearest the centre, and so on outward.
    const order = found
      .map((p, i) => ({ i, d: Math.hypot(p.x, p.y) }))
      .sort((a, b) => a.d - b.d)
      .map((o) => o.i);
    let frame = 0;

    const paint = (t: number) => {
      const rect = canvas.getBoundingClientRect();
      const { width: w, height: h } = rect;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const css = getComputedStyle(stage);
      const v = (n: string) => css.getPropertyValue(n).trim();
      const signal = v("--lp-signal");

      if (state === 0) {
        const R = Math.min(w * 0.42, h * 0.46);
        const cx = w * 0.6;
        const cy = h / 2;
        ctx.strokeStyle = v("--lp-rule");
        ctx.lineWidth = 1;
        for (const f of [1, 0.66, 0.33]) {
          ctx.beginPath();
          ctx.arc(cx, cy, R * f, 0, TAU);
          ctx.stroke();
        }
        ctx.fillStyle = v("--lp-point");
        for (const p of field) {
          if (p.found) continue;
          const a = (p.tone === 0 ? 0.12 : p.tone === 1 ? 0.22 : 0.36) * p.fade;
          if (a <= 0.01) continue;
          ctx.globalAlpha = a * (1 - 0.5 * t);
          ctx.fillRect(cx + p.x * R, cy + p.y * R, 1.4, 1.4);
        }
        ctx.globalAlpha = 1;
        const x0 = Math.min(72, w * 0.16);
        const top = 32;
        const gap = (h - top * 2) / 9;
        ctx.font = `500 13px ${v("--lp-font")}`;
        ctx.textBaseline = "middle";
        order.forEach((fi, rank) => {
          const p = found[fi];
          const sx = cx + p.x * R;
          const sy = cy + p.y * R;
          const ex = x0;
          const ey = top + rank * gap;
          // Each dot leaves on its own beat, so the column fills in rank order.
          const k = Math.min(1, Math.max(0, t * 1.6 - rank * 0.06));
          const e = 1 - Math.pow(1 - k, 3);
          const x = sx + (ex - sx) * e;
          const y = sy + (ey - sy) * e;
          ctx.strokeStyle = signal;
          ctx.globalAlpha = 0.28 * e;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = signal;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, TAU);
          ctx.fill();
          if (e > 0.98) {
            ctx.fillStyle = v("--lp-muted");
            ctx.textAlign = "right";
            ctx.fillText(String(rank + 1), x - 14, y);
            ctx.fillStyle = v("--lp-ink");
            ctx.textAlign = "left";
            ctx.fillText(
              ILLUSTRATIVE_QUEUE.items[rank].priority.toFixed(1),
              x + 14,
              y,
            );
          }
        });
        return;
      }

      // Steps 2 and 3: the dots have landed on the real rows' rank badges.
      const box = stage.getBoundingClientRect();
      const visible = stage.querySelector<HTMLElement>(
        `[data-queue="${state === 1 ? "ranked" : "applied"}"]`,
      );
      const badges = [
        ...(visible?.querySelectorAll(
          '[data-testid="queue-row"] > div > span:first-child',
        ) ?? []),
      ];
      ctx.strokeStyle = signal;
      ctx.lineWidth = 2;
      badges.forEach((b, i) => {
        const r = b.getBoundingClientRect();
        const y = r.top - box.top + r.height / 2;
        if (y > h - 8) return;
        ctx.globalAlpha = state === 1 && i > 0 ? 0.35 : 1;
        ctx.beginPath();
        ctx.arc(r.left - box.left + r.width / 2, y, r.width / 2 + 4, 0, TAU);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    };

    if (state !== 0 || reducedMotion()) {
      // Let the queue lay out before the rings are placed on its badges.
      frame = requestAnimationFrame(() => paint(1));
    } else {
      const start = performance.now();
      const run = (now: number) => {
        const t = Math.min(1, (now - start) / 1100);
        paint(t);
        if (t < 1) frame = requestAnimationFrame(run);
      };
      frame = requestAnimationFrame(run);
    }
    const ro = new ResizeObserver(() => paint(1));
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [state]);

  return (
    <div
      ref={stageRef}
      className={inline ? "lp-stage lp-stage--inline" : "lp-stage"}
      data-state={state}
      data-ui
      inert
      aria-hidden="true"
    >
      {(!inline || state === 1) && (
        <div className="lp-stage__q" data-queue="ranked" data-on={state === 1}>
          <LandingQueue limit={limit} />
        </div>
      )}
      {(!inline || state === 2) && (
        <div className="lp-stage__q" data-queue="applied" data-on={state === 2}>
          <LandingQueue skip={1} applied={1} limit={limit} />
        </div>
      )}
      {(!inline || state === 1) && (
        <div className="lp-why" data-on={state === 1}>
          <p className="lp-why__head">Why this ranks 1st</p>
          <ul>
            {first.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <canvas ref={canvasRef} className="lp-stage__canvas" />
    </div>
  );
}
