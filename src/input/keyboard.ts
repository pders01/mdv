/**
 * Keyboard event handling
 */

import type { ScrollBoxRenderable, CliRenderer, KeyEvent } from "@opentui/core";
import type { VisualMode } from "./visual.js";
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
  visualMode: VisualMode;
  content: string;
  contentLines: string[];
  showNotification: (message: string, durationMs?: number) => void;
}

/**
 * Setup keyboard event handler
 */
export function setupKeyboardHandler(options: KeyboardHandlerOptions): void {
  const {
    renderer,
    scrollBox,
    visualMode,
    content,
    contentLines,
    showNotification,
  } = options;

  let lastKey = "";
  let lastKeyTime = 0;

  renderer.keyInput.on("keypress", (event: KeyEvent) => {
    const now = Date.now();
    const height = renderer.height;

    // Handle Escape - exit visual mode
    if (event.name === "escape") {
      if (visualMode.mode === "visual") {
        visualMode.exit();
      }
      lastKey = "";
      return;
    }

    // Handle V - enter visual line mode (Shift+V)
    if (visualMode.mode === "normal" && (event.name === "V" || (event.name === "v" && event.shift))) {
      visualMode.enter(undefined, scrollBox);
      lastKey = "";
      return;
    }

    // Handle y in visual mode - yank selection
    if (event.name === "y" && visualMode.mode === "visual") {
      const lines = visualMode.getSelectedLineCount();
      const selectedText = visualMode.getSelectedContent();
      copyToClipboard(selectedText).then(() => {
        showNotification(`Yanked ${lines} line${lines > 1 ? "s" : ""} to clipboard`);
      });
      visualMode.exit();
      lastKey = "";
      return;
    }

    // gg - go to top
    if (event.name === "g" && !event.ctrl && !event.shift) {
      if (lastKey === "g" && now - lastKeyTime < DOUBLE_KEY_TIMEOUT_MS) {
        scrollBox.scrollTo(0);
        visualMode.moveToStart();
        lastKey = "";
      } else {
        lastKey = "g";
        lastKeyTime = now;
      }
      return;
    }

    // yy - yank (copy) entire document to clipboard (normal mode only)
    if (event.name === "y" && !event.ctrl && !event.shift && visualMode.mode === "normal") {
      if (lastKey === "y" && now - lastKeyTime < DOUBLE_KEY_TIMEOUT_MS) {
        copyToClipboard(content).then(() => {
          showNotification(`Yanked entire document (${contentLines.length} lines) to clipboard`);
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
      scrollBox.scrollTo(scrollBox.scrollHeight);
      visualMode.moveToEnd();
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
        scrollBox.scrollBy(1);
        visualMode.moveDown(1);
        break;

      case "k":
      case "up":
        scrollBox.scrollBy(-1);
        visualMode.moveUp(1);
        break;

      case "d":
        if (event.ctrl) {
          scrollBox.scrollBy(Math.floor(height / 2));
          visualMode.moveDown(Math.floor(height / 2));
        }
        break;

      case "u":
        if (event.ctrl) {
          scrollBox.scrollBy(-Math.floor(height / 2));
          visualMode.moveUp(Math.floor(height / 2));
        }
        break;

      case "f":
        if (event.ctrl) {
          scrollBox.scrollBy(height - 2);
          visualMode.moveDown(height - 2);
        }
        break;

      case "b":
        if (event.ctrl) {
          scrollBox.scrollBy(-(height - 2));
          visualMode.moveUp(height - 2);
        }
        break;

      case "pagedown":
      case "space":
        scrollBox.scrollBy(height - 2);
        visualMode.moveDown(height - 2);
        break;

      case "pageup":
        scrollBox.scrollBy(-(height - 2));
        visualMode.moveUp(height - 2);
        break;

      case "home":
        scrollBox.scrollTo(0);
        visualMode.moveToStart();
        break;

      case "end":
        scrollBox.scrollTo(scrollBox.scrollHeight);
        visualMode.moveToEnd();
        break;
    }
  });
}
