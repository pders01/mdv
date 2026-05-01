#!/usr/bin/env bun
/**
 * Bench mdv's markdown parser against the CommonMark 0.31.2 spec.
 *
 * Renders each spec example with the same `marked` config the rest of the
 * codebase uses (`createMarkedOptions`) and compares to the expected HTML
 * after a tolerant normalization pass. Prints a per-section pass rate and
 * lists the first few failures per section for triage.
 *
 * Usage:
 *   bun run scripts/bench-commonmark.ts                   # summary
 *   bun run scripts/bench-commonmark.ts --section Lists   # filter
 *   bun run scripts/bench-commonmark.ts --verbose         # full diffs
 *   bun run scripts/bench-commonmark.ts --json out.json   # machine output
 */

import { Marked } from "marked";
import { createMarkedOptions } from "../src/util/markdown.js";

const SPEC_URL = "https://spec.commonmark.org/0.31.2/spec.json";
const SPEC_CACHE = new URL("../.cache/commonmark-spec-0.31.2.json", import.meta.url);

interface SpecExample {
  markdown: string;
  html: string;
  example: number;
  start_line: number;
  end_line: number;
  section: string;
}

async function loadSpec(): Promise<SpecExample[]> {
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
function normalizeHtml(html: string): string {
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
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Result {
  example: SpecExample;
  pass: boolean;
  actual: string;
  error?: string;
}

async function run() {
  const args = Bun.argv.slice(2);
  const sectionFilter = readFlag(args, "--section");
  const jsonOut = readFlag(args, "--json");
  const verbose = args.includes("--verbose");
  const limit = Number(readFlag(args, "--limit") ?? "0") || Infinity;
  const showFailures = Number(readFlag(args, "--show-failures") ?? "3");

  const spec = await loadSpec();
  const filtered = sectionFilter
    ? spec.filter(e => e.section.toLowerCase().includes(sectionFilter.toLowerCase()))
    : spec;

  const marked = new Marked(createMarkedOptions());
  const results: Result[] = [];

  for (const ex of filtered.slice(0, limit)) {
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

  // Per-section aggregation.
  const bySection = new Map<string, { pass: number; total: number; failures: Result[] }>();
  for (const r of results) {
    const slot = bySection.get(r.example.section) ?? { pass: 0, total: 0, failures: [] };
    slot.total += 1;
    if (r.pass) slot.pass += 1;
    else slot.failures.push(r);
    bySection.set(r.example.section, slot);
  }

  const totalPass = results.filter(r => r.pass).length;
  const total = results.length;
  const pct = total ? ((totalPass / total) * 100).toFixed(1) : "0.0";

  console.log(`CommonMark 0.31.2 — ${totalPass}/${total} (${pct}%)`);
  console.log("─".repeat(60));

  const sorted = [...bySection.entries()].sort((a, b) => {
    const ra = a[1].pass / a[1].total;
    const rb = b[1].pass / b[1].total;
    return ra - rb;
  });

  for (const [section, slot] of sorted) {
    const sectionPct = ((slot.pass / slot.total) * 100).toFixed(0);
    const bar = renderBar(slot.pass / slot.total);
    console.log(`${bar} ${section.padEnd(32)} ${slot.pass}/${slot.total} (${sectionPct}%)`);
    if (verbose || (showFailures > 0 && slot.pass < slot.total)) {
      const sample = slot.failures.slice(0, verbose ? slot.failures.length : showFailures);
      for (const f of sample) {
        console.log(`    ex ${f.example.example} (line ${f.example.start_line})`);
        if (verbose) {
          console.log("    md:       " + JSON.stringify(f.example.markdown));
          console.log("    expected: " + JSON.stringify(normalizeHtml(f.example.html)));
          console.log("    actual:   " + JSON.stringify(normalizeHtml(f.actual)));
          if (f.error) console.log("    error:    " + f.error);
        }
      }
    }
  }

  if (jsonOut) {
    await Bun.write(
      jsonOut,
      JSON.stringify(
        {
          total,
          pass: totalPass,
          sections: Object.fromEntries(
            [...bySection.entries()].map(([k, v]) => [k, { pass: v.pass, total: v.total }]),
          ),
          failures: results
            .filter(r => !r.pass)
            .map(r => ({
              example: r.example.example,
              section: r.example.section,
              line: r.example.start_line,
              markdown: r.example.markdown,
              expected: r.example.html,
              actual: r.actual,
              error: r.error,
            })),
        },
        null,
        2,
      ),
    );
    console.log(`\nWrote ${jsonOut}`);
  }
}

function readFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1];
}

function renderBar(ratio: number): string {
  const width = 10;
  const filled = Math.round(ratio * width);
  return "[" + "█".repeat(filled) + " ".repeat(width - filled) + "]";
}

await run();
