/**
 * TUI snapshot helper.
 *
 * Mirrors `scripts/bench-scroll.ts` setup but renders a single frame and
 * captures the char buffer via OpenTUI's TestRenderer. Output is plain text
 * (no ANSI), 80×40 viewport — cell-grid view of what the user would see at
 * top-of-document, before any scrolling.
 *
 * Theme is fixed to `github-dark` so snapshots stay deterministic across
 * machines and CI. Code-block syntax colors don't reach this surface
 * (`captureCharFrame` strips styles), so the snapshot reflects layout +
 * conceal + wrap behavior, not theme palettes.
 *
 * Highlighter is created lazily and reused — Shiki cold-start is ~150ms
 * per call, so sharing across snapshots keeps the test suite fast.
 */

import { createTestRenderer } from "@opentui/core/testing";
import type { BundledTheme } from "shiki";
import { extractThemeColors } from "../../theme/index.js";
import {
  createHighlighterInstance,
  loadLangsForContent,
  type HighlighterInstance,
} from "../../highlighting/shiki.js";
import { createRenderNode } from "../../rendering/index.js";
import { createMainContainer } from "../../ui/container.js";
import { MdvMarkdownRenderable } from "../../ui/markdown.js";

export const TUI_VIEWPORT_WIDTH = 80;
export const TUI_VIEWPORT_HEIGHT = 40;
export const TUI_THEME = "github-dark";

let sharedHighlighter: Promise<HighlighterInstance> | null = null;

export function getSharedHighlighter(): Promise<HighlighterInstance> {
  if (!sharedHighlighter) {
    sharedHighlighter = (async () => {
      const h = await createHighlighterInstance(TUI_THEME);
      h.colors = extractThemeColors(h.highlighter, TUI_THEME as BundledTheme);
      return h;
    })();
  }
  return sharedHighlighter;
}

export async function renderTuiSnapshot(content: string): Promise<string> {
  const highlighter = await getSharedHighlighter();
  await loadLangsForContent(highlighter, content);

  const { renderer, renderOnce, captureCharFrame } = await createTestRenderer({
    width: TUI_VIEWPORT_WIDTH,
    height: TUI_VIEWPORT_HEIGHT,
  });

  const contentLines = content.split("\n");
  const { container, scrollBox } = createMainContainer(renderer, contentLines);
  const renderNode = createRenderNode(
    renderer,
    highlighter.colors!,
    highlighter,
    TUI_VIEWPORT_WIDTH - 2,
    new Map(),
  );
  const markdown = new MdvMarkdownRenderable(renderer, {
    id: "markdown-content",
    content,
    conceal: true,
    renderNode,
  });
  scrollBox.add(markdown);
  renderer.root.add(container);

  // Two frames: first lays out, second paints final state. Without the
  // double pump, headings and inline tokens occasionally render half-styled
  // because OpenTUI's incremental parser hasn't settled yet.
  await renderOnce();
  await renderOnce();

  const frame = captureCharFrame();
  renderer.destroy();
  return frame;
}
