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
    markdown: MarkdownRenderable,
  ) => GetLinePosition;
  reloadMarkdown: (newMarkdown: MarkdownRenderable, newContentLines: string[]) => GetLinePosition;
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
    cursorRGBA: InstanceType<typeof RGBA>;
    selectionRGBA: InstanceType<typeof RGBA>;
    codeBgRGBA: InstanceType<typeof RGBA>;
  } | null = null;

  // Line mapping caches (rebuilt on reload)
  let cachedLineToBlock: Map<number, number> | null = null;
  let cachedBlockStartLines: Map<number, number> | null = null;

  const getBlockStates = (): BlockState[] | null => {
    if (!currentMarkdown) return null;
    const blockStates = (currentMarkdown as unknown as { _blockStates: unknown })._blockStates;
    if (!Array.isArray(blockStates) || blockStates.length === 0) return null;
    return blockStates as BlockState[];
  };

  const invalidateLineMappings = () => {
    cachedLineToBlock = null;
    cachedBlockStartLines = null;
  };

  const ensureLineMappings = (blockStates: BlockState[]): void => {
    if (cachedLineToBlock !== null) return;

    cachedLineToBlock = new Map<number, number>();
    cachedBlockStartLines = new Map<number, number>();

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
    const lineWithinBlock = line - blockStartLine;
    const lineY = r.y + lineWithinBlock;

    return { y: lineY, height: 1 };
  };

  const setupRenderHooks = () => {
    const content = scrollBox.content;
    if (!content || !highlightState) return;

    const { getCursorState, cursorRGBA, selectionRGBA, codeBgRGBA } = highlightState;

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
    markdown: MarkdownRenderable,
  ): GetLinePosition {
    currentMarkdown = markdown;

    const cursorRGBA = RGBA.fromHex(cursorColor);
    cursorRGBA.a = 0.2;
    const selectionRGBA = RGBA.fromHex(selectionColor);
    selectionRGBA.a = 0.35;
    const codeBgRGBA = RGBA.fromHex(codeBgColor);

    highlightState = {
      getCursorState,
      cursorColor,
      selectionColor,
      codeBgColor,
      cursorRGBA,
      selectionRGBA,
      codeBgRGBA,
    };

    setupRenderHooks();
    return getLinePosition;
  }

  function reloadMarkdown(
    newMarkdown: MarkdownRenderable,
    newContentLines: string[],
  ): GetLinePosition {
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

    return getLinePosition;
  }

  return { container, scrollBox, setupHighlighting, reloadMarkdown };
}
