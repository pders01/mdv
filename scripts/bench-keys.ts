/**
 * Per-action keybinding benchmark — separates the cost of each handler
 * branch (j/k scroll, n/N search, gg/G jump, V/y visual yank) so we know
 * which path actually drives perceived sluggishness.
 *
 * Each scenario fires a key sequence, times the handleContentKey pass and
 * the renderOnce that follows, and prints per-key avg/p95/p99/max plus
 * total elapsed. Cold paths get warm-up iterations.
 *
 * Usage:
 *   bun run scripts/bench-keys.ts [path.md] [iterationsPerScenario]
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { BundledTheme } from "shiki";
import { type KeyEvent } from "@opentui/core";
import { MdvMarkdownRenderable } from "../src/ui/markdown.js";
import { createTestRenderer } from "@opentui/core/testing";

import { extractThemeColors, resolveTheme } from "../src/theme/index.js";
import { createHighlighterInstance, loadLangsForContent } from "../src/highlighting/shiki.js";
import { createRenderNode } from "../src/rendering/index.js";
import { createMainContainer } from "../src/ui/container.js";
import { createCursorManager } from "../src/input/cursor.js";
import { SearchManager } from "../src/input/search.js";
import { handleContentKey, type KeyboardState } from "../src/input/keyboard.js";

const DEFAULT_FIXTURE = "src/__tests__/fixtures/big.md";

interface KeyStroke {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  sequence?: string;
}

interface Scenario {
  label: string;
  /** Sequence of keys to issue per iteration. */
  keys: KeyStroke[];
  warmup?: number;
}

function makeEvent(stroke: KeyStroke): KeyEvent {
  return {
    name: stroke.name,
    sequence: stroke.sequence ?? stroke.name,
    ctrl: stroke.ctrl ?? false,
    shift: stroke.shift ?? false,
    meta: false,
    raw: stroke.sequence ?? stroke.name,
  } as unknown as KeyEvent;
}

function summarize(label: string, samples: number[]): void {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const avg = sum / samples.length;
  const p50 = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]!;
  const max = sorted[sorted.length - 1]!;
  const total = sum;
  console.log(
    `  ${label.padEnd(22)}  ` +
      `avg ${avg.toFixed(2).padStart(6)}ms  ` +
      `p50 ${p50.toFixed(2).padStart(6)}ms  ` +
      `p95 ${p95.toFixed(2).padStart(6)}ms  ` +
      `p99 ${p99.toFixed(2).padStart(6)}ms  ` +
      `max ${max.toFixed(2).padStart(6)}ms  ` +
      `total ${total.toFixed(1)}ms`,
  );
}

async function main(): Promise<void> {
  const filePath = resolve(process.argv[2] ?? DEFAULT_FIXTURE);
  const iterations = Number(process.argv[3] ?? 200);
  if (!existsSync(filePath)) {
    console.error(`fixture not found: ${filePath}`);
    process.exit(1);
  }
  const content = readFileSync(filePath, "utf8");
  const contentLines = content.split("\n");

  const theme = resolveTheme("auto");
  const highlighter = await createHighlighterInstance(theme);
  const themeColors = extractThemeColors(highlighter.highlighter, theme as BundledTheme);
  highlighter.colors = themeColors;
  await loadLangsForContent(highlighter, content);
  const { renderer, renderOnce } = await createTestRenderer({ width: 120, height: 40 });
  const cursor = createCursorManager(contentLines.length, () => {});
  const search = new SearchManager();
  const { container, scrollBox, setupHighlighting } = createMainContainer(renderer, contentLines);
  const renderNode = createRenderNode(renderer, themeColors, highlighter, 118, new Map());
  const markdown = new MdvMarkdownRenderable(renderer, {
    id: "md",
    content,
    conceal: true,
    renderNode,
  });
  scrollBox.add(markdown);
  const { getContentLineY } = setupHighlighting(
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
  );
  renderer.root.add(container);

  const state: KeyboardState = { lastKey: "", lastKeyTime: 0 };
  const fire = (stroke: KeyStroke) =>
    handleContentKey(
      makeEvent(stroke),
      {
        renderer,
        scrollBox,
        cursor,
        content,
        contentLines,
        showNotification: () => {},
        search,
        onSearchUpdate: () => {},
        getContentLineY,
      },
      state,
    );

  // Warm-up: pay one-time costs (line mappings, layout, shiki cache).
  for (let i = 0; i < 8; i++) await renderOnce();

  const scenarios: Scenario[] = [
    { label: "j (down 1)", keys: [{ name: "j" }] },
    { label: "k (up 1)", keys: [{ name: "k" }] },
    { label: "ctrl-d (half-page)", keys: [{ name: "d", ctrl: true }] },
    { label: "ctrl-u (half-page up)", keys: [{ name: "u", ctrl: true }] },
    {
      label: "gg (top)",
      keys: [{ name: "g" }, { name: "g" }],
    },
    { label: "G (bottom)", keys: [{ name: "G", shift: true }] },
    {
      label: "V then j*5",
      keys: [
        { name: "V", shift: true },
        { name: "j" },
        { name: "j" },
        { name: "j" },
        { name: "j" },
        { name: "j" },
        { name: "escape" },
      ],
    },
    {
      label: "/ + the + Enter",
      keys: [
        { name: "/", sequence: "/" },
        { name: "t", sequence: "t" },
        { name: "h", sequence: "h" },
        { name: "e", sequence: "e" },
        { name: "return" },
      ],
    },
    { label: "n (next match)", keys: [{ name: "n" }] },
    { label: "N (prev match)", keys: [{ name: "N", shift: true }] },
  ];

  console.log("");
  console.log(`bench-keys`);
  console.log(`  fixture     ${filePath}`);
  console.log(`  lines       ${contentLines.length}`);
  console.log(`  iterations  ${iterations} per scenario`);
  console.log("");

  for (const scenario of scenarios) {
    // Pre-arm: search scenarios depend on a confirmed search; "n/N" want
    // an active pattern. Run the search-confirm scenario once before n/N
    // to ensure matches exist.
    if (scenario.label.startsWith("n ") || scenario.label.startsWith("N ")) {
      // Make sure pattern is set
      if (!search.pattern) {
        for (const s of [
          { name: "/", sequence: "/" },
          { name: "t", sequence: "t" },
          { name: "h", sequence: "h" },
          { name: "e", sequence: "e" },
          { name: "return" },
        ] as KeyStroke[])
          fire(s);
        await renderOnce();
      }
    }

    // warm-up
    for (let i = 0; i < (scenario.warmup ?? 3); i++) {
      for (const s of scenario.keys) fire(s);
      await renderOnce();
    }

    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now();
      for (const s of scenario.keys) fire(s);
      await renderOnce();
      samples.push(performance.now() - t0);
    }
    summarize(scenario.label, samples);
  }

  console.log("");
  renderer.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
