import { healthHandler } from "./routes/health";
import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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

// ─── Security Headers ────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP to avoid breaking the SPA
    crossOriginEmbedderPolicy: false,
  }),
);

// ─── Rate Limiting ───────────────────────────────────────────────────────────
// The limiter exists to protect the public Render deployment. Outside
// production it is skipped: a single page load fires several API calls, so
// 100 requests per 15 minutes throttles ordinary local development and makes
// the e2e suite impossible — it exhausted the window before the first spec
// finished. Production behaviour is unchanged (NODE_ENV=production there, set
// by the start command). Set RATE_LIMIT_ENFORCE=true to exercise it locally.
const enforceRateLimit =
  process.env["NODE_ENV"] === "production" ||
  process.env["RATE_LIMIT_ENFORCE"] === "true";

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  skip: () => !enforceRateLimit,
});

app.use("/api", generalLimiter);

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
// Drift-aware: 503 with the missing columns when the migration has not landed.
app.get("/api/health", healthHandler);

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

// ─── API Documentation (Scalar) ──────────────────────────────────────────────
app.get("/api/docs", (_req, res) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>CareerRadar API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/api/docs/openapi.yaml"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

// Serve the OpenAPI spec file
app.get("/api/docs/openapi.yaml", (_req, res) => {
  const specPath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "lib",
    "api-spec",
    "openapi.yaml",
  );
  res.sendFile(specPath);
});

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
