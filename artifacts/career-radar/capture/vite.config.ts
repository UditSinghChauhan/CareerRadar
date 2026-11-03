/**
 * Dev server for scripts/capture-landing.mjs: the real app, with Clerk
 * swapped for clerk-stub.tsx and /api proxied to the local capture API
 * (artifacts/api-server/src/scripts/capture-server.ts). Not used by the
 * production build.
 */
import { defineConfig, mergeConfig } from "vite";
import path from "path";
import base from "../vite.config";

const here = import.meta.dirname;

export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^@clerk\/react\/internal$/,
          replacement: path.join(here, "clerk-internal-stub.ts"),
        },
        {
          find: /^@clerk\/react$/,
          replacement: path.join(here, "clerk-stub.tsx"),
        },
      ],
    },
    server: {
      proxy: {
        "/api": `http://127.0.0.1:${process.env.CAPTURE_API_PORT ?? 8099}`,
      },
    },
  }),
);
