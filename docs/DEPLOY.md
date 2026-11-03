# Moving to a production Clerk instance on a custom domain

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

## 0. Before you start

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
  `CLAUDE.md` → "Deploying a schema change" says. `/api/health` returns 503
  and names the missing columns if this step is skipped.

## 1. Point the domain at Render

1. Render → the CareerRadar web service → **Settings → Custom Domains → Add**,
   add `careerradar.app` and `www.careerradar.app`.
2. At your DNS provider:
   - `www` → **CNAME** → `careerradar-34ec.onrender.com`
   - the apex `careerradar.app` → the **A** record (or ALIAS/ANAME) Render
     shows on that page.
3. Wait for Render to show both as verified and to issue the certificate.
   `https://careerradar.app/api/health` should answer before you go on.

## 2. Create the Clerk production instance

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

## 3. Google sign-in on production

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

## 4. Allowed origins and redirects

- Clerk → **Paths**: sign-in `/sign-in`, sign-up `/sign-up`, after sign-up
  `/welcome`, after sign-in `/dashboard`. The app passes the same values to
  `ClerkProvider` (`artifacts/career-radar/src/App.tsx`), so either side alone
  is enough; set both so they agree.
- Clerk → **Domains → Allowed redirect origins**: `https://careerradar.app`
  and `https://www.careerradar.app`.
- The API's CORS is `origin: true` (`artifacts/api-server/src/app.ts`), which
  reflects any origin. The app and the API share one origin, so this is not
  needed for the app to work; when you move, consider limiting it to
  `https://careerradar.app` and passing
  `authorizedParties: ["https://careerradar.app"]` to `clerkMiddleware`, in its
  own change with a test.

## 5. Render environment variables

Render → the service → **Environment**. Replace, do not add alongside:

| Variable | Value | When it is read |
|---|---|---|
| `CLERK_PUBLISHABLE_KEY` | `pk_live_…` from Clerk → API keys | at run time, by the API |
| `CLERK_SECRET_KEY` | `sk_live_…` from Clerk → API keys | at run time, by the API |
| `VITE_CLERK_PUBLISHABLE_KEY` | the same `pk_live_…` | **at build time**, baked into the frontend bundle |
| `VITE_CLERK_PROXY_URL` | unset (see step 2) | at build time |

Because `VITE_CLERK_PUBLISHABLE_KEY` is read at build time, changing it needs
a new build: use **Manual Deploy → Clear build cache & deploy**, not a restart.
Do not set `NODE_ENV=production` as a build variable (`CLAUDE.md`: pnpm then
skips devDependencies and the build fails with `vite: not found`).

Never paste these keys into chat, a commit, a test or an issue. They live in
Render and in your local `.env` only.

## 6. Check it

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

## Rolling back

Put the `pk_test_` / `sk_test_` values back in Render and clear-cache deploy.
The development instance is untouched by all of the above, so its users are
still there.
