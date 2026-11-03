# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary visitor of the landing page:** a recruiter or hiring engineer judging the project in under a minute. They succeed when they understand what the product does and then open the app or the code.
- **Product user:** an Indian computer-science fresher (final year or recent graduate) looking for SDE roles. Their job is to apply to the right roles each day, without scrolling every job board.

## Product Purpose

Every morning, CareerRadar picks ten SDE roles worth applying to, from every open posting a fresher can apply to, ranked and with a reason for each rank. It then tracks each application from saved to offer.

## Positioning

The ranking can be explained and checked. Classification and ranking are deterministic rules in the repository; no language model decides what a user sees. Every rank carries up to three short reasons a student reads, such as "Posted yesterday" or "Strong match for new grads"; the queue's "How is this ranked?" note explains the score, including that most sources publish no closing date. Postings come from employers' own ATS boards and from free job-board APIs, never from scraping sites whose terms forbid it.

## Operating Context

- The daily queue has ten rows. Each row shows its score as a whole number (its four weighted parts, fit 40%, closing soon 30%, freshness 20%, dream company 10%, in the score's tooltip) and up to three reasons, with Apply and Dismiss.
- Apply opens the employer's posting in a new tab, logs the application, removes the row and counts toward a daily target with a streak.
- Applications move through applied, online assessment, interview and offer, with referrals and follow-ups.
- Deadline reminders are sent 72 and 24 hours before a saved role closes, when the source publishes a deadline.
- A bookmarklet captures a posting from a tab the user already has open, for sites that cannot be collected automatically.

## Capabilities and Constraints

- Sources sync every six hours (JSearch once a day). Postings close when they leave the employer's listing, or at 45 days old or past their deadline.
- Sources rarely publish deadlines. On 2026-09-16, `deadline` was populated on 13 of 4,995 rows and on no fresher-eligible row, so the deadline term scores every row the same (3.0).
- No scrapers for Internshala, Unstop, Wellfound, LinkedIn or Naukri.
- Stack: React 18 and Vite frontend, Express 5 API, PostgreSQL with Drizzle, Clerk authentication.
- **Undecided:** which real queue rows the landing page shows. The 16 September 2026 queue cannot be re-exported. Until the owner decides, rows shown are labelled "illustrative".

## Brand Commitments

- The name is CareerRadar. The logo mark is three concentric circles (`public/logo.svg`).
- Voice: plain, specific, measured. Every number on the page is real: live from the API where possible, otherwise a committed measurement whose date is recorded in a code comment, not on the page.
- Open source under the MIT licence: https://github.com/UditSinghChauhan/CareerRadar

## Evidence on Hand

- Measured 2026-09-16: 4,995 job rows from 1,513 companies; 4,512 active, of which 2,109 are plausibly open to freshers (README, `docs/architecture.md`).
- 944 backend tests, counted 2026-10-31.
- A product screenshot of the queue dated 2026-09-16, taken on an end-to-end test account: `docs/screenshots/daily-queue-reasons.png`.
- **Absent, and not to be invented:** users, testimonials, company logos, placement outcomes and pricing.

## Product Principles

1. Show the reason, not just the rank.
2. Say when a signal is missing, rather than letting it look as though it is working.
3. Every claim on the page can be checked against the code or a recorded measurement.
4. Ten good roles beat a feed of hundreds.

## Accessibility & Inclusion

WCAG 2.1 AA in light and dark. Keyboard reachable, with visible focus. Reduced motion respected.
