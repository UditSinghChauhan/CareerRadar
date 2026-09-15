import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// PORT is only needed for dev server (not build time)
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

// BASE_PATH: use env var if set (Replit), otherwise default to "/"
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss({ optimize: false }),
    // Replit-specific plugins only when running in Replit dev environment
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-runtime-error-modal").then((m) =>
            m.default(),
          ),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  // The .env lives at the monorepo root, not next to this config. Vite's
  // envDir defaults to `root` (above), so without this every VITE_* var is
  // undefined in local dev — which makes publishableKeyFromHost fall through
  // to deriving a bogus "clerk.localhost" frontend API and the app renders
  // nothing. No-op on Render: there is no root .env there, and VITE_* vars
  // arrive as real environment variables, which Vite reads regardless.
  // Only VITE_-prefixed vars are ever exposed to the bundle, so widening the
  // env directory does not put DATABASE_URL or CLERK_SECRET_KEY in client code.
  envDir: path.resolve(import.meta.dirname, "..", ".."),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /**
         * Phase 7. One 1.55 MB script was being rebuilt and re-downloaded in
         * full on every deploy. Splitting it by vendor means a returning
         * visitor re-fetches only the chunks that actually changed — in
         * practice the app chunk, a few tens of kB — while React, Clerk,
         * Radix and Recharts keep their long-lived cache entries, and the
         * browser downloads them in parallel instead of end to end.
         *
         * BE CLEAR ABOUT WHAT THIS DOES NOT DO: the total bytes on a FIRST
         * load are unchanged, because every page is statically imported in
         * App.tsx and so every chunk is a dependency of the entry. Cutting
         * first-load bytes needs route-level `React.lazy`, which is a
         * different change.
         *
         * Grouped by top-level package, never by file, and never mixing
         * application code into a vendor chunk. Splitting a package across
         * chunks, or putting app code in with a library it imports, is how
         * you get a circular chunk graph and a "Cannot access before
         * initialization" that only appears in a production build.
         */
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;

          // React itself must be exactly one chunk. react-dom and the JSX
          // runtime share module-level state with it, so they go together.
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "react-vendor";
          }
          if (id.includes("@clerk")) return "clerk";
          // Recharts drags in the whole d3 family; on this app it is used by
          // the dashboard alone, so it is worth isolating.
          if (
            id.includes("recharts") ||
            id.includes("victory-vendor") ||
            /[\\/]node_modules[\\/]d3-/.test(id)
          ) {
            return "charts";
          }
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("lucide-react") || id.includes("react-icons")) {
            return "icons";
          }
          if (id.includes("date-fns")) return "date-fns";
          // Everything else stays in one shared vendor chunk rather than
          // becoming a long tail of tiny requests.
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
