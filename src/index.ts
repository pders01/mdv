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
import { createVisualMode } from "./input/visual.js";
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
  console.error((error as Error).message);
  process.exit(1);
}

// After reading piped stdin, reopen /dev/tty for keyboard input
if (isStdin) {
  const ttyFd = openSync("/dev/tty", "r");
  const ttyStream = new ReadStream(ttyFd);

  // Replace process.stdin with TTY stream so OpenTUI can receive keyboard events
  Object.defineProperty(process, "stdin", {
    value: ttyStream,
    writable: true,
    configurable: true,
  });
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
// Visual Mode Setup
// =============================================================================

// Create visual mode manager (will get status bar update function later)
let statusBarUpdate: () => void = () => {};
const visualMode = createVisualMode(contentLines, () => statusBarUpdate());

// =============================================================================
// UI Components
// =============================================================================

// Create container and scroll box
const { container, scrollBox } = createMainContainer(
  renderer,
  contentLines,
  ({ action, startLine, currentLine }) => {
    if (action === "start" || (action === "update" && visualMode.mode !== "visual")) {
      visualMode.enter(startLine);
    } else if (action === "update" && currentLine !== undefined) {
      visualMode.visualEnd = currentLine;
    }
  }
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

// Create status bar
const fileName = isStdin ? "stdin" : basename(args.filePath!);
const { statusBar, showNotification, updateStatusBar } = createStatusBar(
  renderer,
  fileName,
  themeColors
);

// Connect visual mode to status bar
statusBarUpdate = () => updateStatusBar(visualMode.mode, visualMode.visualStart, visualMode.visualEnd);

// Assemble UI
container.add(statusBar);
renderer.root.add(container);

// =============================================================================
// Keyboard Handling
// =============================================================================

setupKeyboardHandler({
  renderer,
  scrollBox,
  visualMode,
  content,
  contentLines,
  showNotification,
});
