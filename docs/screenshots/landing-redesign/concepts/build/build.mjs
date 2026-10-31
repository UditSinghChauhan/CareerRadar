// Builds the concept assets. Run from the repo root after `pnpm install` and
// `pnpm --filter @workspace/career-radar run build`:
//   node docs/screenshots/landing-redesign/concepts/build/build.mjs
import { createRequire } from "node:module";
import { copyFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../../..");
const app = join(root, "artifacts/career-radar");
const out = resolve(here, "../assets");
const require = createRequire(join(root, "artifacts/api-server/package.json"));
const esbuild = require("esbuild");

await esbuild.build({
  entryPoints: [join(here, "entry.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: join(out, "concepts.js"),
  tsconfig: join(app, "tsconfig.json"),
  nodePaths: [join(app, "node_modules")],
  alias: { "@": join(app, "src") },
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.env.BASE_URL": '"/"',
  },
  loader: { ".css": "empty" },
  logLevel: "warning",
});

const css = readdirSync(join(app, "dist/public/assets")).find(
  (f) => f.startsWith("index-") && f.endsWith(".css"),
);
copyFileSync(join(app, "dist/public/assets", css), join(out, "app.css"));
console.log(`built concepts.js and copied ${css} to app.css`);
