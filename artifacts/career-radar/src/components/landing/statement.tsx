import { Settle } from "./motion/scroll-motion";

/**
 * A statement paragraph in two tones: the first sentence in ink, the rest
 * in the large-text grey. Only ever set at 24px or larger, where that grey
 * passes WCAG AA for large text. It settles as it arrives (Settle).
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
    <Settle
      as="p"
      className={["lp-statement", className].filter(Boolean).join(" ")}
    >
      {lead} <span className="lp-statement__rest">{rest}</span>
    </Settle>
  );
}
