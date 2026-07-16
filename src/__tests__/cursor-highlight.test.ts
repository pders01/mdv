/**
 * Cursor / code-bg / search-highlight tests.
 *
 * Golden char-frame snapshots strip all styling and only capture text, so
 * every regression that's a misplaced colored overlay (cursor row tint
 * landing on the wrong line, code background spilling past a fence,
 * search highlight at the wrong column) sailed past the test suite until
 * now. This file mirrors the user-perceived breakages directly by
 * capturing the rendered bg spans and asserting which row owns each tint.
 */

import { describe, it, expect } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import type { BundledTheme } from "shiki";
import type { KeyEvent } from "@opentui/core";

import { extractThemeColors, resolveTheme } from "../theme/index.js";
import { createHighlighterInstance, loadLangsForContent } from "../highlighting/shiki.js";
import { createRenderNode } from "../rendering/index.js";
import { createMainContainer } from "../ui/container.js";
import { MdvMarkdownRenderable } from "../ui/markdown.js";
import { createCursorManager } from "../input/cursor.js";
import { SearchManager } from "../input/search.js";
import { handleContentKey, type KeyboardState } from "../input/keyboard.js";

const WIDTH = 80;
const HEIGHT = 40;

async function setup(content: string) {
  const contentLines = content.split("\n");
  const theme = resolveTheme("github-dark");
  const highlighter = await createHighlighterInstance(theme);
  const themeColors = extractThemeColors(highlighter.highlighter, theme as BundledTheme);
  highlighter.colors = themeColors;
  await loadLangsForContent(highlighter, content);

  const r = await createTestRenderer({ width: WIDTH, height: HEIGHT });
  const cursor = createCursorManager(contentLines.length, () => {});
  const search = new SearchManager();
  const { container, scrollBox, setupHighlighting } = createMainContainer(r.renderer, contentLines);
  const renderNode = createRenderNode(r.renderer, themeColors, highlighter, WIDTH - 2, new Map());
  const markdown = new MdvMarkdownRenderable(r.renderer, {
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
  r.renderer.root.add(container);

  const state: KeyboardState = { lastKey: "", lastKeyTime: 0 };
  const fire = (name: string) =>
    handleContentKey(
      {
        name,
        sequence: name,
        ctrl: false,
        shift: false,
        meta: false,
        raw: name,
      } as unknown as KeyEvent,
      {
        renderer: r.renderer,
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

  await r.renderOnce();
  await r.renderOnce();
  return { ...r, cursor, fire, themeColors, scrollBox };
}

function rowBg(
  frame: ReturnType<Awaited<ReturnType<typeof setup>>["captureSpans"]>,
  y: number,
): string {
  const line = frame.lines[y];
  if (!line || line.spans.length === 0) return "transparent";
  // Pick the dominant bg from the longest span (excludes random 1-cell gaps).
  const span = line.spans.reduce((a, b) => (a.width >= b.width ? a : b));
  const { r, g, b } = span.bg;
  const hex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function findRowContaining(
  frame: ReturnType<Awaited<ReturnType<typeof setup>>["captureSpans"]>,
  needle: string,
): number {
  for (let y = 0; y < frame.lines.length; y++) {
    const text = frame.lines[y]!.spans.map((s) => s.text).join("");
    if (text.includes(needle)) return y;
  }
  return -1;
}

describe("cursor row highlight", () => {
  it("paints exactly one row's worth of tint for a single-source-line block", async () => {
    const md = `# Title

Some paragraph.

Another paragraph here.
`;
    const ctx = await setup(md);

    // Clicking must not activate OpenTUI's built-in j/k viewport scrolling;
    // mdv owns keyboard movement through CursorManager.
    expect(ctx.scrollBox.focusable).toBe(false);

    // Move cursor to "Another paragraph here." (cursorLine 4 in source).
    while (ctx.cursor.cursorLine < 4) ctx.fire("j");
    await ctx.renderOnce();

    const frame = ctx.captureSpans();
    const targetY = findRowContaining(frame, "Another paragraph");
    expect(targetY).toBeGreaterThan(-1);

    const cursorBg = rowBg(frame, targetY);
    const neighborBg = rowBg(frame, targetY - 1);
    expect(cursorBg).not.toBe(neighborBg);

    const twoAboveBg = rowBg(frame, targetY - 2);
    // The row above the cursor must NOT also carry the cursor tint —
    // that's the "double-row highlight" regression.
    expect(twoAboveBg === cursorBg).toBe(false);
  });

  it("keeps cursor tint inside the code block when cursor is on a content line that wraps", async () => {
    // 80-wide viewport, content width = 78 - 2 padding = 76. The long import
    // line is > 76 cells so it wraps to 2 rows. The next source line
    // ("const renderer = ...") must NOT get tinted when the cursor is on
    // the import line.
    const md = `# Title

\`\`\`ts
import { BoxRenderable, TextRenderable, InputRenderable, createCliRenderer, type RenderContext } from "@opentui/core"
const renderer = await createCliRenderer()
\`\`\`

After.
`;
    const ctx = await setup(md);

    // Cursor 0 is "# Title" (line 0). j → line 2 (open fence, cursorable),
    // j → line 3 (import line).
    while (ctx.cursor.cursorLine < 3) ctx.fire("j");
    await ctx.renderOnce();

    const frame = ctx.captureSpans();
    const importY = findRowContaining(frame, "import {");
    const constY = findRowContaining(frame, "const renderer");
    expect(importY).toBeGreaterThan(-1);
    expect(constY).toBeGreaterThan(-1);

    const importBg = rowBg(frame, importY);
    const constBg = rowBg(frame, constY);

    // The const-renderer row must not share the cursor-tint bg of the
    // import row — that's exactly the wrap-bleed regression the screenshot
    // exposed.
    expect(constBg).not.toBe(importBg);
  });
});
