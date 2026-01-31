/**
 * Status bar component and notifications
 */

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
} from "@opentui/core";
import type { ThemeColors, Mode } from "../types.js";

/**
 * Status bar setup result
 */
export interface StatusBarSetup {
  statusBar: BoxRenderable;
  helpText: TextRenderable;
  showNotification: (message: string, durationMs?: number) => void;
  updateStatusBar: (mode: Mode, visualStart: number, visualEnd: number) => void;
}

/**
 * Create status bar with notification support
 */
export function createStatusBar(
  renderer: CliRenderer,
  filename: string,
  colors: ThemeColors
): StatusBarSetup {
  const statusBar = new BoxRenderable(renderer, {
    id: "statusbar",
    flexDirection: "row",
    paddingLeft: 1,
    paddingRight: 1,
    height: 1,
    flexShrink: 0,
    backgroundColor: colors.codeBg,
  });

  statusBar.add(new TextRenderable(renderer, {
    id: "filename",
    content: filename,
    fg: colors.link,
    attributes: TextAttributes.BOLD,
  }));

  const helpText = new TextRenderable(renderer, {
    id: "help",
    content: "  j/k scroll | V visual | yy yank all | q quit",
    fg: colors.gray,
  });
  statusBar.add(helpText);

  // Notification timeout handle
  let notificationTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Show a temporary notification in the status bar
   */
  function showNotification(message: string, durationMs: number = 2000) {
    // Clear any existing notification timeout
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }

    // Show notification
    helpText.content = `  ${message}`;
    helpText.fg = colors.green;

    // Revert after duration
    notificationTimeout = setTimeout(() => {
      helpText.fg = colors.gray;
      updateStatusBar("normal", 0, 0);
      notificationTimeout = null;
    }, durationMs);
  }

  /**
   * Update status bar based on mode
   */
  function updateStatusBar(mode: Mode, visualStart: number, visualEnd: number) {
    if (mode === "visual") {
      const lines = Math.abs(visualEnd - visualStart) + 1;
      const startLine = Math.min(visualStart, visualEnd) + 1;
      const endLine = Math.max(visualStart, visualEnd) + 1;
      helpText.content = `  -- VISUAL -- L${startLine}-${endLine} (${lines} line${lines > 1 ? "s" : ""}) | y yank | Esc cancel`;
      helpText.fg = colors.yellow;
    } else {
      helpText.content = "  j/k gg/G scroll | Ctrl-d/u half | V visual | yy yank | q quit";
      helpText.fg = colors.gray;
    }
  }

  return {
    statusBar,
    helpText,
    showNotification,
    updateStatusBar,
  };
}
