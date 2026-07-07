---
name: Express 5 wildcard routes
description: app.get("*", ...) throws synchronously in Express 5; correct pattern for SPA catch-all and production static serving
---

## Rule
Never use `app.get("*", handler)` in Express 5. It throws `Missing parameter name at index 1: *` synchronously during route registration — crashing the server before it ever binds its port.

**Why:** Express 5 uses path-to-regexp 8.x which requires named wildcards. Bare `*` is invalid.

**How to apply:**
- SPA GET catch-all: `app.get("/{*splat}", handler)` — GET-only, Express 5-safe
- Guard `/api/*` inside the handler so unknown API GETs return JSON 404 rather than index.html
- This bug only manifests in production because the static-serving block in app.ts is guarded by `NODE_ENV === "production"`

## Also: production static path traversal
In the esbuild bundle, `__dirname` = `artifacts/api-server/dist/`. To reach workspace root from there, use exactly 3× `..` (not 4). Four traversals overshoot to `/home/runner/`.
