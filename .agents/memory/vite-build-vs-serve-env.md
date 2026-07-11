---
name: Vite build vs serve env requirements
description: Vite configs that throw on missing PORT/BASE_PATH break the root `pnpm run build` recursive script
---

## Rule
When a vite.config.ts throws if PORT or BASE_PATH env vars are missing, guard that check behind `process.argv.includes("dev") || process.argv.includes("preview")`. A plain `vite build` has no server to bind and doesn't need these — but the root `pnpm run build` recurses through every workspace package's build script, so an artifact with no production service (e.g. a design/Canvas-only artifact) can still break the whole build.

**Why:** mockup-sandbox (Canvas artifact, dev-only, no `[services.production]`) failed `pnpm run build` at the repo root because its vite.config.ts unconditionally required PORT/BASE_PATH.

**How to apply:** Check `artifact.toml` for whether an artifact has a `[services.production]` section before assuming its build must be deployable; if it's dev-only, its build script still runs during `pnpm run build` and must tolerate missing dev-only env vars.
