/**
 * Headless scroll benchmark — measures frame time across N synthetic
 * j-keypresses against a real markdown surface, exercising the same
 * pipeline the TUI uses (cursor, scrollToCursor, MarkdownRenderable).
 *
 * Usage:
 *   bun run scripts/bench-scroll.ts [path.md] [iterations] [--width=120] [--height=40]
 *
 * Defaults: src/__tests__/fixtures/big.md, 500 iterations, 120x40 viewport.
 *
 * Output: avg / p50 / p95 / min / max frame time over the bench window
 * plus total elapsed. Stable enough to A/B changes; short enough that
 * a typical run fits in a few seconds.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { BundledTheme } from "shiki";
import { type KeyEvent } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";

import { extractThemeColors, createSyntaxStyle, resolveTheme } from "../src/theme/index.js";
import { createHighlighterInstance, loadLangsForContent } from "../src/highlighting/shiki.js";
import { createRenderNode } from "../src/rendering/index.js";
import { createMainContainer } from "../src/ui/container.js";
import { MdvMarkdownRenderable } from "../src/ui/markdown.js";
import { createCursorManager } from "../src/input/cursor.js";
import { SearchManager } from "../src/input/search.js";
import { handleContentKey, type KeyboardState } from "../src/input/keyboard.js";
import { phase, phaseSync, setPhaseEnabled, dumpPhases } from "../src/perf/phase.js";

interface CliFlags {
  filePath: string;
  iterations: number;
  width: number;
  height: number;
}

const DEFAULTS: Omit<CliFlags, "filePath"> = {
  iterations: 500,
  width: 120,
  height: 40,
};
const DEFAULT_FIXTURE = "src/__tests__/fixtures/big.md";

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { filePath: DEFAULT_FIXTURE, ...DEFAULTS };
  const positional: string[] = [];
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--width=")) flags.width = Number(arg.slice("--width=".length));
    else if (arg.startsWith("--height=")) flags.height = Number(arg.slice("--height=".length));
    else if (arg.startsWith("--iterations=")) flags.iterations = Number(arg.slice("--iterations=".length));
    else positional.push(arg);
  }
  if (positional[0]) flags.filePath = positional[0];
  if (positional[1]) flags.iterations = Number(positional[1]);
  return flags;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function fmtMs(n: number): string {
  return `${n.toFixed(2)} ms`;
}

async function main(): Promise<void> {
  const flags = parseArgs(process.argv);
  const filePath = resolve(flags.filePath);
  if (!existsSync(filePath)) {
    console.error(`fixture not found: ${filePath}`);
    console.error(
      "(generate with: bun run scripts/gen-bench-fixture.ts; or pass a real .md path)",
    );
    process.exit(1);
  }
  const content = readFileSync(filePath, "utf8");
  const contentLines = content.split("\n");

  setPhaseEnabled(true);

  const theme = resolveTheme("auto");
  const highlighter = await phase("shiki:create", () => createHighlighterInstance(theme));
  const themeColors = phaseSync("theme:extract", () =>
    extractThemeColors(highlighter.highlighter, theme as BundledTheme),
  );
  highlighter.colors = themeColors;
  await phase("shiki:load-langs", () => loadLangsForContent(highlighter, content));
  void createSyntaxStyle;

  const { renderer, mockInput, renderOnce } = await phase("renderer:create", () =>
    createTestRenderer({ width: flags.width, height: flags.height }),
  );

  const cursor = createCursorManager(contentLines.length, () => {});
  const search = new SearchManager();

  const { container, scrollBox, setupHighlighting } = phaseSync("container:create", () =>
    createMainContainer(renderer, contentLines),
  );
  const renderNode = phaseSync("render-node:create", () =>
    createRenderNode(renderer, themeColors, highlighter, flags.width - 2, new Map()),
  );
  const markdown = phaseSync(
    "markdown:construct",
    () =>
      new MdvMarkdownRenderable(renderer, {
        id: "markdown-content",
        content,
        conceal: true,
        renderNode,
      }),
  );
  scrollBox.add(markdown);
  const { getContentLineY } = phaseSync("highlighting:setup", () =>
    setupHighlighting(
      () => ({
        mode: cursor.mode,
        cursorLine: cursor.cursorLine,
        selectionStart: cursor.selectionStart,
        selectionEnd: cursor.selectionEnd,
        searchMatches: search.matches,
      }),
      themeColors.cyan,
      themeColors.yellow,
      themeColors.codeBg,
      themeColors.orange,
      themeColors.bg,
      markdown,
    ),
  );
  renderer.root.add(container);
  dumpPhases("[perf:startup]");
  setPhaseEnabled(false);

  const state: KeyboardState = { lastKey: "", lastKeyTime: 0 };
  const fireKey = (name: string) => {
    const event: KeyEvent = {
      name,
      sequence: name,
      ctrl: false,
      meta: false,
      shift: false,
      raw: name,
      number: false,
      code: undefined,
    } as unknown as KeyEvent;
    handleContentKey(event, {
      renderer,
      scrollBox,
      cursor,
      content,
      contentLines,
      showNotification: () => {},
      search,
      onSearchUpdate: () => {},
      getContentLineY,
    }, state);
  };

  // Warm-up: first few frames pay one-time costs (Shiki cache fill, layout).
  for (let i = 0; i < 5; i++) await renderOnce();

  renderer.setGatherStats(true);
  renderer.resetStats();
  const frameTimes: number[] = [];
  const start = performance.now();
  for (let i = 0; i < flags.iterations; i++) {
    fireKey("j");
    const t0 = performance.now();
    await renderOnce();
    frameTimes.push(performance.now() - t0);
  }
  const totalMs = performance.now() - start;
  const stats = renderer.getStats();

  const sorted = [...frameTimes].sort((a, b) => a - b);
  const sum = frameTimes.reduce((a, b) => a + b, 0);
  const avg = sum / frameTimes.length;
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;

  console.log("");
  console.log(`bench-scroll`);
  console.log(`  fixture     ${filePath}`);
  console.log(`  lines       ${contentLines.length}`);
  console.log(`  viewport    ${flags.width}x${flags.height}`);
  console.log(`  iterations  ${flags.iterations}`);
  console.log(`  total       ${fmtMs(totalMs)} (${(flags.iterations / (totalMs / 1000)).toFixed(1)} keys/s)`);
  console.log("");
  console.log(`  per-frame (handle key + renderOnce):`);
  console.log(`    avg  ${fmtMs(avg)}`);
  console.log(`    p50  ${fmtMs(p50)}`);
  console.log(`    p95  ${fmtMs(p95)}`);
  console.log(`    p99  ${fmtMs(p99)}`);
  console.log(`    min  ${fmtMs(min)}`);
  console.log(`    max  ${fmtMs(max)}`);
  console.log("");
  console.log(`  renderer.getStats() (internal frame loop):`);
  console.log(`    fps        ${stats.fps.toFixed(1)}`);
  console.log(`    frames     ${stats.frameCount}`);
  console.log(`    avgFrame   ${fmtMs(stats.averageFrameTime)}`);
  console.log(`    minFrame   ${fmtMs(stats.minFrameTime)}`);
  console.log(`    maxFrame   ${fmtMs(stats.maxFrameTime)}`);
  console.log("");

  // Suppress unused warning; mockInput is part of the public test API and kept
  // here so future scenarios can exercise it without re-plumbing the harness.
  void mockInput;

  renderer.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
