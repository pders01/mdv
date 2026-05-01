/**
 * Status bar component with cursor position and notifications
 */

import { BoxRenderable, TextRenderable, TextAttributes, type CliRenderer } from "@opentui/core";
import type { ThemeColors, Mode } from "../types.js";

/**
 * Status bar setup result
 */
export interface StatusBarSetup {
  statusBar: BoxRenderable;
  helpText: TextRenderable;
  showNotification: (message: string, durationMs?: number) => void;
  updateStatusBar: (
    mode: Mode,
    cursorLine: number,
    selectionStart: number,
    selectionEnd: number,
  ) => void;
  setFileName: (name: string) => void;
  setTotalLines: (total: number) => void;
  showSearchInput: (buffer: string) => void;
  hideSearchInput: () => void;
}

/**
 * Create status bar with cursor info and notification support
 */
export function createStatusBar(
  renderer: CliRenderer,
  filename: string,
  colors: ThemeColors,
  initialTotalLines: number,
): StatusBarSetup {
  let totalLines = initialTotalLines;
  const statusBar = new BoxRenderable(renderer, {
    id: "statusbar",
    flexDirection: "row",
    paddingLeft: 1,
    paddingRight: 1,
    height: 1,
    flexShrink: 0,
    backgroundColor: colors.codeBg,
  });

  // Mode pill — mirrors the web sidebar's status-mode badge. Same accent
  // colors per mode (cyan / orange / yellow), same casing, same position
  // (left of the filename). Wrapping in a BoxRenderable lets us set a bg
  // since TextRenderable alone has no fill.
  const modeBox = new BoxRenderable(renderer, {
    id: "mode-box",
    flexDirection: "row",
    flexShrink: 0,
    backgroundColor: colors.cyan,
    paddingLeft: 1,
    paddingRight: 1,
    marginRight: 1,
  });
  const modeText = new TextRenderable(renderer, {
    id: "mode-text",
    content: "NORMAL",
    fg: colors.bg,
    attributes: TextAttributes.BOLD,
  });
  modeBox.add(modeText);
  statusBar.add(modeBox);

  // Filename
  const filenameText = new TextRenderable(renderer, {
    id: "filename",
    content: filename,
    fg: colors.link,
    attributes: TextAttributes.BOLD,
  });
  statusBar.add(filenameText);

  // Position indicator
  const positionText = new TextRenderable(renderer, {
    id: "position",
    content: "",
    fg: colors.gray,
  });
  statusBar.add(positionText);

  // Mode/help text
  const helpText = new TextRenderable(renderer, {
    id: "help",
    content: "",
    fg: colors.gray,
  });
  statusBar.add(helpText);

  // Notification timeout handle
  let notificationTimeout: ReturnType<typeof setTimeout> | null = null;
  let isNotificationActive = false;

  /**
   * Show a temporary notification in the status bar
   */
  function showNotification(message: string, durationMs: number = 2000) {
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
    }

    isNotificationActive = true;
    helpText.content = `  ${message}`;
    helpText.fg = colors.green;

    notificationTimeout = setTimeout(() => {
      isNotificationActive = false;
      helpText.fg = colors.gray;
      // Will be updated by next cursor movement
      notificationTimeout = null;
    }, durationMs);
  }

  /**
   * Update status bar based on mode and cursor position
   */
  function updateStatusBar(
    mode: Mode,
    cursorLine: number,
    selectionStart: number,
    selectionEnd: number,
  ) {
    // Update position indicator
    const lineNum = cursorLine + 1; // 1-indexed display
    const percent = totalLines > 0 ? Math.round((lineNum / totalLines) * 100) : 0;
    positionText.content = `  L${lineNum}/${totalLines} (${percent}%)`;

    // Don't update help text if notification or search input is active
    if (isNotificationActive || isSearchInputActive) return;

    if (mode === "visual") {
      const lines = selectionEnd - selectionStart + 1;
      const start = selectionStart + 1;
      const end = selectionEnd + 1;
      modeText.content = "VISUAL";
      modeBox.backgroundColor = colors.yellow;
      helpText.content = `  L${start}-${end} (${lines} line${lines > 1 ? "s" : ""}) | y yank | Esc cancel`;
      helpText.fg = colors.yellow;
    } else {
      modeText.content = "NORMAL";
      modeBox.backgroundColor = colors.cyan;
      helpText.content = "  j/k gg/G | / search | V visual | yy yank | q quit";
      helpText.fg = colors.gray;
    }
  }

  function setFileName(name: string) {
    filenameText.content = name;
  }

  function setTotalLines(total: number) {
    totalLines = total;
  }

  let isSearchInputActive = false;

  function showSearchInput(buffer: string) {
    isSearchInputActive = true;
    modeText.content = "SEARCH";
    modeBox.backgroundColor = colors.orange;
    helpText.content = `  /${buffer}_`;
    helpText.fg = colors.fg;
  }

  function hideSearchInput() {
    isSearchInputActive = false;
    modeText.content = "NORMAL";
    modeBox.backgroundColor = colors.cyan;
    helpText.fg = colors.gray;
    // Will be updated by next cursor movement
  }

  return {
    statusBar,
    helpText,
    showNotification,
    updateStatusBar,
    setFileName,
    setTotalLines,
    showSearchInput,
    hideSearchInput,
  };
}
