/**
 * Pane-aware keyboard dispatcher for directory browsing mode
 *
 * Routes key events to sidebar or content handler based on active pane.
 * Owns pane-switching shortcuts (Ctrl-h, Ctrl-l, backslash).
 */

import type { CliRenderer, KeyEvent } from "@opentui/core";
import type { FocusManager } from "./focus.js";
import type { SidebarSetup } from "../ui/sidebar.js";
import { handleContentKey, type KeyboardHandlerOptions, type KeyboardState } from "./keyboard.js";

export interface PaneKeyboardOptions {
  renderer: CliRenderer;
  focusManager: FocusManager;
  sidebar: SidebarSetup;
  contentOptions: KeyboardHandlerOptions;
}

export function setupPaneKeyboardHandler(options: PaneKeyboardOptions): void {
  const { renderer, focusManager, sidebar, contentOptions } = options;
  const state: KeyboardState = { lastKey: "", lastKeyTime: 0 };

  renderer.keyInput.on("keypress", (event: KeyEvent) => {
    // Global: q and Ctrl-c always quit
    if (event.name === "q" || (event.name === "c" && event.ctrl)) {
      renderer.destroy();
      process.exit(0);
    }

    // Pane switching: Ctrl-h = sidebar, Ctrl-l = content
    if (event.name === "h" && event.ctrl) {
      focusManager.switchTo("sidebar");
      return;
    }
    if (event.name === "l" && event.ctrl) {
      focusManager.switchTo("content");
      return;
    }

    // Backslash toggles sidebar visibility
    if (event.name === "\\") {
      sidebar.setVisible(focusManager.activePane !== "sidebar");
      if (focusManager.activePane === "sidebar") {
        focusManager.switchTo("content");
      }
      return;
    }

    // Tab switches panes
    if (event.name === "tab") {
      focusManager.toggle();
      return;
    }

    // Dispatch to active pane handler
    if (focusManager.activePane === "sidebar") {
      // Escape in sidebar switches to content
      if (event.name === "escape") {
        focusManager.switchTo("content");
        return;
      }

      // Enter in sidebar opens file and switches to content
      if (event.name === "return" || event.name === "enter") {
        sidebar.handleKey(event);
        focusManager.switchTo("content");
        return;
      }

      sidebar.handleKey(event);
    } else {
      handleContentKey(event, contentOptions, state);
    }
  });
}
