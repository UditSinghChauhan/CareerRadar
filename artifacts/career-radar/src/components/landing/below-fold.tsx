import { ApplyChapter } from "./apply-chapter";
import { Bento } from "./bento";
import { Chapter } from "./chapter";
import { Closing } from "./closing";
import { Faq } from "./faq";
import { Showcase } from "./showcase";
import type { LandingStats } from "./use-public-stats";

/**
 * Everything after the hero, in its own chunk. The landing paints the hero
 * first and mounts this in a transition, so the first paint does not wait
 * for the motion library or the product frames, and the render that follows
 * yields to input instead of blocking it.
 */
export default function BelowFold({
  stats,
  signUpHref,
}: {
  stats: LandingStats;
  signUpHref: string;
}) {
  return (
    <>
      <Chapter stats={stats} />
      <ApplyChapter />
      <Bento />
      <Showcase />
      <Faq />
      <Closing stats={stats} signUpHref={signUpHref} />
    </>
  );
}
