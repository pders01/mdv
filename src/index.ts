/**
 * mdv - Markdown Viewer TUI
 * Uses OpenTUI's MarkdownRenderable with vim keybindings
 */

import { basename } from "path";
import { openSync } from "fs";
import { ReadStream } from "tty";
import {
  createCliRenderer,
  MarkdownRenderable,
} from "@opentui/core";
import type { BundledTheme } from "shiki";

// Local modules
import { parseCliArgs, showHelp, listThemes, showUsageError, readContent, hasStdinContent, readStdinContent } from "./cli.js";
import { extractThemeColors, createSyntaxStyle } from "./theme/index.js";
import { createHighlighterInstance } from "./highlighting/shiki.js";
import { createRenderNode } from "./rendering/index.js";
import { createMainContainer } from "./ui/container.js";
import { createStatusBar } from "./ui/statusbar.js";
import { createCursorManager, scrollToCursor } from "./input/cursor.js";
import { setupKeyboardHandler } from "./input/keyboard.js";

// =============================================================================
// CLI Argument Parsing
// =============================================================================

const args = parseCliArgs(Bun.argv);

if (args.showHelp) {
  showHelp();
  process.exit(0);
}

if (args.listThemes) {
  await listThemes();
  process.exit(0);
}

// =============================================================================
// Read Content (stdin or file)
// =============================================================================

let content: string;
let isStdin = false;

try {
  if (hasStdinContent()) {
    // Read stdin content BEFORE creating renderer
    content = await readStdinContent();
    isStdin = true;
  } else if (args.filePath) {
    content = await readContent(args.filePath);
  } else {
    showUsageError();
    process.exit(1);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);

  // Provide helpful context for common file errors
  if (args.filePath) {
    if (message.includes("ENOENT") || message.includes("not found")) {
      console.error(`File does not exist: ${args.filePath}`);
    } else if (message.includes("EACCES") || message.includes("permission")) {
      console.error(`Permission denied: ${args.filePath}`);
    } else if (message.includes("EISDIR") || message.includes("directory")) {
      console.error(`Path is a directory, not a file: ${args.filePath}`);
    }
  }

  process.exit(1);
}

// After reading piped stdin, reopen /dev/tty for keyboard input
if (isStdin) {
  if (process.platform === "win32") {
    console.error("Warning: Piped input on Windows may not support keyboard interaction");
  } else {
    try {
      const ttyFd = openSync("/dev/tty", "r");
      const ttyStream = new ReadStream(ttyFd);

      // Replace process.stdin with TTY stream so OpenTUI can receive keyboard events
      Object.defineProperty(process, "stdin", {
        value: ttyStream,
        writable: true,
        configurable: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Warning: Could not reopen TTY for keyboard input: ${message}`);
      console.error("Keyboard shortcuts may not work when reading from stdin");
    }
  }
}

const contentLines = content.split("\n");

// =============================================================================
// Shiki Syntax Highlighter
// =============================================================================

const highlighterInstance = await createHighlighterInstance(args.theme, {
  fg: "#e1e4e8",
  bg: "#24292e",
  link: "#79b8ff",
  red: "#f97583",
  orange: "#ffab70",
  yellow: "#ffea7f",
  green: "#85e89d",
  cyan: "#39c5cf",
  blue: "#79b8ff",
  purple: "#b392f0",
  gray: "#6a737d",
  codeBg: "#2f363d",
});

// Extract theme colors
const themeColors = extractThemeColors(highlighterInstance.highlighter, args.theme as BundledTheme);

// Update highlighter instance with actual colors
highlighterInstance.colors = themeColors;

// =============================================================================
// OpenTUI Setup
// =============================================================================

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
  useMouse: true,
});

// Create syntax style from theme colors
const syntaxStyle = createSyntaxStyle(themeColors);

// =============================================================================
// Cursor Manager Setup
// =============================================================================

// Create cursor manager (will get status bar update function later)
let statusBarUpdate: () => void = () => {};
const cursor = createCursorManager(contentLines.length, () => statusBarUpdate());

// =============================================================================
// UI Components
// =============================================================================

// Create container and scroll box
const { container, scrollBox, setupHighlighting } = createMainContainer(
  renderer,
  contentLines
);

// Create render node callback
const renderNode = createRenderNode(renderer, themeColors, highlighterInstance);

// Create markdown renderable
const markdown = new MarkdownRenderable(renderer, {
  content,
  syntaxStyle,
  conceal: true,
  renderNode,
});
scrollBox.add(markdown);

// Setup cursor and selection highlighting (AFTER markdown is added to scrollBox)
// Pass markdown instance to access actual rendered positions via _blockStates
setupHighlighting(
  () => ({
    mode: cursor.mode,
    cursorLine: cursor.cursorLine,
    selectionStart: cursor.selectionStart,
    selectionEnd: cursor.selectionEnd,
  }),
  themeColors.cyan,    // Cursor color (subtle)
  themeColors.yellow,  // Selection color
  themeColors.codeBg,  // Code block background
  markdown             // For actual rendered positions
);

// Create status bar
const fileName = isStdin ? "stdin" : basename(args.filePath!);
const { statusBar, showNotification, updateStatusBar } = createStatusBar(
  renderer,
  fileName,
  themeColors,
  contentLines.length
);

// Connect cursor to status bar
statusBarUpdate = () => updateStatusBar(
  cursor.mode,
  cursor.cursorLine,
  cursor.selectionStart,
  cursor.selectionEnd
);

// Assemble UI
container.add(statusBar);
renderer.root.add(container);

// Initial status bar update
statusBarUpdate();

// =============================================================================
// Keyboard Handling
// =============================================================================

setupKeyboardHandler({
  renderer,
  scrollBox,
  cursor,
  content,
  contentLines,
  showNotification,
});

// Initialize cursor position and scroll
scrollToCursor(scrollBox, cursor.cursorLine, contentLines.length, true);
