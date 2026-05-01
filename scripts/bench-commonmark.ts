#!/usr/bin/env bun
/**
 * Bench mdv's markdown parser against the CommonMark 0.31.2 spec.
 *
 * Renders each spec example with the same `marked` config the rest of the
 * codebase uses (`createMarkedOptions`) and compares to the expected HTML
 * after a tolerant normalization pass. Prints a per-section pass rate and
 * lists the first few failures per section for triage.
 *
 * Engine logic lives in `scripts/lib/commonmark-bench.ts` so the same code
 * can back the regression-gate test in `__tests__/golden/spec-threshold`.
 *
 * Usage:
 *   bun run scripts/bench-commonmark.ts                   # summary
 *   bun run scripts/bench-commonmark.ts --section Lists   # filter
 *   bun run scripts/bench-commonmark.ts --verbose         # full diffs
 *   bun run scripts/bench-commonmark.ts --json out.json   # machine output
 */

import { normalizeHtml, runBench } from "./lib/commonmark-bench.js";

async function main() {
  const args = Bun.argv.slice(2);
  const section = readFlag(args, "--section");
  const jsonOut = readFlag(args, "--json");
  const verbose = args.includes("--verbose");
  const limit = Number(readFlag(args, "--limit") ?? "0") || undefined;
  const showFailures = Number(readFlag(args, "--show-failures") ?? "3");

  const summary = await runBench({ section, limit });
  const pct = summary.total ? ((summary.pass / summary.total) * 100).toFixed(1) : "0.0";

  console.log(`CommonMark 0.31.2 — ${summary.pass}/${summary.total} (${pct}%)`);
  console.log("─".repeat(60));

  const sorted = [...summary.bySection.entries()].sort((a, b) => {
    return a[1].pass / a[1].total - b[1].pass / b[1].total;
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
          total: summary.total,
          pass: summary.pass,
          sections: Object.fromEntries(
            [...summary.bySection.entries()].map(([k, v]) => [k, { pass: v.pass, total: v.total }]),
          ),
          failures: summary.results
            .filter((r) => !r.pass)
            .map((r) => ({
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

await main();
