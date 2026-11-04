# Final pass: before and after

Playwright captures at 1440×900 (`-desktop`) and 390×844 (`-mobile`), light
theme, invented data on a local database. `before/` is `main` at b37f336;
`after/` is this branch. Each `after/` file has a `before/` file of the same
name except the onboarding step, which did not exist before (its "before" is
`before/app-dashboard-*`: a new account landed on the dashboard under a
"Profile 18% complete" banner).

| What | Files |
|---|---|
| Hero field | `landing-hero-*` |
| Field to focus, scrubbed by scroll | `transition-15/30/45/60/80-*` (percent of 1.6 viewport heights scrolled) |
| Sections, in order | `landing-00…07-*` (hero, focus, stats, how, features, faq, band, footer) |
| Signed-in screens | `app-dashboard-*` (full page), `app-jobs-*`, `app-applications-*`, `app-profile-*`, `app-settings-*` |
| Onboarding (after only) | `after/onboarding-*`, `after/onboarding-filled-desktop.png`, `after/queue-after-onboarding-desktop.png` |
| Reduced motion (after only) | `after/reduced-motion-focus-desktop.png`: the ten already in their rows, no overlay |

Not captured: the Clerk sign-in and sign-up cards, which need Clerk keys this
environment did not have.
