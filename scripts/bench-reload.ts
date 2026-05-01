/**
 * Headless reload benchmark — measures the cost of swapping a file in the
 * TUI viewer. Compares two paths:
 *   1. construct: build a fresh MarkdownRenderable (the old reload behavior)
 *   2. mutate:    set .content on the existing renderable (the new path)
 *
 * Both paths are timed against the same fixture so the speed-up from
 * OpenTUI's incremental parser is visible in absolute milliseconds.
 *
 * Usage:
 *   bun run scripts/bench-reload.ts [path.md] [iterations]
 *
 * Defaults: src/__tests__/fixtures/big.md, 20 iterations.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { BundledTheme } from "shiki";
import { createTestRenderer } from "@opentui/core/testing";

import { extractThemeColors, resolveTheme } from "../src/theme/index.js";
import { MdvMarkdownRenderable } from "../src/ui/markdown.js";
import { createHighlighterInstance } from "../src/highlighting/shiki.js";
import { createRenderNode } from "../src/rendering/index.js";
import { createMainContainer } from "../src/ui/container.js";

interface CliFlags {
  filePath: string;
  iterations: number;
  width: number;
  height: number;
}

const DEFAULT_FIXTURE = "src/__tests__/fixtures/big.md";

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    filePath: DEFAULT_FIXTURE,
    iterations: 20,
    width: 120,
    height: 40,
  };
  const positional: string[] = [];
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--width=")) flags.width = Number(arg.slice("--width=".length));
    else if (arg.startsWith("--height=")) flags.height = Number(arg.slice("--height=".length));
    else positional.push(arg);
  }
  if (positional[0]) flags.filePath = positional[0];
  if (positional[1]) flags.iterations = Number(positional[1]);
  return flags;
}

function summarize(label: string, samples: number[]): void {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const avg = sum / samples.length;
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const p50 = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  console.log(
    `  ${label.padEnd(10)}  avg ${avg.toFixed(1).padStart(7)} ms  ` +
      `p50 ${p50.toFixed(1).padStart(7)} ms  ` +
      `p95 ${p95.toFixed(1).padStart(7)} ms  ` +
      `min ${min.toFixed(1).padStart(7)} ms  ` +
      `max ${max.toFixed(1).padStart(7)} ms`,
  );
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv);
  const filePath = resolve(flags.filePath);
  if (!existsSync(filePath)) {
    console.error(`fixture not found: ${filePath}`);
    process.exit(1);
  }
  const content = readFileSync(filePath, "utf8");
  const altered = content + "\n\n## bench-reload tail\n\nappended for incremental parse path.\n";

  const theme = resolveTheme("auto");
  const highlighter = await createHighlighterInstance(theme);
  const themeColors = extractThemeColors(highlighter.highlighter, theme as BundledTheme);
  highlighter.colors = themeColors;
  const { renderer, renderOnce } = await createTestRenderer({
    width: flags.width,
    height: flags.height,
  });

  const { container, scrollBox } = createMainContainer(renderer, content.split("\n"));
  const renderNode = createRenderNode(
    renderer,
    themeColors,
    highlighter,
    flags.width - 2,
    new Map(),
  );
  renderer.root.add(container);

  // Path 1: construct a fresh MarkdownRenderable each iteration. Mirrors
  // the pre-refactor reload code path — included as the regression baseline.
  const constructSamples: number[] = [];
  for (let i = 0; i < flags.iterations; i++) {
    const t0 = performance.now();
    const md = new MdvMarkdownRenderable(renderer, {
      id: `md-construct-${i}`,
      content: i % 2 === 0 ? altered : content,
      conceal: true,
      renderNode,
    });
    constructSamples.push(performance.now() - t0);
    scrollBox.add(md);
    await renderOnce();
    scrollBox.remove(md.id);
  }

  // Path 2: keep one MarkdownRenderable, mutate .content (the new path).
  const stable = new MdvMarkdownRenderable(renderer, {
    id: "md-stable",
    content,
    conceal: true,
    renderNode,
  });
  scrollBox.add(stable);
  await renderOnce();

  const mutateSamples: number[] = [];
  for (let i = 0; i < flags.iterations; i++) {
    const next = i % 2 === 0 ? altered : content;
    const t0 = performance.now();
    stable.content = next;
    mutateSamples.push(performance.now() - t0);
    await renderOnce();
  }

  console.log("");
  console.log(`bench-reload`);
  console.log(`  fixture     ${filePath}`);
  console.log(`  iterations  ${flags.iterations}`);
  console.log("");
  summarize("construct", constructSamples);
  summarize("mutate", mutateSamples);
  const speedup =
    constructSamples.reduce((a, b) => a + b, 0) /
    Math.max(0.001, mutateSamples.reduce((a, b) => a + b, 0));
  console.log("");
  console.log(`  speedup     ${speedup.toFixed(1)}x  (mutate vs construct on the same content)`);
  console.log("");

  renderer.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
