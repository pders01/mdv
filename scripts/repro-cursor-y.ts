/**
 * Diagnostic: print cursorLine → expected y for every cursorable source line.
 * Fractional y or y not in [r.y, r.y + r.height - 1] of the line's block
 * signals cursor-row drift. Use W=, H= env vars to force wrap.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { BundledTheme } from "shiki";
import type { KeyEvent } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";

import { extractThemeColors, resolveTheme } from "../src/theme/index.js";
import { createHighlighterInstance, loadLangsForContent } from "../src/highlighting/shiki.js";
import { createRenderNode } from "../src/rendering/index.js";
import { createMainContainer } from "../src/ui/container.js";
import { MdvMarkdownRenderable } from "../src/ui/markdown.js";
import { createCursorManager } from "../src/input/cursor.js";
import { SearchManager } from "../src/input/search.js";
import { handleContentKey, type KeyboardState } from "../src/input/keyboard.js";

const WIDTH = Number(process.env.W ?? 80);
const HEIGHT = Number(process.env.H ?? 40);

const filePath = resolve(process.argv[2] ?? "/tmp/repro-long.md");
const steps = Number(process.argv[3] ?? 30);

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
const cursor = createCursorManager(contentLines.length, () => {});
const search = new SearchManager();
const { container, scrollBox, setupHighlighting } = createMainContainer(renderer, contentLines);
const renderNode = createRenderNode(renderer, themeColors, highlighter, WIDTH - 2, new Map());
const markdown = new MdvMarkdownRenderable(renderer, { id: "md", content, conceal: true, renderNode });
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
const fire = (name: string) =>
  handleContentKey(
    { name, sequence: name, ctrl: false, shift: false, meta: false, raw: name } as unknown as KeyEvent,
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

await renderOnce();
await renderOnce();

for (let i = 0; i <= steps; i++) {
  const y = getContentLineY(cursor.cursorLine);
  const integral = typeof y === "number" && Number.isInteger(y) ? "✓" : "✗";
  console.log(
    `step ${String(i).padStart(2)} cursorLine=${String(cursor.cursorLine).padStart(3)} y=${String(y).padStart(6)} ${integral}`,
  );
  fire("j");
  await renderOnce();
}

renderer.destroy();
