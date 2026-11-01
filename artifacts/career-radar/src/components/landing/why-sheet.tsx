import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ExplainCard } from "./explain-card";
import { useCountUp } from "./motion/use-count-up";

/**
 * On phones the "why" opens as a bottom sheet instead of a tooltip, which
 * used to cover the next card. Radix Dialog gives it focus trapping, Escape
 * and a labelled title.
 */
export function WhySheet() {
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => setContainer(document.querySelector<HTMLElement>(".lp")), []);
  // The bars grow each time the sheet opens.
  const fill = useCountUp(open ? 100 : 0, { start: true });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="lp-btn2 lp-why-trigger">
        Why this ranks 1st
      </Dialog.Trigger>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="lp-sheet__overlay" />
        <Dialog.Content className="lp-sheet" aria-describedby={undefined}>
          <div className="lp-sheet__grip" aria-hidden="true" />
          <Dialog.Title className="lp-sheet__title">
            Why this ranks 1st
          </Dialog.Title>
          <ExplainCard fill={fill / 100} />
          <Dialog.Close className="lp-btn2 lp-sheet__close">Close</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
