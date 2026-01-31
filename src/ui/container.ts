/**
 * Main container and scroll box setup
 */

import {
  BoxRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
} from "@opentui/core";

/**
 * Visual mode change callback type
 */
export type VisualModeCallback = (params: {
  action: "start" | "update" | "end";
  startLine?: number;
  currentLine?: number;
}) => void;

/**
 * Container setup result
 */
export interface ContainerSetup {
  container: BoxRenderable;
  scrollBox: ScrollBoxRenderable;
}

/**
 * Create the main container and scroll box with mouse handlers
 */
export function createMainContainer(
  renderer: CliRenderer,
  contentLines: string[],
  onVisualModeChange?: VisualModeCallback
): ContainerSetup {
  const container = new BoxRenderable(renderer, {
    id: "main",
    flexDirection: "column",
    flexGrow: 1,
  });

  // Track mouse drag state for visual selection
  let isDragging = false;
  let dragStartLine = 0;

  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "scrollbox",
    flexGrow: 1,
    padding: 1,
    scrollY: true,
    scrollX: false,
    onMouseDown: (event) => {
      // Start a potential drag selection
      isDragging = true;
      const lineHeight = scrollBox.scrollHeight / Math.max(contentLines.length, 1);
      const absoluteY = event.y + scrollBox.scrollTop - 1; // -1 for padding
      dragStartLine = Math.max(0, Math.min(Math.floor(absoluteY / Math.max(lineHeight, 1)), contentLines.length - 1));
    },
    onMouseDrag: (event) => {
      if (!isDragging) return;

      const lineHeight = scrollBox.scrollHeight / Math.max(contentLines.length, 1);
      const absoluteY = event.y + scrollBox.scrollTop - 1;
      const currentLine = Math.max(0, Math.min(Math.floor(absoluteY / Math.max(lineHeight, 1)), contentLines.length - 1));

      // Notify about visual mode change
      if (onVisualModeChange) {
        onVisualModeChange({
          action: isDragging ? "update" : "start",
          startLine: dragStartLine,
          currentLine,
        });
      }
    },
    onMouseDragEnd: () => {
      isDragging = false;
      // Keep visual mode active so user can yank with 'y'
      if (onVisualModeChange) {
        onVisualModeChange({ action: "end" });
      }
    },
  });

  container.add(scrollBox);

  return { container, scrollBox };
}
