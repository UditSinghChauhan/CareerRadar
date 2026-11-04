import * as Accordion from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { Reveal } from "./motion/reveal";
import { REPO_URL } from "./links";

/**
 * Five questions, each answered only from facts in the repository:
 * the licence (LICENSE), the users (PRODUCT.md), the classifier and the
 * optional Gemini key (.env.example, api-server/src/relevance), the sources
 * and their sync schedule (sources.ts, api-server/src/providers).
 */
export const QUESTIONS = [
  {
    q: "Is it free?",
    a: "Yes. CareerRadar is free to use and open source under the MIT licence.",
  },
  {
    q: "Who is it for?",
    a: "Indian computer-science students in their final year, and recent graduates, looking for SDE roles: internships, new-grad jobs and early-career roles.",
  },
  {
    q: "Does an AI pick my roles?",
    a: "No. Which roles are open to freshers, and how they rank, are fixed rules you can read in the code. An AI is optional: when it is switched on, it adds a résumé match score and interview prep to a role, and never decides which roles you see.",
  },
  {
    q: "Where do postings come from?",
    a: "From employers’ own careers pages on Greenhouse, Lever, Ashby, SmartRecruiters and Workday, and from job boards with free APIs: RemoteOK, Remotive, Jobicy, Adzuna and JSearch. For anything else, a bookmarklet saves a posting from a tab you already have open.",
  },
  {
    q: "How often does it update?",
    a: "Sources sync every six hours, and JSearch once a day. Your ten are ranked each morning and stay the same through the day; a role that closes leaves on the next sync.",
  },
] as const;

/**
 * Section 6. On wide screens two columns: the heading, sticky, with one line
 * under it on the left, and the accordion of hairline rows on the right, the
 * first open. Stacked on narrower screens.
 */
export function Faq() {
  return (
    <section id="faq" className="lp-section lp-faq" aria-labelledby="faq-head">
      <div className="lp-container lp-faq__in">
        <div className="lp-faq__side">
          <Reveal as="h2" id="faq-head" className="lp-h2">
            Questions
          </Reveal>
          <Reveal as="p" index={1} className="lp-body">
            Something else?{" "}
            <a className="lp-link" href={REPO_URL}>
              Read the code on GitHub
            </a>
          </Reveal>
        </div>
        <Accordion.Root
          type="single"
          collapsible
          defaultValue="0"
          className="lp-faq__list"
        >
          {QUESTIONS.map((item, i) => (
            <Accordion.Item
              key={item.q}
              value={String(i)}
              className="lp-faq__item"
            >
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
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}
