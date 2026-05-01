/**
 * Golden snapshot helper.
 *
 * Renders markdown via the production server pipeline (`renderMarkdown`)
 * but with a stub code adapter that emits stable plain HTML — no Shiki
 * theme styles, no Mermaid SVGs. Snapshots stay small, deterministic, and
 * focused on parser + token-renderer behavior. The Shiki integration has
 * its own dedicated tests in `src/__tests__/server/html.test.ts`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CodeAdapterRegistry, type CodeAdapter } from "../../server/adapters/index.js";
import { renderMarkdown } from "../../server/html.js";

export const GOLDEN_INPUTS_DIR = join(import.meta.dir, "inputs");
export const GOLDEN_EXPECTED_DIR = join(import.meta.dir, "expected");

/**
 * Stable adapter — escapes the source and wraps in `<pre><code>` with the
 * language as a class. Mirrors what marked's default code renderer would
 * do, just without Shiki's per-token color spans.
 */
const plainAdapter: CodeAdapter = {
  langs: ["*"],
  render(code, lang) {
    const cls = lang ? ` class="language-${escapeAttr(lang)}"` : "";
    return `<pre><code${cls}>${escapeHtml(code)}</code></pre>\n`;
  },
};

export function makeGoldenRegistry(): CodeAdapterRegistry {
  const r = new CodeAdapterRegistry();
  r.register(plainAdapter);
  return r;
}

export function listGoldenInputs(): string[] {
  return readdirSync(GOLDEN_INPUTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

export function readInput(name: string): string {
  return readFileSync(join(GOLDEN_INPUTS_DIR, name), "utf8");
}

export function expectedPath(name: string): string {
  return join(GOLDEN_EXPECTED_DIR, name.replace(/\.md$/, ".expected.html"));
}

export function readExpected(name: string): string {
  return readFileSync(expectedPath(name), "utf8");
}

export function renderGolden(source: string): string {
  return renderMarkdown(makeGoldenRegistry(), source);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
