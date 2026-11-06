import { Faq } from "./faq";
import { Features } from "./features";
import { FinalBand } from "./final-band";
import { Focus } from "./focus";
import { HowItWorks } from "./how";
import { Stats } from "./stats";
import type { LandingStats } from "./use-public-stats";

export { HeroField } from "./field";

/**
 * Everything that needs the motion library, in its own chunk: the hero's
 * field and the six sections after it. The landing paints its static hero
 * first and mounts this in a transition, so the first paint waits for
 * neither framer-motion nor the sample cards.
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
      <Focus />
      <Stats stats={stats} />
      <HowItWorks />
      <Features />
      <Faq />
      <FinalBand signUpHref={signUpHref} />
    </>
  );
}
