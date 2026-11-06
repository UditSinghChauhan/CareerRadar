import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { RoleCard } from "./role-card";
import { RANKED } from "./sample-roles";
import {
  cardProgress,
  copyOut,
  crossfade,
  mix,
  planFlight,
} from "./flight-math";

/**
 * The signature move. The ten ranked cards fly from the hero's field into
 * rows 1 to 10 of "Today's ten", scrubbed by the scroll (flight-math.ts has
 * the choreography).
 *
 * A fixed overlay holds one copy of each card. Every frame it reads where
 * the card is in the field (its slot moves with the field's parallax and
 * idle drift) and where its row is in the queue (which may be sticky), and
 * places the copy between the two with a transform. The hero's copy fades
 * and lifts first, and the queue's frame appears with its first row, so it
 * is never seen empty. Reads are batched before writes, and nothing but
 * transform and opacity is written, so the flight never triggers layout.
 * Under reduced motion there is no overlay: the field keeps its cards and
 * the rows are shown at once.
 */
export function Flight() {
  const reduced = Boolean(useReducedMotion());
  const cards = useRef<Array<HTMLDivElement | null>>([]);
  // The scale last written to each flying card, to read its title's
  // unscaled offset back from a scaled box.
  const scales = useRef<number[]>([]);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    let last = "";
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      const focus = document.querySelector<HTMLElement>(".lp-focus");
      const queue = document.querySelector<HTMLElement>(".lp-queue");
      const copy = document.querySelector<HTMLElement>(".lp-hero__text");
      if (!focus || !queue) return;
      const y = window.scrollY;
      // matchMedia can be missing (jsdom, some embedded browsers); the
      // viewport width answers the same question.
      const wide =
        window.matchMedia?.("(min-width: 1024px)").matches ??
        window.innerWidth >= 1024;
      // On wide screens the stage holds still (sticky) from `rest` for
      // `hold` px; every card is home by the end of the hold.
      const rest = focus.getBoundingClientRect().top + y;
      const hold = wide ? Math.max(0, focus.offsetHeight - vh) : 0;
      const moved = !wide || y <= rest ? y : y <= rest + hold ? rest : y - hold;

      // Read everything first.
      const reads = RANKED.map((role) => {
        const src = document.querySelector<HTMLElement>(
          `[data-fly-src="${role.rank}"] .lp-rolecard`,
        );
        const slot = document.querySelector<HTMLElement>(
          `[data-fly-dst="${role.rank}"]`,
        );
        return {
          src,
          slot,
          s: src?.getBoundingClientRect(),
          t: slot?.getBoundingClientRect(),
          title: slot
            ?.querySelector<HTMLElement>(".lp-qrow__title")
            ?.getBoundingClientRect(),
        };
      });
      // Where the title sits inside a flying card, unscaled.
      const titleAt = cards.current.map((el, i) => {
        const box = el?.getBoundingClientRect();
        const tt = el
          ?.querySelector<HTMLElement>(".lp-rolecard__title")
          ?.getBoundingClientRect();
        const k = scales.current[i] ?? 1;
        return box && tt
          ? { x: (tt.left - box.left) / k, y: (tt.top - box.top) / k }
          : { x: 0, y: 0 };
      });
      const copyBox = copy?.getBoundingClientRect();
      const first = cards.current[0];
      const w = first?.offsetWidth ?? 0;
      const h = first?.offsetHeight ?? 0;

      const plan = planFlight({
        rows: reads.map(({ t }) => ({
          bottom: t ? t.bottom + moved : 0,
          height: t?.height ?? 0,
        })),
        viewport: vh,
        // Rows may land while the stage holds still, so the last ones are
        // never squeezed together at the moment it stops.
        end: wide ? rest + hold : undefined,
        waitForCopy: reads.map(({ s }) =>
          Boolean(s && copyBox && s.top < copyBox.bottom),
        ),
        distances: reads.map(({ s, t }) =>
          s && t ? Math.hypot(t.left - s.left, t.top - s.top) : 0,
        ),
        cardHeight: h * (14 / 13),
      });
      const progress = reads.map((_, i) => cardProgress(y, plan, i));
      const out = copyOut(y, vh);

      // Nothing moves at either end, so the steady states cost nothing.
      const state = progress.every((e) => e === 0)
        ? `start:${out.opacity}`
        : progress.every((e) => e === 1)
          ? "end"
          : "";
      if (state && state === last) return;
      last = state;

      if (copy) {
        copy.style.opacity = String(out.opacity);
        copy.style.transform = out.y ? `translate3d(0, ${out.y}px, 0)` : "";
      }
      // The frame of "Today's ten" takes row 1's opacity, below.
      let frameOpacity = 1;

      reads.forEach(({ src, slot, s, t, title }, i) => {
        const el = cards.current[i];
        if (!el || !slot) return;
        const e = progress[i];
        if (!t || !w || !h) {
          el.style.opacity = "0";
          slot.style.opacity = "1";
          return;
        }
        // Lands with its title on the row's title, so the hand-over reads
        // as one card becoming the row: scaled so the card's 13px title
        // meets the row's 14px title on a full row; on a one-line row it
        // shrinks to the row's height and centres on it.
        const full = t.height >= 80;
        const endScale = full ? 14 / 13 : t.height / h;
        const at = titleAt[i];
        const endX = title ? title.left - at.x * endScale : t.left;
        const endY = full
          ? (title?.top ?? t.top) - at.y * endScale
          : t.top + (t.height - h * endScale) / 2;
        // A card with no place in the field (a short screen has fewer)
        // slides in from just left of its row instead, fading in.
        const from = s
          ? { x: s.left, y: s.top, k: s.width / w }
          : { x: endX - 48, y: endY, k: endScale };
        const o = crossfade(e, Math.hypot(endX - from.x, endY - from.y));
        slot.style.opacity = String(o.row);
        if (i === 0) frameOpacity = o.row;
        const fieldSlot = src?.closest<HTMLElement>(".lp-slot");
        // The field card's slot, so its own entrance animation is kept.
        if (fieldSlot) fieldSlot.style.opacity = String(o.field);
        el.style.opacity = String(o.flying);
        if (o.flying === 0) return;
        const scale = mix(from.k, endScale, e);
        scales.current[i] = scale;
        const x = mix(from.x, endX, e);
        const yy = mix(from.y, endY, e);
        el.style.transform = `translate3d(${x}px, ${yy}px, 0) scale(${scale})`;
      });
      // The card's frame appears exactly with its first row, so it is never
      // seen empty.
      queue
        .querySelectorAll<HTMLElement>(".lp-queue__frame, .lp-queue__head")
        .forEach((el) => {
          el.style.opacity = String(frameOpacity);
        });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // The field mounts a frame after the hero; start once it can be read.
    const start = window.setTimeout(update, 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.clearTimeout(start);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      // Leave the hero's copy as it was found.
      const copy = document.querySelector<HTMLElement>(".lp-hero__text");
      if (copy) {
        copy.style.opacity = "";
        copy.style.transform = "";
      }
    };
  }, [reduced]);

  if (reduced) return null;
  return (
    <div className="lp-flight" aria-hidden="true">
      {RANKED.map((role, i) => (
        <div
          key={role.id}
          ref={(el) => {
            cards.current[i] = el;
          }}
          className="lp-flight__card"
        >
          <RoleCard role={role} />
        </div>
      ))}
    </div>
  );
}
