/**
 * Main container and scroll box setup
 */

import {
  BoxRenderable,
  ScrollBoxRenderable,
  RGBA,
  type CliRenderer,
} from "@opentui/core";
import type { MdvMarkdownRenderable } from "./markdown.js";
import type { Mode } from "../types.js";
import type { SearchMatch } from "../input/search.js";

/**
 * Pre-blend a foreground color over a background at `alpha` and return a
 * fully opaque RGBA. OpenTUI's fillRect blends against whatever is in the
 * cell buffer, which is uninitialized/transparent for our render hooks —
 * a 0.08-alpha cyan therefore renders as 8% cyan on black (~dark teal),
 * not 8% cyan on theme bg as intended. Doing the blend in JS sidesteps it.
 */
function blendOver(fg: InstanceType<typeof RGBA>, bg: InstanceType<typeof RGBA>, alpha: number): InstanceType<typeof RGBA> {
  return RGBA.fromValues(
    fg.r * alpha + bg.r * (1 - alpha),
    fg.g * alpha + bg.g * (1 - alpha),
    fg.b * alpha + bg.b * (1 - alpha),
    1,
  );
}

/**
 * BlockState from OpenTUI's MdvMarkdownRenderable internal state
 */
interface BlockState {
  token: { type: string; raw: string };
  tokenRaw: string;
  renderable: { x: number; y: number; width: number; height: number };
}

/**
 * Cursor/selection state for rendering
 */
export interface CursorRenderState {
  mode: Mode;
  cursorLine: number;
  selectionStart: number;
  selectionEnd: number;
  searchMatches: ReadonlyArray<SearchMatch>;
}

/**
 * Line position info (absolute Y, not scroll-adjusted)
 */
export interface LinePosition {
  x: number;
  y: number;
  height: number;
}

/**
 * Function to get line position from actual rendered blocks
 */
export type GetLinePosition = (line: number) => LinePosition | null;

/**
 * Function to get content-space Y for a line (scroll-independent).
 * Uses relative block positions so the result doesn't depend on scrollTop.
 */
export type GetContentLineY = (line: number) => number | null;

/**
 * Container setup result
 */
export interface ContainerSetup {
  container: BoxRenderable;
  scrollBox: ScrollBoxRenderable;
  setupHighlighting: (
    getCursorState: () => CursorRenderState,
    cursorColor: string,
    selectionColor: string,
    codeBgColor: string,
    searchHighlightColor: string,
    bgColor: string,
    markdown: MdvMarkdownRenderable,
  ) => { getLinePosition: GetLinePosition; getContentLineY: GetContentLineY };
  /**
   * Update the existing MdvMarkdownRenderable's content in place. Avoids a full
   * rebuild of the renderable tree — OpenTUI's incremental parser reuses
   * unchanged tokens, so a swap of similar content is two orders of
   * magnitude cheaper than constructing a new MdvMarkdownRenderable.
   */
  reloadContent: (
    newContent: string,
    newContentLines: string[],
  ) => { getLinePosition: GetLinePosition; getContentLineY: GetContentLineY };
  /**
   * True when `line` is covered by a parsed markdown token (i.e. yankable).
   * Used by CursorManager to skip blank gap lines on j/k movement.
   * Returns true for every line before the first render — predicate must
   * not strand the cursor while block state is still being populated.
   */
  isLineCursorable: (line: number) => boolean;
}

/**
 * Create the main container and scroll box
 */
