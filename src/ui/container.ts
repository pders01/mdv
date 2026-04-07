/**
 * Main container and scroll box setup
 */

import {
  BoxRenderable,
  ScrollBoxRenderable,
  MarkdownRenderable,
  RGBA,
  type CliRenderer,
} from "@opentui/core";
import type { Mode } from "../types.js";
import type { SearchMatch } from "../input/search.js";

/**
 * BlockState from OpenTUI's MarkdownRenderable internal state
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
    markdown: MarkdownRenderable,
  ) => { getLinePosition: GetLinePosition; getContentLineY: GetContentLineY };
  reloadMarkdown: (
    newMarkdown: MarkdownRenderable,
    newContentLines: string[],
  ) => { getLinePosition: GetLinePosition; getContentLineY: GetContentLineY };
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
  let currentMarkdown: MarkdownRenderable | null = null;

  // Highlighting state (set once by setupHighlighting, reused on reload)
  let highlightState: {
    getCursorState: () => CursorRenderState;
    cursorColor: string;
    selectionColor: string;
    codeBgColor: string;
    searchHighlightColor: string;
    cursorRGBA: InstanceType<typeof RGBA>;
    selectionRGBA: InstanceType<typeof RGBA>;
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

    const { getCursorState, cursorRGBA, selectionRGBA, codeBgRGBA, searchRGBA } = highlightState;

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

      const drawLineHighlight = (line: number, color: InstanceType<typeof RGBA>) => {
        const pos = getLinePosition(line);
        if (!pos) return;

        let y = Math.floor(pos.y);
        let height = Math.ceil(pos.height);

        if (y < 0) {
          height += y;
          y = 0;
        }

        if (height > 0) {
          buffer.fillRect(0, y, buffer.width, height, color);
        }
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
          drawLineHighlight(line, selectionRGBA);
        }
      } else {
        drawLineHighlight(state.cursorLine, cursorRGBA);
      }
    };
  };

  function setupHighlighting(
    getCursorState: () => CursorRenderState,
    cursorColor: string,
    selectionColor: string,
    codeBgColor: string,
    searchHighlightColor: string,
    markdown: MarkdownRenderable,
  ): { getLinePosition: GetLinePosition; getContentLineY: GetContentLineY } {
    currentMarkdown = markdown;

    const cursorRGBA = RGBA.fromHex(cursorColor);
    cursorRGBA.a = 0.2;
    const selectionRGBA = RGBA.fromHex(selectionColor);
    selectionRGBA.a = 0.35;
    const codeBgRGBA = RGBA.fromHex(codeBgColor);
    const searchRGBA = RGBA.fromHex(searchHighlightColor);
    searchRGBA.a = 0.25;

    highlightState = {
      getCursorState,
      cursorColor,
      selectionColor,
      codeBgColor,
      searchHighlightColor,
      cursorRGBA,
      selectionRGBA,
      codeBgRGBA,
      searchRGBA,
    };

    setupRenderHooks();
    return { getLinePosition, getContentLineY };
  }

  function reloadMarkdown(
    newMarkdown: MarkdownRenderable,
    newContentLines: string[],
  ): { getLinePosition: GetLinePosition; getContentLineY: GetContentLineY } {
    // Remove old markdown by id
    if (currentMarkdown) {
      scrollBox.remove(currentMarkdown.id);
    }

    // Update mutable state
    currentMarkdown = newMarkdown;
    currentContentLines = newContentLines;
    invalidateLineMappings();

    // Add new markdown and re-wire render hooks
    scrollBox.add(newMarkdown);
    setupRenderHooks();

    // Reset scroll
    scrollBox.scrollTo(0);

    return { getLinePosition, getContentLineY };
  }

  return { container, scrollBox, setupHighlighting, reloadMarkdown };
}
