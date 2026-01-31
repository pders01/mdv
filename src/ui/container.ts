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
}

/**
 * Line position info (absolute Y, not scroll-adjusted)
 */
export interface LinePosition {
  y: number;
  height: number;
}

/**
 * Function to get line position from actual rendered blocks
 */
export type GetLinePosition = (line: number) => LinePosition | null;

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
    markdown: MarkdownRenderable
  ) => GetLinePosition;
}

/**
 * Create the main container and scroll box
 */
export function createMainContainer(
  renderer: CliRenderer,
  contentLines: string[]
): ContainerSetup {
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

  /**
   * Setup cursor and selection highlighting using actual rendered positions.
   * Returns a getLinePosition function for use by scroll logic.
   */
  function setupHighlighting(
    getCursorState: () => CursorRenderState,
    cursorColor: string,
    selectionColor: string,
    codeBgColor: string,
    markdown: MarkdownRenderable
  ): GetLinePosition {
    const cursorRGBA = RGBA.fromHex(cursorColor);
    cursorRGBA.a = 0.2; // Subtle cursor highlight

    const selectionRGBA = RGBA.fromHex(selectionColor);
    selectionRGBA.a = 0.35; // More visible selection

    const codeBgRGBA = RGBA.fromHex(codeBgColor);

    const content = scrollBox.content;

    // Helper to get block states from markdown (accessing private API)
    const getBlockStates = (): BlockState[] | null => {
      const blockStates = (markdown as unknown as { _blockStates: unknown })._blockStates;
      // Validate structure in case OpenTUI internals change
      if (!Array.isArray(blockStates) || blockStates.length === 0) return null;
      return blockStates as BlockState[];
    };

    // Cached line mappings (built once, reused)
    let cachedLineToBlock: Map<number, number> | null = null;
    let cachedBlockStartLines: Map<number, number> | null = null;
    let cachedBlockLineCounts: Map<number, number> | null = null;

    // Build and cache source line to block index mapping
    // This is expensive, so we only do it once per session
    const ensureLineMappings = (blockStates: BlockState[]): void => {
      if (cachedLineToBlock !== null) return; // Already built

      cachedLineToBlock = new Map<number, number>();
      cachedBlockStartLines = new Map<number, number>();
      cachedBlockLineCounts = new Map<number, number>();

      // Join content to search within
      const fullContent = contentLines.join("\n");
      let searchStart = 0;

      for (let blockIdx = 0; blockIdx < blockStates.length; blockIdx++) {
        const state = blockStates[blockIdx];
        const tokenRaw = state.tokenRaw;

        // Find where this token starts in the full content
        const tokenStart = fullContent.indexOf(tokenRaw, searchStart);
        if (tokenStart === -1) continue;

        // Count newlines before tokenStart to get the starting line
        let startLine = 0;
        for (let i = 0; i < tokenStart; i++) {
          if (fullContent[i] === "\n") startLine++;
        }

        // Count lines in token: N newlines = N+1 lines, unless trailing newline
        const tokenNewlines = (tokenRaw.match(/\n/g) || []).length;
        const linesInToken = tokenRaw.endsWith('\n')
          ? Math.max(1, tokenNewlines)  // Trailing newline: N newlines = N lines
          : tokenNewlines + 1;           // No trailing: N newlines = N+1 lines
        const endLine = startLine + linesInToken - 1;

        // Store block start line and line count
        cachedBlockStartLines.set(blockIdx, startLine);
        cachedBlockLineCounts.set(blockIdx, linesInToken);

        // Map all lines in this range to this block
        for (let line = startLine; line <= endLine && line < contentLines.length; line++) {
          cachedLineToBlock.set(line, blockIdx);
        }

        // Move search position past this token
        searchStart = tokenStart + tokenRaw.length;
      }
    };

    /**
     * Get absolute Y position for a source line (shared by highlighting and scrolling)
     */
    const getLinePosition: GetLinePosition = (line: number): LinePosition | null => {
      const blockStates = getBlockStates();
      if (!blockStates) return null;

      // Build mappings once (cached)
      ensureLineMappings(blockStates);
      if (!cachedLineToBlock) return null;

      const blockIdx = cachedLineToBlock.get(line);
      if (blockIdx === undefined) return null;

      const blockState = blockStates[blockIdx];
      if (!blockState) return null;

      // Read fresh renderable position (this can change during scroll/resize)
      const r = blockState.renderable;
      const blockStartLine = cachedBlockStartLines?.get(blockIdx) ?? 0;
      const lineWithinBlock = line - blockStartLine;

      // Use fixed line height of 1 (terminal row) - rendered spacing varies but
      // source lines map 1:1 to terminal rows for highlighting purposes
      const lineHeight = 1;
      const lineY = r.y + lineWithinBlock;

      return { y: lineY, height: lineHeight };
    };

    // Setup render hooks if content exists
    if (content) {
      // Draw code block backgrounds BEFORE content (so text appears on top)
      content.renderBefore = (buffer) => {
        if (contentLines.length === 0) return;

        const blockStates = getBlockStates();
        if (!blockStates) return;

        for (const blockState of blockStates) {
          if (blockState.token.type === "code") {
            const r = blockState.renderable;
            let drawY = r.y;
            let drawHeight = r.height;

            // Clip to viewport top (prevent drift when block is partially above)
            if (drawY < 0) {
              drawHeight += drawY; // Reduce height by amount above viewport
              drawY = 0;
            }

            // Only draw if there's visible height remaining
            if (drawHeight > 0) {
              buffer.fillRect(0, drawY, buffer.width, drawHeight, codeBgRGBA);
            }
          }
        }
      };

      // Draw cursor/selection highlights AFTER content (as overlays)
      content.renderAfter = (buffer) => {
        const state = getCursorState();
        if (contentLines.length === 0) return;

        const drawLineHighlight = (line: number, color: typeof cursorRGBA) => {
          const pos = getLinePosition(line);
          if (!pos) return;

          let y = Math.floor(pos.y);
          let height = Math.ceil(pos.height);

          // Clip to viewport top (prevent drift when highlight is partially above)
          if (y < 0) {
            height += y;
            y = 0;
          }

          if (height > 0) {
            buffer.fillRect(0, y, buffer.width, height, color);
          }
        };

        if (state.mode === "visual") {
          for (let line = state.selectionStart; line <= state.selectionEnd; line++) {
            drawLineHighlight(line, selectionRGBA);
          }
        } else {
          drawLineHighlight(state.cursorLine, cursorRGBA);
        }
      };
    }

    return getLinePosition;
  }

  return { container, scrollBox, setupHighlighting };
}
