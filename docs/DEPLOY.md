# Deploying CareerRadar

Two parts, hosted separately so a visitor never meets a cold start:

| Part | Where | Sleeps? |
|---|---|---|
| Frontend (`artifacts/career-radar` build, static files) | **Vercel**, from `vercel.json` | Never: served from Vercel's CDN |
| API (`artifacts/api-server`, Express) | **Render**, the existing web service | Yes, on the free plan, after 15 idle minutes |

Section 1 is the move to this split. Section 2 onward is the later move of
Clerk to a production instance on a custom domain.

## 1. The static frontend on Vercel

### Why Vercel, and why a proxy

The Render free web service sleeps, and its first request after a sleep
takes up to about a minute. Today that service also serves the frontend, so
a first-time visitor can land on Render's "waking up" screen before seeing
anything. Moving only the static files to a host that never sleeps removes
that screen; the API can keep sleeping, because the landing does not need
it to render (below).

The frontend must still reach the API **on its own origin**. Auth is Clerk
session cookies and `CLAUDE.md` rules out bearer tokens in browser code; a
cookie set on the frontend's domain is not sent to a different API domain.
So the static host must proxy `/api/*` to Render, and the browser only ever
talks to one origin.

- **Vercel** documents rewrites to an external origin as a reverse proxy,
  forwarding the visitor's cookies and adding `x-forwarded-host`, with a
  120-second limit for the origin to answer, which covers a Render wake.
  Chosen.
- A **Render Static Site** never sleeps either and supports SPA rewrites,
  but its docs say only that a rewrite destination "can be a full URL"; they
  do not describe proxy behaviour (headers, cookies, timeouts) for one.
  Not chosen, so `/api` does not depend on undocumented behaviour.
- **Netlify** would also work (200 rewrites proxy). **Cloudflare Pages**
  `_redirects` cannot proxy to another host without a Function.

Checked 2026-11-05 against vercel.com/docs/rewrites,
vercel.com/docs/errors/ROUTER_EXTERNAL_TARGET_ERROR and
render.com/docs/redirects-rewrites. Not checked: the dashboards themselves,
whose labels change; follow what they show.

### What is in the repository

