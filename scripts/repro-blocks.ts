/**
 * Diagnostic: dump per-block source span, rendered r.height and the
 * resulting lineHeight. Cursor-row drift shows up here as fractional
 * lineHeight values. CJK content is exposed at narrow widths because
 * wrap inflates r.height beyond the source line count.
 *
 * Usage:
 *   bun run scripts/repro-blocks.ts [file.md]
 *   W=30 H=40 bun run scripts/repro-blocks.ts [file.md]   # force wrap
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BundledTheme } from "shiki";
import { createTestRenderer } from "@opentui/core/testing";

import { extractThemeColors, resolveTheme } from "../src/theme/index.js";
import { createHighlighterInstance, loadLangsForContent } from "../src/highlighting/shiki.js";
import { createRenderNode } from "../src/rendering/index.js";
import { createMainContainer } from "../src/ui/container.js";
import { MdvMarkdownRenderable } from "../src/ui/markdown.js";

const WIDTH = Number(process.env.W ?? 80);
const HEIGHT = Number(process.env.H ?? 40);

const filePath = resolve(process.argv[2] ?? "/tmp/repro-long.md");
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

const { renderer, renderOnce } = await createTestRenderer({ width: WIDTH, height: HEIGHT });
const { container, scrollBox } = createMainContainer(renderer, contentLines);
const renderNode = createRenderNode(renderer, themeColors, highlighter, WIDTH - 2, new Map());
const markdown = new MdvMarkdownRenderable(renderer, {
  id: "md",
  content,
  conceal: true,
  renderNode,
});
scrollBox.add(markdown);
renderer.root.add(container);

await renderOnce();
await renderOnce();

const blockStates = markdown.blockStates;

for (let blockIdx = 0; blockIdx < blockStates.length; blockIdx++) {
  const state = blockStates[blockIdx]!;
  const span = state.spec.source ?? { start: 0, end: 0 };
  const linesInToken = span.end - span.start + 1;
  const r = state.renderable;
  const preview = contentLines
    .slice(span.start, span.end + 1)
    .join("\\n")
    .slice(0, 60);
  console.log(
    `block ${String(blockIdx).padStart(2)}  ` +
      `startLine=${String(span.start).padStart(3)}  ` +
      `linesInToken=${String(linesInToken).padStart(2)}  ` +
      `r.y=${String(r.y).padStart(3)}  ` +
      `r.height=${String(r.height).padStart(2)}  ` +
      `lineHeight=${(r.height / Math.max(1, linesInToken)).toFixed(3)}  ` +
      `raw="${preview}"`,
  );
  const getChildren =
    (r as unknown as { getChildren?: () => Array<{ y: number; height: number }> }).getChildren;
  if (typeof getChildren === "function") {
    const children = getChildren.call(r);
    if (children.length > 0) {
      const list = children
        .map((c, i) => `${i}:y=${c.y},h=${c.height}`)
        .join(" ");
      console.log(`         children: ${list}`);
    }
  }
}

renderer.destroy();
