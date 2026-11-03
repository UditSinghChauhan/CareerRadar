import { Reveal } from "./motion/reveal";

/**
 * A statement paragraph in two tones: the first sentence in ink, the rest
 * in the large-text grey. Only ever set at 24px or larger, where that grey
 * passes WCAG AA for large text.
 */
export function Statement({
  lead,
  rest,
  className,
}: {
  lead: string;
  rest: string;
  className?: string;
}) {
  return (
    <Reveal
      as="p"
      className={["lp-statement", className].filter(Boolean).join(" ")}
    >
      {lead} <span className="lp-statement__rest">{rest}</span>
    </Reveal>
  );
}
