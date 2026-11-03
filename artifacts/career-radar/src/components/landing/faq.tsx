import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { Reveal } from "./motion/reveal";

export const QUESTIONS = [
  {
    q: "Does an AI pick my roles?",
    a: "No. Classification and ranking are deterministic rules you can read in the repository. A language model is used only when configured, for match scores and to parse a pasted description.",
  },
  {
    q: "Does it apply for me?",
    a: "No. Apply opens the employer’s own posting in a new tab, where you apply as usual. CareerRadar logs it, so your count and your board stay current.",
  },
  {
    q: "Why not LinkedIn or Naukri?",
    a: "Their terms forbid automated collection. A bookmarklet copies a posting from the tab you already have open instead.",
  },
  {
    q: "How fresh is the list?",
    a: "Sources sync every six hours and the queue holds steady for the day. A role that closes leaves it on the next sync.",
  },
] as const;

/** Four questions as an accordion; the first is open. */
export function Faq() {
  return (
    <section className="lp-faq" aria-labelledby="faq-head">
      <div className="lp-container lp-faq__in">
        <Reveal as="h2" id="faq-head" className="lp-h2">
          Questions
        </Reveal>
        <Accordion.Root
          type="single"
          collapsible
          defaultValue="0"
          className="lp-faq__list"
        >
          {QUESTIONS.map((item, i) => (
            <Reveal key={item.q} index={i}>
              <Accordion.Item value={String(i)} className="lp-faq__item">
                <Accordion.Header asChild>
                  <h3 className="lp-faq__h">
                    <Accordion.Trigger className="lp-faq__trigger">
                      {item.q}
                      <Plus aria-hidden="true" />
                    </Accordion.Trigger>
                  </h3>
                </Accordion.Header>
                <Accordion.Content className="lp-faq__a">
                  <p>{item.a}</p>
                </Accordion.Content>
              </Accordion.Item>
            </Reveal>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}