export function createMainContainer(renderer: CliRenderer, contentLines: string[]): ContainerSetup {
  const container = new BoxRenderable(renderer, {
    id: "main",
    flexDirection: "column",
    flexGrow: 1,
  });

  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "scrollbox",
    flexGrow: 1,
    padding: 1,
    scrollY: true,
    scrollX: false,
  });

  container.add(scrollBox);

  // Mutable state for reload support
  let currentContentLines = contentLines;
  let currentMarkdown: MdvMarkdownRenderable | null = null;

  // Highlighting state (set once by setupHighlighting, reused on reload)
  let highlightState: {
    getCursorState: () => CursorRenderState;
    cursorColor: string;
    selectionColor: string;
    codeBgColor: string;
    searchHighlightColor: string;
    cursorTintRGBA: InstanceType<typeof RGBA>;
    selectionTintRGBA: InstanceType<typeof RGBA>;
    codeBgRGBA: InstanceType<typeof RGBA>;
    searchRGBA: InstanceType<typeof RGBA>;
  } | null = null;

  // Line mapping caches (rebuilt on reload)
  let cachedLineToBlock: Map<number, number> | null = null;
  let cachedBlockStartLines: Map<number, number> | null = null;
  let cachedBlockLineCount: Map<number, number> | null = null;

  const getBlockStates = (): BlockState[] | null => {
    if (!currentMarkdown) return null;
    const blockStates = (currentMarkdown as unknown as { _blockStates: unknown })._blockStates;
    if (!Array.isArray(blockStates) || blockStates.length === 0) return null;
    return blockStates as BlockState[];
  };

  const invalidateLineMappings = () => {
    cachedLineToBlock = null;
    cachedBlockStartLines = null;
    cachedBlockLineCount = null;
  };

  const ensureLineMappings = (blockStates: BlockState[]): void => {
    if (cachedLineToBlock !== null) return;

    cachedLineToBlock = new Map<number, number>();
    cachedBlockStartLines = new Map<number, number>();
    cachedBlockLineCount = new Map<number, number>();

    const fullContent = currentContentLines.join("\n");
    let searchStart = 0;

    for (let blockIdx = 0; blockIdx < blockStates.length; blockIdx++) {
      const state = blockStates[blockIdx]!;
      const tokenRaw = state.tokenRaw;

      const tokenStart = fullContent.indexOf(tokenRaw, searchStart);
      if (tokenStart === -1) continue;

      let startLine = 0;
      for (let i = 0; i < tokenStart; i++) {
        if (fullContent[i] === "\n") startLine++;
      }

      const tokenNewlines = (tokenRaw.match(/\n/g) || []).length;
      const linesInToken = tokenRaw.endsWith("\n") ? Math.max(1, tokenNewlines) : tokenNewlines + 1;
      const endLine = startLine + linesInToken - 1;

      cachedBlockStartLines.set(blockIdx, startLine);
      cachedBlockLineCount.set(blockIdx, linesInToken);

      for (let line = startLine; line <= endLine && line < currentContentLines.length; line++) {
        cachedLineToBlock.set(line, blockIdx);
      }

      searchStart = tokenStart + tokenRaw.length;
    }
  };

  const getLinePosition: GetLinePosition = (line: number): LinePosition | null => {
    const blockStates = getBlockStates();
    if (!blockStates) return null;

    ensureLineMappings(blockStates);
    if (!cachedLineToBlock) return null;

    const blockIdx = cachedLineToBlock.get(line);
    if (blockIdx === undefined) return null;

    const blockState = blockStates[blockIdx];
    if (!blockState) return null;

    const r = blockState.renderable;
    const blockStartLine = cachedBlockStartLines?.get(blockIdx) ?? 0;
    const linesInBlock = cachedBlockLineCount?.get(blockIdx) ?? 1;
    const lineWithinBlock = line - blockStartLine;

    // Use actual rendered height per line instead of assuming 1
    const lineHeight = linesInBlock > 0 ? r.height / linesInBlock : 1;
    const lineY = r.y + lineWithinBlock * lineHeight;

    return { x: r.x, y: lineY, height: lineHeight };
  };

  /**
   * Content-space Y for scroll calculations.
   * Uses first block's Y as reference so the result is scroll-independent:
   *   contentY = (r.y - firstBlock.y) + lineWithinBlock
   */
  const contentLineYForBlock = (
    line: number,
    blockStates: BlockState[],
    blockIdx: number,
  ): number => {
    const r = blockStates[blockIdx]!.renderable;
    const firstBlockY = blockStates[0]!.renderable.y;
    const blockStartLine = cachedBlockStartLines?.get(blockIdx) ?? 0;
    const linesInBlock = cachedBlockLineCount?.get(blockIdx) ?? 1;
    const lineWithinBlock = line - blockStartLine;

    const lineHeight = linesInBlock > 0 ? r.height / linesInBlock : 1;
    return Math.max(0, r.y - firstBlockY + lineWithinBlock * lineHeight);
  };

  const getContentLineY: GetContentLineY = (line: number): number | null => {
    const blockStates = getBlockStates();
    if (!blockStates || blockStates.length === 0) return null;

    ensureLineMappings(blockStates);
    if (!cachedLineToBlock) return null;

    const blockIdx = cachedLineToBlock.get(line);
    if (blockIdx !== undefined) {
      return contentLineYForBlock(line, blockStates, blockIdx);
    }

    // Line is unmapped (gap between blocks) — find nearest mapped line and extrapolate
    const maxSearch = 20;
    for (let delta = 1; delta <= maxSearch; delta++) {
      // Search downward first (closer to next block)
      const below = line + delta;
      const belowIdx = cachedLineToBlock.get(below);
      if (belowIdx !== undefined) {
        return contentLineYForBlock(below, blockStates, belowIdx) - delta;
      }
      // Then upward
      const above = line - delta;
      if (above >= 0) {
        const aboveIdx = cachedLineToBlock.get(above);
        if (aboveIdx !== undefined) {
          return contentLineYForBlock(above, blockStates, aboveIdx) + delta;
        }
      }
    }

    return null;
  };

  const setupRenderHooks = () => {
    const content = scrollBox.content;
    if (!content || !highlightState) return;

    const {
      getCursorState,
      cursorTintRGBA,
      selectionTintRGBA,
      codeBgRGBA,
      searchRGBA,
    } = highlightState;

    content.renderBefore = (buffer) => {
      if (currentContentLines.length === 0) return;

      const blockStates = getBlockStates();
      if (!blockStates) return;

      for (const blockState of blockStates) {
        if (blockState.token.type === "code") {
          const r = blockState.renderable;
          let drawY = r.y;
          let drawHeight = r.height;

          if (drawY < 0) {
            drawHeight += drawY;
            drawY = 0;
          }

          if (drawHeight > 0) {
            buffer.fillRect(0, drawY, buffer.width, drawHeight, codeBgRGBA);
          }
        }
      }
    };

    content.renderAfter = (buffer) => {
      const state = getCursorState();
      if (currentContentLines.length === 0) return;

      // Pre-blended tint covers the active row without overpainting the
      // text. Past attempts at a left-edge bar tripped on text rendered at
      // x=0 (sidebar entries and indented content alike) — the bar covered
      // the first characters. Tint alone reads clean across both panes.
      const drawRowMarker = (line: number, tint: InstanceType<typeof RGBA>) => {
        const pos = getLinePosition(line);
        if (!pos) return;

        let y = Math.floor(pos.y);
        let height = Math.ceil(pos.height);

        if (y < 0) {
          height += y;
          y = 0;
        }

        if (height <= 0) return;

        buffer.fillRect(0, y, buffer.width, height, tint);
      };

      // Draw search match highlights (before cursor so cursor overlays)
      if (state.searchMatches.length > 0) {
        for (const match of state.searchMatches) {
          const pos = getLinePosition(match.line);
          if (!pos) continue;

          let y = Math.floor(pos.y);
          if (y < 0) continue;

          const x = pos.x + match.col;
          const width = match.length;
          if (x < buffer.width && width > 0) {
            buffer.fillRect(x, y, Math.min(width, buffer.width - x), 1, searchRGBA);
          }
        }
      }

      if (state.mode === "visual") {
        for (let line = state.selectionStart; line <= state.selectionEnd; line++) {
          drawRowMarker(line, selectionTintRGBA);
        }
      } else {
        drawRowMarker(state.cursorLine, cursorTintRGBA);
      }
    };
  };

  function setupHighlighting(
    getCursorState: () => CursorRenderState,
    cursorColor: string,
    selectionColor: string,
    codeBgColor: string,
    searchHighlightColor: string,
    bgColor: string,
    markdown: MdvMarkdownRenderable,
  ): { getLinePosition: GetLinePosition; getContentLineY: GetContentLineY } {
    currentMarkdown = markdown;

    // Pre-blended tints so OpenTUI's fillRect lays a fully opaque cell of
    // the visible blended color on top of an empty buffer; setting alpha
    // directly led to tint-as-darkened-color artifacts on every theme.
    const bgRGBA = RGBA.fromHex(bgColor);
    const cursorTintRGBA = blendOver(RGBA.fromHex(cursorColor), bgRGBA, 0.22);
    const selectionTintRGBA = blendOver(RGBA.fromHex(selectionColor), bgRGBA, 0.28);
    const codeBgRGBA = RGBA.fromHex(codeBgColor);
    const searchRGBA = blendOver(RGBA.fromHex(searchHighlightColor), bgRGBA, 0.55);

    highlightState = {
      getCursorState,
      cursorColor,
      selectionColor,
      codeBgColor,
      searchHighlightColor,
      cursorTintRGBA,
      selectionTintRGBA,
      codeBgRGBA,
      searchRGBA,
    };

    setupRenderHooks();
    return { getLinePosition, getContentLineY };
  }

  function reloadContent(
    newContent: string,
    newContentLines: string[],
  ): { getLinePosition: GetLinePosition; getContentLineY: GetContentLineY } {
    if (!currentMarkdown) {
      throw new Error("reloadContent called before setupHighlighting wired the markdown ref");
    }

    // Mutating .content drives MdvMarkdownRenderable's incremental parser; the
    // renderable tree, _blockStates and layout update in place without
    // tearing down the scrollBox child.
    currentMarkdown.content = newContent;
    currentContentLines = newContentLines;
    invalidateLineMappings();

    // Reset scroll so the new file starts at the top, matching the previous
    // (rebuild-on-reload) behavior.
    scrollBox.scrollTo(0);

    return { getLinePosition, getContentLineY };
  }

  const isLineCursorable = (line: number): boolean => {
    const blockStates = getBlockStates();
    // Pre-render or torn-down state — allow every line so the cursor isn't
    // stranded before the first paint populates _blockStates.
    if (!blockStates) return true;
    ensureLineMappings(blockStates);
    if (!cachedLineToBlock?.has(line)) return false;
    // Block-mapped but the source line is whitespace-only (e.g. trailing
    // blanks inside a token's `raw`, or interior blanks in a blockquote /
    // code block). Treat those the same as gap lines — visually empty,
    // nothing to anchor a cursor highlight on.
    const text = currentContentLines[line];
    if (text === undefined) return false;
    return text.trim().length > 0;
  };

  return { container, scrollBox, setupHighlighting, reloadContent, isLineCursorable };
}
