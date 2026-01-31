/**
 * Main container and scroll box setup
 */

import {
  BoxRenderable,
  ScrollBoxRenderable,
  RGBA,
  type CliRenderer,
} from "@opentui/core";
import type { Mode } from "../types.js";
import type { CursorManager } from "../input/cursor.js";

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
 * Container setup result
 */
export interface ContainerSetup {
  container: BoxRenderable;
  scrollBox: ScrollBoxRenderable;
  setupHighlighting: (
    getCursorState: () => CursorRenderState,
    cursorColor: string,
    selectionColor: string
  ) => void;
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
   * Setup cursor and selection highlighting
   */
  function setupHighlighting(
    getCursorState: () => CursorRenderState,
    cursorColor: string,
    selectionColor: string
  ) {
    const cursorRGBA = RGBA.fromHex(cursorColor);
    cursorRGBA.a = 0.2; // Subtle cursor highlight

    const selectionRGBA = RGBA.fromHex(selectionColor);
    selectionRGBA.a = 0.35; // More visible selection

    const content = scrollBox.content;
    if (!content) return;

    content.renderAfter = (buffer) => {
      const state = getCursorState();
      if (contentLines.length === 0 || scrollBox.scrollHeight <= 0) return;

      const lineHeight = scrollBox.scrollHeight / contentLines.length;
      const viewportHeight = scrollBox.viewport?.height || renderer.height;
      const scrollTop = scrollBox.scrollTop;

      // Helper to draw a line highlight
      const drawLineHighlight = (line: number, color: typeof cursorRGBA) => {
        const lineY = Math.floor(line * lineHeight) - scrollTop;

        // Skip if outside visible area
        if (lineY + lineHeight < 0 || lineY >= viewportHeight) return;

        const y = Math.max(0, Math.floor(lineY));
        const height = Math.min(Math.ceil(lineHeight), viewportHeight - y);
        buffer.fillRect(0, y, buffer.width, height, color);
      };

      if (state.mode === "visual") {
        // Draw selection highlight for all selected lines
        for (let line = state.selectionStart; line <= state.selectionEnd; line++) {
          drawLineHighlight(line, selectionRGBA);
        }
      } else {
        // Draw cursor line highlight in normal mode
        drawLineHighlight(state.cursorLine, cursorRGBA);
      }
    };
  }

  return { container, scrollBox, setupHighlighting };
}
