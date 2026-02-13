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
 * Setup keyboard event handler
 */
export function setupKeyboardHandler(options: KeyboardHandlerOptions): void {
  const { renderer, scrollBox, cursor, content, contentLines, showNotification } = options;

  let lastKey = "";
  let lastKeyTime = 0;

  // Helper: move cursor and scroll to follow
  // Uses uniform line height for scroll (decoupled from render state)
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

  renderer.keyInput.on("keypress", (event: KeyEvent) => {
    const now = Date.now();
    const height = renderer.height;

    // Handle Escape - exit visual mode
    if (event.name === "escape") {
      if (cursor.mode === "visual") {
        cursor.exitVisual();
      }
      lastKey = "";
      return;
    }

    // Handle V - enter visual line mode
    if (cursor.mode === "normal" && (event.name === "V" || (event.name === "v" && event.shift))) {
      cursor.enterVisual();
      lastKey = "";
      return;
    }

    // Handle y in visual mode - yank selection
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
      lastKey = "";
      return;
    }

    // gg - go to top
    if (event.name === "g" && !event.ctrl && !event.shift) {
      if (lastKey === "g" && now - lastKeyTime < DOUBLE_KEY_TIMEOUT_MS) {
        goToFirst();
        lastKey = "";
      } else {
        lastKey = "g";
        lastKeyTime = now;
      }
      return;
    }

    // yy - yank current line (normal mode) or entire document
    if (event.name === "y" && !event.ctrl && !event.shift && cursor.mode === "normal") {
      if (lastKey === "y" && now - lastKeyTime < DOUBLE_KEY_TIMEOUT_MS) {
        copyToClipboard(content)
          .then(() => {
            showNotification(`Yanked entire document (${contentLines.length} lines) to clipboard`);
          })
          .catch(() => {
            showNotification("Failed to copy to clipboard");
          });
        lastKey = "";
      } else {
        lastKey = "y";
        lastKeyTime = now;
      }
      return;
    }

    // G - go to bottom
    if (event.name === "G" || (event.name === "g" && event.shift)) {
      goToLast();
      lastKey = "";
      return;
    }

    lastKey = "";

    switch (event.name) {
      case "q":
        renderer.destroy();
        process.exit(0);

      case "c":
        if (event.ctrl) {
          renderer.destroy();
          process.exit(0);
        }
        break;

      case "j":
      case "down":
        moveCursor(1);
        break;

      case "k":
      case "up":
        moveCursor(-1);
        break;

      case "d":
        if (event.ctrl) {
          moveCursor(Math.floor(height / 2));
        }
        break;

      case "u":
        if (event.ctrl) {
          moveCursor(-Math.floor(height / 2));
        }
        break;

      case "f":
        if (event.ctrl) {
          moveCursor(height - 2);
        }
        break;

      case "b":
        if (event.ctrl) {
          moveCursor(-(height - 2));
        }
        break;

      case "pagedown":
      case "space":
        moveCursor(height - 2);
        break;

      case "pageup":
        moveCursor(-(height - 2));
        break;

      case "home":
        goToFirst();
        break;

      case "end":
        goToLast();
        break;
    }
  });
}
