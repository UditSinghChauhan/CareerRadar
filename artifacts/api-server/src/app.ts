import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import path from "path";
import { fileURLToPath } from "url";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Health check routes — must be BEFORE Clerk middleware so deploy healthcheck passes
app.get("/api", (_req, res) => res.json({ ok: true, status: "running" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, status: "running" }));

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// Serve static React frontend in production
if (process.env.NODE_ENV === "production") {
  // __dirname in the esbuild bundle = artifacts/api-server/dist/
  // 3× ".." reaches the workspace root
  const frontendDist = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "artifacts",
    "career-radar",
    "dist",
    "public",
  );

  app.use(express.static(frontendDist));

  // SPA fallback — unmatched GET requests serve index.html for client-side routing.
  // Express 5 rejects bare "*"; use a named wildcard "/{*splat}" instead.
  // Skip /api/* so unknown API routes return a JSON 404, not index.html.
  // Non-GET methods that miss the API routes fall through to Express's default 404.
  app.get("/{*splat}", (req, res) => {
    if (req.path.startsWith("/api/") || req.path === "/api") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
