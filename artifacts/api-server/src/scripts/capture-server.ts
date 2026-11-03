/**
 * The real API router, served with a fixed demo session, for the landing
 * page's product captures (scripts/capture-landing.mjs). Local only: it
 * refuses a non-local DATABASE_URL and listens on 127.0.0.1.
 *
 * Clerk's middleware is replaced by one line that answers getAuth() with the
 * demo user, so the captures need no Clerk keys. Every route, query and
 * response is otherwise the production code.
 */
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import router from "../routes";
import { CAPTURE_CLERK_ID } from "./capture-seed-id";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error(`capture-server only runs against a local database`);
}

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  // Branded the way clerkMiddleware brands it, so getAuth() accepts it.
  const auth = Object.assign(
    () => ({
      userId: CAPTURE_CLERK_ID,
      sessionId: "sess_capture_demo",
      tokenType: "session_token",
      isAuthenticated: true,
    }),
    { [Symbol.for("@clerk/express.auth")]: true },
  );
  Object.assign(req, { auth });
  next();
});
app.use("/api", router);

const port = Number(process.env.CAPTURE_API_PORT ?? 8099);
app.listen(port, "127.0.0.1", () => {
  console.log(`capture API on http://127.0.0.1:${port}/api`);
});
