/**
 * Keyboard event handling with Vim-style cursor navigation
 */

import type { ScrollBoxRenderable, CliRenderer, KeyEvent } from "@opentui/core";
import type { CursorManager } from "./cursor.js";
import { scrollToCursor } from "./cursor.js";
import { copyToClipboard } from "./clipboard.js";

/**
 * Maximum time between key presses for double-key shortcuts (gg, yy)
 */
const DOUBLE_KEY_TIMEOUT_MS = 500;

/**
 * Keyboard handler options
 */
export interface KeyboardHandlerOptions {
  renderer: CliRenderer;
  scrollBox: ScrollBoxRenderable;
  cursor: CursorManager;
  content: string;
  contentLines: string[];
  showNotification: (message: string, durationMs?: number) => void;
}

/**
 * Mutable state for double-key shortcuts (gg, yy)
 */
export interface KeyboardState {
  lastKey: string;
  lastKeyTime: number;
}

/**
 * Handle a content-pane key event. Returns true if consumed.
 */
export function handleContentKey(
  event: KeyEvent,
  options: KeyboardHandlerOptions,
  state: KeyboardState,
): boolean {
  const { renderer, scrollBox, cursor, content, contentLines, showNotification } = options;

  const now = Date.now();
  const height = renderer.height;

  const moveCursor = (delta: number, center: boolean = false) => {
    cursor.moveCursor(delta);
    scrollToCursor(scrollBox, cursor.cursorLine, contentLines.length, center);
  };

  const goToFirst = () => {
    cursor.moveToFirst();
    scrollToCursor(scrollBox, cursor.cursorLine, contentLines.length, true);
  };

  const goToLast = () => {
    cursor.moveToLast();
    scrollToCursor(scrollBox, cursor.cursorLine, contentLines.length, true);
  };

  // Handle Escape - exit visual mode and clear native selection
  if (event.name === "escape") {
    if (cursor.mode === "visual") {
      cursor.exitVisual();
    }
    renderer.clearSelection();
    state.lastKey = "";
    return true;
  }

  // Handle V - enter visual line mode (clears any native character selection)
  if (cursor.mode === "normal" && (event.name === "V" || (event.name === "v" && event.shift))) {
    renderer.clearSelection();
    cursor.enterVisual();
    state.lastKey = "";
    return true;
  }

  // Character-level selection (OpenTUI native) takes priority over line-based yank
  if (event.name === "y") {
    const selection = renderer.getSelection();
    const selectedText = selection?.getSelectedText();
    if (selectedText) {
      copyToClipboard(selectedText)
        .then(() => showNotification("Yanked selection to clipboard"))
        .catch(() => showNotification("Failed to copy to clipboard"));
      renderer.clearSelection();
      state.lastKey = "";
      return true;
    }
  }

  // Handle y in visual mode - yank line selection
  if (event.name === "y" && cursor.mode === "visual") {
    const lines = cursor.getSelectedLineCount();
    const selectedText = cursor.getSelectedContent(contentLines);
    copyToClipboard(selectedText)
      .then(() => {
        showNotification(`Yanked ${lines} line${lines > 1 ? "s" : ""} to clipboard`);
      })
      .catch(() => {
        showNotification("Failed to copy to clipboard");
      });
    cursor.exitVisual();
    state.lastKey = "";
    return true;
  }

  // gg - go to top
  if (event.name === "g" && !event.ctrl && !event.shift) {
    if (state.lastKey === "g" && now - state.lastKeyTime < DOUBLE_KEY_TIMEOUT_MS) {
      goToFirst();
      state.lastKey = "";
    } else {
      state.lastKey = "g";
      state.lastKeyTime = now;
    }
    return true;
  }

  // yy - yank current line (normal mode) or entire document
  if (event.name === "y" && !event.ctrl && !event.shift && cursor.mode === "normal") {
    if (state.lastKey === "y" && now - state.lastKeyTime < DOUBLE_KEY_TIMEOUT_MS) {
      copyToClipboard(content)
        .then(() => {
          showNotification(`Yanked entire document (${contentLines.length} lines) to clipboard`);
        })
        .catch(() => {
          showNotification("Failed to copy to clipboard");
        });
      state.lastKey = "";
    } else {
      state.lastKey = "y";
      state.lastKeyTime = now;
    }
    return true;
  }

  // G - go to bottom
  if (event.name === "G" || (event.name === "g" && event.shift)) {
    goToLast();
    state.lastKey = "";
    return true;
  }

  state.lastKey = "";

  switch (event.name) {
    case "q":
      renderer.destroy();
      process.exit(0);

    case "c":
      if (event.ctrl) {
        renderer.destroy();
        process.exit(0);
      }
      return false;

    case "j":
    case "down":
      moveCursor(1);
      return true;

    case "k":
    case "up":
      moveCursor(-1);
      return true;

    case "d":
      if (event.ctrl) {
        moveCursor(Math.floor(height / 2));
        return true;
      }
      return false;

    case "u":
      if (event.ctrl) {
        moveCursor(-Math.floor(height / 2));
        return true;
      }
      return false;

    case "f":
      if (event.ctrl) {
        moveCursor(height - 2);
        return true;
      }
      return false;

    case "b":
      if (event.ctrl) {
        moveCursor(-(height - 2));
        return true;
      }
      return false;

    case "pagedown":
    case "space":
      moveCursor(height - 2);
      return true;

    case "pageup":
      moveCursor(-(height - 2));
      return true;

    case "home":
      goToFirst();
      return true;

    case "end":
      goToLast();
      return true;
  }

  return false;
}

/**
 * Setup keyboard event handler (single-file mode — backward compatible wrapper)
 */
export function setupKeyboardHandler(options: KeyboardHandlerOptions): void {
  const { renderer } = options;
  const state: KeyboardState = { lastKey: "", lastKeyTime: 0 };

  renderer.keyInput.on("keypress", (event: KeyEvent) => {
    handleContentKey(event, options, state);
  });
}
