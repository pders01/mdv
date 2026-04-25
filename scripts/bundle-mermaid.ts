#!/usr/bin/env bun
/**
 * Bundle mermaid into a single self-contained ESM module that the server can
 * embed and serve from /_static/mermaid.bundle.mjs.
 *
 * mermaid v11 ships as a small entry plus dozens of dynamic-import chunks;
 * shipping the whole node_modules/mermaid/dist/ tree (~38MB) into a compiled
 * binary is wasteful. Bun.build with `splitting: false` inlines the dynamic
 * imports into one file (~600KB), which is the right tradeoff for a feature
 * gated behind explicit opt-in (a ```mermaid fence in user docs).
 *
 * Run this whenever the mermaid version is bumped:
 *   bun run scripts/bundle-mermaid.ts
 *
 * The output is committed so the package builds without an install-time
 * postinstall step.
 */

import { join } from "path";

const root = join(import.meta.dir, "..");
const entry = require.resolve("mermaid/dist/mermaid.esm.min.mjs", { paths: [root] });
const outDir = join(root, "src/server/assets/vendor");

const result = await Bun.build({
  entrypoints: [entry],
  outdir: outDir,
  naming: "mermaid.bundle.mjs",
  target: "browser",
  format: "esm",
  splitting: false,
  minify: true,
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const out = result.outputs[0];
if (!out) {
  console.error("Bun.build produced no outputs");
  process.exit(1);
}

const sizeKb = (out.size / 1024).toFixed(1);
console.log(`Bundled mermaid → ${out.path} (${sizeKb} KB)`);