- `vercel.json` (repository root):
  - install with pnpm, build only the frontend
    (`pnpm --filter @workspace/career-radar run build`), serve
    `artifacts/career-radar/dist/public`;
  - `/api/*` → `https://careerradar-34ec.onrender.com/api/*` (the proxy),
    with Vercel's CDN caching turned off for it, since `/api` answers are
    per user;
  - every other path → `/index.html` (the app's client-side routes), after
    real files such as `/assets/…` and `/fonts/…`;
  - a year's immutable cache for `/assets/*`, whose names carry a content
    hash. `/fonts/*` keeps Vercel's default, since its names do not.
- `ALLOWED_ORIGINS` on the API (`artifacts/api-server/src/lib/allowed-origins.ts`):
  the CORS allow-list and Clerk's `authorizedParties`, so the API accepts
  only session tokens issued to your own frontends. Unset, the API behaves
  as before (reflects any origin, no `azp` check), so the code can deploy
  first.
- The landing never waits for the API: the stats band shows committed
  figures at once and swaps in the live ones quietly when the API answers,
  retrying once with a longer wait if the first request meets a sleeping
  API. The sign-in and sign-up pages ping `/api/health` when they open, so
  the API and database are awake by the time a new account reaches
  `/welcome`.

The frontend needs no API base URL: it calls `/api/…` on its own origin, and
`vercel.json` is where that path is pointed at Render. To point it at
another API host, change the `destination` there.

### Steps

1. **Vercel → Add New → Project → Import** the GitHub repository
   `UditSinghChauhan/CareerRadar`.
2. **Configure Project:**
   - Root Directory: the repository root (leave it as `./`).
   - Framework Preset: **Other**. `vercel.json` sets the install command,
     build command and output directory; leave the overrides off.
   - Node.js version (Settings → Build and Deployment): **22.x**.
3. **Environment Variables** (Production and Preview):
   - `VITE_CLERK_PUBLISHABLE_KEY`: the same `pk_…` value Render has today.
     It is read at build time.
   - `VITE_CLERK_PROXY_URL`: only if Render has it set; copy the same value.
   - Do **not** add `CLERK_SECRET_KEY`, `DATABASE_URL` or any other secret:
     the frontend build reads only `VITE_` variables, and nothing on Vercel
     needs the others.
4. **Deploy.** Note the production URL Vercel gives, for example
   `https://careerradar.vercel.app`. Below it is written `<vercel-url>`.
5. **Render → the CareerRadar web service → Environment → Add:**
   `ALLOWED_ORIGINS` = `<vercel-url>,https://careerradar-34ec.onrender.com`
   (comma separated, no spaces needed, no trailing slash). Keep the Render
   origin while the Render copy of the site is still reachable. Save; Render
   restarts the service. Nothing else changes on Render: it keeps serving
   the API and, for a rollback, the old copy of the site.
6. **Clerk dashboard → the CareerRadar application (development
   instance):** add `<vercel-url>` wherever the dashboard lists allowed
   origins or allowed redirect URLs for this instance (on a development
   instance this is usually **Domains** or **Paths → Allowed redirect
   URLs**). The sign-in and sign-up redirects (`/welcome`, `/dashboard`)
   are relative, so they follow the new host. Do not create or rotate any
   key.
7. **Check it**, in a private window:
   1. Open `<vercel-url>` while the Render service is asleep (wait 15
      minutes after the last request, or check its Events tab). The landing
      renders at once with no Render "waking up" screen; the stats band
      shows the committed figures, then "Live" and the live figures appear
      within about a minute without anything moving.
   2. `<vercel-url>/api/health` answers 200 with `schema: ok` (slowly, the
      first time).
   3. Sign up. You land on `/welcome` ("Two choices, then your ten."), then
      on a populated Today's ten.
   4. Reload `<vercel-url>/dashboard` directly: it loads (the SPA rewrite).
   5. Browser console: no CORS or Clerk errors. Network: every `/api/…`
      request goes to `<vercel-url>`, none to `onrender.com`.
8. **Point links at the new home:** `README.md` (Live demo),
   `artifacts/career-radar/index.html` (`og:url`, `og:image`,
   `twitter:image`) and the address shown in the landing's browser frame
   (`artifacts/career-radar/src/components/landing/features.tsx`). Leave the `CAREERRADAR_URL` repository secret on the
   Render URL: the scheduled workflows call the API directly, which also
   keeps it warm for a while after each run.

### Dashboard checklist

- [ ] Vercel project imported from GitHub, root `./`, preset **Other**, Node 22.x
- [ ] Vercel env: `VITE_CLERK_PUBLISHABLE_KEY` (and `VITE_CLERK_PROXY_URL` only if Render has it)
- [ ] First Vercel deploy green; `<vercel-url>` written down
- [ ] Render env: `ALLOWED_ORIGINS=<vercel-url>,https://careerradar-34ec.onrender.com`, service restarted
- [ ] Clerk (development instance): `<vercel-url>` added to allowed origins / redirect URLs
- [ ] Private window, API asleep: landing renders at once, committed figures, then Live
- [ ] `<vercel-url>/api/health` is 200 with `schema: ok`
- [ ] New sign-up reaches `/welcome`, then a populated Today's ten
- [ ] Deep link `<vercel-url>/dashboard` loads after a reload
- [ ] Console clean: no CORS or Clerk errors; no request goes to `onrender.com`
- [ ] README and `index.html` links updated in their own small PR

### Rolling back

The Render service still serves the whole site, unchanged. Point visitors
back at `https://careerradar-34ec.onrender.com`, and remove `ALLOWED_ORIGINS`
on Render (or leave it: the Render origin is in the list). Deleting the
Vercel project changes nothing on Render.

## 2. Later: a production Clerk instance on a custom domain

The live app runs on Render at `careerradar-34ec.onrender.com` with a Clerk
**development** instance. A development instance has a user cap, shows a
"Development mode" badge, and cannot be moved to production on an
`onrender.com` subdomain, because Clerk's production instance needs DNS records
on a domain you control. This is the runbook for the move. Nothing in it has
been run yet; the production keys are the owner's to create and paste.

Throughout, `careerradar.app` stands for the domain you buy. Replace it
everywhere.

> What was checked when this was written (2026-11-03): the code paths named
> below. What was not: the Clerk and Render dashboards themselves, which change
> their labels from time to time, and the exact DNS targets, which Clerk shows
> per instance. Copy the targets from the dashboards, not from this file.

### 2.0 Before you start

- Buy the domain and make sure you can edit its DNS.
- Read the one consequence that cannot be undone: **users do not move between
  Clerk instances.** Every account on the development instance gets a new
  Clerk user id on production, and `profiles`, `applications`, `bookmarks`,
  `settings` and `notifications` are keyed by `clerk_id`. With one real user
  (the owner), the simplest path is to sign up again on production and run one
  `UPDATE … SET clerk_id = '<new id>' WHERE clerk_id = '<old id>'` per table
  against the database. With more users, export them from the development
  instance and import them with Clerk's migration tooling first.
- Apply any pending SQL in `lib/db/sql/` (newest first:
  `2026-11-03-onboarding-preferences.sql`) before deploying new code, as
  `CLAUDE.md` (schema changes ship separately) says. `/api/health` returns 503
  and names the missing columns if this step is skipped.

### 2.1 Point the domain at the site

1. With the frontend on Vercel (section 1), the domain points at Vercel:
   Vercel → the project → **Settings → Domains → Add** `careerradar.app` and
   `www.careerradar.app`, and follow the DNS records Vercel shows. The API
   stays on Render behind the `/api` proxy and needs no domain of its own.
   The steps below are the older, Render-only path, kept for reference:
   Render → the CareerRadar web service → **Settings → Custom Domains → Add**,
   add `careerradar.app` and `www.careerradar.app`.
2. At your DNS provider:
   - `www` → **CNAME** → `careerradar-34ec.onrender.com`
   - the apex `careerradar.app` → the **A** record (or ALIAS/ANAME) Render
     shows on that page.
3. Wait for Render to show both as verified and to issue the certificate.
   `https://careerradar.app/api/health` should answer before you go on.

### 2.2 Create the Clerk production instance

1. Clerk dashboard → the CareerRadar application → instance switcher →
   **Create production instance**. Clone the development settings when asked,
   so sign-in methods and the session settings carry over.
2. Set the production domain to `careerradar.app`.
3. **Domains** lists five DNS records to add. Add each one exactly as shown:
   - `clerk.careerradar.app` → CNAME (the Frontend API; the browser loads
     `clerk-js` from here)
   - `accounts.careerradar.app` → CNAME (Clerk's hosted account pages)
   - `clkmail.careerradar.app` and two `…._domainkey` records → CNAME
     (email sending and DKIM, so verification emails are not marked as spam)
4. Wait until the dashboard shows every record as verified and the SSL
   certificates as issued. Clerk will not serve production until it does.

The app also ships a Clerk proxy at `/api/__clerk`
(`artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`), which is the
alternative to the `clerk.` CNAME. With a custom domain the CNAME is simpler;
leave `VITE_CLERK_PROXY_URL` unset unless you deliberately choose the proxy, in
which case set it to `https://careerradar.app/api/__clerk` and enable proxying
for that URL in the Clerk dashboard.

### 2.3 Google sign-in on production

Development instances use Clerk's shared Google credentials. Production needs
your own.

1. Google Cloud Console → a project for CareerRadar → **APIs & Services →
   OAuth consent screen**: External, app name "CareerRadar", the support email,
   the home page `https://careerradar.app`, the privacy policy URL, and the
   authorised domain `careerradar.app`. Scopes: `email`, `profile`, `openid`.
   Publish the app (in "Testing" only listed test users can sign in).
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorised JavaScript origins: `https://careerradar.app`
   - Authorised redirect URI: the one Clerk shows under **SSO connections →
     Google → Use custom credentials** (it has the form
     `https://clerk.careerradar.app/v1/oauth_callback`).
3. Paste the client ID and secret into that Clerk screen and save. Keep Google
   enabled and first among the sign-in options; the sign-up page shows
   "Continue with Google" first.

### 2.4 Allowed origins and redirects

- Clerk → **Paths**: sign-in `/sign-in`, sign-up `/sign-up`, after sign-up
  `/welcome`, after sign-in `/dashboard`. The app passes the same values to
  `ClerkProvider` (`artifacts/career-radar/src/App.tsx`), so either side alone
  is enough; set both so they agree.
- Clerk → **Domains → Allowed redirect origins**: `https://careerradar.app`
  and `https://www.careerradar.app`.
- Render → `ALLOWED_ORIGINS`: add `https://careerradar.app` and
  `https://www.careerradar.app` (section 1 explains the variable; it sets both
  CORS and Clerk's `authorizedParties`).

### 2.5 Render environment variables

Render → the service → **Environment**. Replace, do not add alongside:

| Variable | Value | When it is read |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | `pk_live_…` from Clerk → API keys | at run time, by the API |
| `CLERK_SECRET_KEY` | `sk_live_…` from Clerk → API keys | at run time, by the API |
| `VITE_CLERK_PUBLISHABLE_KEY` | the same `pk_live_…` | **at build time**, baked into the frontend bundle |
| `VITE_CLERK_PROXY_URL` | unset (see step 2) | at build time |

Because `VITE_CLERK_PUBLISHABLE_KEY` is read at build time, changing it needs
a new build: use **Manual Deploy → Clear build cache & deploy**, not a restart.
With the frontend on Vercel (section 1), set the same `VITE_CLERK_PUBLISHABLE_KEY`
(and `VITE_CLERK_PROXY_URL`, if used) in Vercel → Settings → Environment
Variables too, then **Redeploy** there; the Vercel build is the one visitors
load. Update `ALLOWED_ORIGINS` on Render if the domain changed.
Do not set `NODE_ENV=production` as a build variable (`CLAUDE.md`: pnpm then
skips devDependencies and the build fails with `vite: not found`).

Never paste these keys into chat, a commit, a test or an issue. They live in
Render, Vercel and your local `.env` only.

### 2.6 Check it

1. Open `https://careerradar.app` in a private window. No "Development mode"
   badge on the sign-in card.
2. Sign up with Google. You land on "Two choices, then your ten.", then on a
   populated Today's ten.
3. `https://careerradar.app/api/health` is 200 with `schema: ok`.
4. Browser console: no Clerk errors, `clerk-js` loads from
   `clerk.careerradar.app`.
5. Update the links that name the old host: `README.md`, `index.html`
   (`og:url`, `og:image`, `twitter:image`), and the `CAREERRADAR_URL`
   repository secret the two scheduled workflows call
   (`.github/workflows/sync.yml`, `.github/workflows/ai-batch.yml`).

### Rolling back

Put the `pk_test_` / `sk_test_` values back in Render and clear-cache deploy.
The development instance is untouched by all of the above, so its users are
still there.
