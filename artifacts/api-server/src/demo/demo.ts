/**
 * The read-only demo: a visitor opens the owner's invented demo account
 * without signing up, and nothing they do can change it.
 *
 *   GET  /api/demo          { enabled, active } — is a demo configured, and
 *                           is the current session the demo account?
 *   POST /api/demo/session  { ticket } — a one-time Clerk sign-in token for
 *                           the demo account; the browser redeems it with
 *                           Clerk's "ticket" strategy.
 *
 * Read-only is enforced here, on the server (CLAUDE.md): `demoReadOnly`
 * answers every write from the demo account with 403 `demo_read_only`
 * before it reaches a route, so no UI path, script or devtools call can
 * change the demo's data. The demo is off unless DEMO_CLERK_USER_ID is set.
 */
import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import { createClerkClient, getAuth } from "@clerk/express";
import { logger } from "../lib/logger";
import { ensureDemoAccount } from "./demo-seed";

/** The Clerk user id of the demo account, or null when no demo is set up. */
export function demoUserId(): string | null {
  const id = process.env["DEMO_CLERK_USER_ID"]?.trim();
  return id && id.startsWith("user_") ? id : null;
}

export function isDemoUser(userId: string | null | undefined): boolean {
  const demo = demoUserId();
  return demo !== null && userId === demo;
}

/** Methods that only read. Everything else is a write. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Writes by method that store nothing, so the demo may use them. Paths are
 * relative to the /api mount. Paste-to-parse returns a draft and saves
 * nothing until /jobs/capture/confirm, which stays refused.
 */
const STORES_NOTHING = new Set(["POST /jobs/capture"]);

export const DEMO_READ_ONLY_BODY = {
  error: "demo_read_only",
  message: "The demo is read-only. Create a free account to track your own.",
} as const;

/** 403 for every write made with the demo account's session. */
export function demoReadOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (READ_METHODS.has(req.method)) return next();
  if (STORES_NOTHING.has(`${req.method} ${req.path}`)) return next();
  const userId = getAuth(req)?.userId;
  if (isDemoUser(userId)) {
    res.status(403).json(DEMO_READ_ONLY_BODY);
    return;
  }
  next();
}

// Sign-in tokens are short and single-use; two minutes covers a slow phone.
const TICKET_TTL_SECONDS = 120;

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

/**
 * The demo account must not be deletable from the browser: Clerk's own
 * frontend API, not ours, handles account deletion. Set once per process.
 */
let hardened = false;
async function hardenDemoUser(userId: string): Promise<void> {
  if (hardened) return;
  await clerkClient.users.updateUser(userId, {
    deleteSelfEnabled: false,
    createOrganizationEnabled: false,
  });
  hardened = true;
}

/** Test hook. */
export function resetDemoHardening() {
  hardened = false;
}

// Each ticket costs a Clerk API call; a visitor needs one, a script needs none.
const sessionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many demo sessions, please try again later" },
});

const router: IRouter = Router();

router.get("/demo", (req, res) => {
  const enabled = demoUserId() !== null;
  res.json({ enabled, active: enabled && isDemoUser(getAuth(req)?.userId) });
});

router.post("/demo/session", sessionLimiter, async (req, res) => {
  const userId = demoUserId();
  if (!userId) {
    res.status(404).json({ error: "The demo is not available" });
    return;
  }
  try {
    await hardenDemoUser(userId);
    // The account cannot onboard or apply itself (it is read-only), so the
    // server keeps it filled from the live postings. A failure here still
    // opens the demo; the app does not send the demo to onboarding.
    try {
      await ensureDemoAccount(userId);
    } catch (err) {
      logger.error({ err, userId }, "demo seed failed");
    }
    const token = await clerkClient.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: TICKET_TTL_SECONDS,
    });
    res.json({ ticket: token.token });
  } catch (err) {
    logger.error({ err, userId }, "demo session failed");
    res.status(502).json({ error: "The demo could not be opened" });
  }
});

export default router;
