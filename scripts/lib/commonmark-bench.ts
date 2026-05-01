/**
 * CommonMark 0.31.2 conformance bench engine.
 *
 * Pure logic, no CLI plumbing — used by both `scripts/bench-commonmark.ts`
 * (interactive summary, JSON export) and the regression-gate test
 * `src/__tests__/golden/spec-threshold.test.ts`.
 *
 * Loads the spec JSON from `.cache/` (downloaded on first call), parses
 * each example with the project's shared marked config, and compares the
 * rendered HTML against expected after a tolerant normalization pass.
 */

import { Marked } from "marked";
import { createMarkedOptions } from "../../src/util/markdown.js";

const SPEC_URL = "https://spec.commonmark.org/0.31.2/spec.json";
const SPEC_CACHE = new URL("../../.cache/commonmark-spec-0.31.2.json", import.meta.url);

export interface SpecExample {
  markdown: string;
  html: string;
  example: number;
  start_line: number;
  end_line: number;
  section: string;
}

export interface ExampleResult {
  example: SpecExample;
  pass: boolean;
  actual: string;
  error?: string;
}

export interface BenchSummary {
  total: number;
  pass: number;
  results: ExampleResult[];
  bySection: Map<string, { pass: number; total: number; failures: ExampleResult[] }>;
}

export async function loadSpec(): Promise<SpecExample[]> {
  const cache = Bun.file(SPEC_CACHE);
  if (await cache.exists()) {
    return (await cache.json()) as SpecExample[];
  }
  const res = await fetch(SPEC_URL);
  if (!res.ok) throw new Error(`Spec fetch failed: ${res.status}`);
  const text = await res.text();
  await Bun.write(SPEC_CACHE, text);
  return JSON.parse(text) as SpecExample[];
}

/**
 * Normalize HTML for comparison. Modeled on CommonMark dingus normalizer:
 * collapse whitespace between block-level tags, trim, lowercase tag names.
 * Tolerant enough that minor formatting churn (e.g. self-closing slashes,
 * attribute order) doesn't count as a conformance failure.
 */
export function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+(?=<\/?(p|h[1-6]|ul|ol|li|blockquote|pre|hr|table|thead|tbody|tr|td|th|div)\b)/gi, "")
    .replace(/(<\/?(p|h[1-6]|ul|ol|li|blockquote|pre|hr|table|thead|tbody|tr|td|th|div)\b[^>]*>)\s+/gi, "$1")
    .replace(/<(\/?)([A-Za-z][A-Za-z0-9]*)/g, (_m, slash, name) => `<${slash}${name.toLowerCase()}`)
    // HTML5 void tags: `<br />` and `<br>` are equivalent — collapse to bare form
    .replace(/<(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)([^>]*?)\s*\/?>/gi,
      (_m, tag, attrs) => `<${tag.toLowerCase()}${attrs.replace(/\s+/g, " ").replace(/\s+$/, "")}>`)
    .replace(/[ \t]+\n/g, "\n")
    // Spec emits `<br>\n`; some renderers drop the trailing newline. Equivalent.
    .replace(/<br>\s*/g, "<br>\n")
    // `'` ↔ `&#39;` ↔ `&apos;` — all browser-equivalent. Spec uses bare `'`.
    .replace(/&#39;|&apos;/g, "'")
    // Empty fenced code: marked emits `<pre><code>\n</code></pre>`; spec emits `<pre><code></code></pre>`.
    // Both render identically.
    .replace(/<pre><code([^>]*)>\n<\/code><\/pre>/g, "<pre><code$1></code></pre>")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface RunOptions {
  /** Filter by section name (case-insensitive substring match). */
  section?: string;
  /** Cap the number of examples processed (default: all). */
  limit?: number;
}

export async function runBench(opts: RunOptions = {}): Promise<BenchSummary> {
  const spec = await loadSpec();
  const filtered = opts.section
    ? spec.filter((e) => e.section.toLowerCase().includes(opts.section!.toLowerCase()))
    : spec;
  const subset = filtered.slice(0, opts.limit ?? filtered.length);

  const marked = new Marked(createMarkedOptions());
  const results: ExampleResult[] = [];

  for (const ex of subset) {
    let actual = "";
    let error: string | undefined;
    try {
      actual = (await marked.parse(ex.markdown)) as string;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const pass = !error && normalizeHtml(actual) === normalizeHtml(ex.html);
    results.push({ example: ex, pass, actual, error });
  }

  const bySection = new Map<string, { pass: number; total: number; failures: ExampleResult[] }>();
  for (const r of results) {
    const slot = bySection.get(r.example.section) ?? { pass: 0, total: 0, failures: [] };
    slot.total += 1;
    if (r.pass) slot.pass += 1;
    else slot.failures.push(r);
    bySection.set(r.example.section, slot);
  }

  return {
    total: results.length,
    pass: results.filter((r) => r.pass).length,
    results,
    bySection,
  };
}
