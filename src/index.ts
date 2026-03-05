/**
 * mdv - Markdown Viewer TUI
 * Uses OpenTUI's MarkdownRenderable with vim keybindings
 */

import { basename } from "path";
import { openSync, statSync } from "fs";
import { ReadStream } from "tty";
import { createCliRenderer, MarkdownRenderable, BoxRenderable } from "@opentui/core";
import type { BundledTheme } from "shiki";

// Local modules
import {
  parseCliArgs,
  showHelp,
  listThemes,
  showUsageError,
  readContent,
  hasStdinContent,
  readStdinContent,
} from "./cli.js";
import { extractThemeColors, createSyntaxStyle } from "./theme/index.js";
import { createHighlighterInstance } from "./highlighting/shiki.js";
import { createRenderNode } from "./rendering/index.js";
import { createMainContainer } from "./ui/container.js";
import { createStatusBar } from "./ui/statusbar.js";
import { createCursorManager, scrollToCursor } from "./input/cursor.js";
import { setupKeyboardHandler } from "./input/keyboard.js";
import { SearchManager } from "./input/search.js";
import { setupMouseHandler, mouseYToLine } from "./input/mouse.js";
import { scanDirectory } from "./fs/tree.js";
import { createSidebar } from "./ui/sidebar.js";
import { createFocusManager } from "./input/focus.js";
import { setupPaneKeyboardHandler } from "./input/pane-keyboard.js";

// =============================================================================
// CLI Argument Parsing
// =============================================================================

const args = parseCliArgs(Bun.argv);

if (args.showHelp) {
  showHelp();
  process.exit(0);
}

if (args.showVersion) {
  const pkg = await import("../package.json");
  console.log(`mdv ${pkg.version}`);
  process.exit(0);
}

if (args.listThemes) {
  await listThemes();
  process.exit(0);
}

// =============================================================================
// Read Content (stdin or file or directory)
// =============================================================================

let content: string;
let isStdin = false;
let isDirectory = false;
let fileTree: Awaited<ReturnType<typeof scanDirectory>> | null = null;

try {
  if (hasStdinContent()) {
    // Read stdin content BEFORE creating renderer
    content = await readStdinContent();
    isStdin = true;
  } else if (args.filePath) {
    // Check if path is a directory
    try {
      const pathStat = statSync(args.filePath);
      isDirectory = pathStat.isDirectory();
    } catch {
      // Not a valid path — will fail in readContent with a clear error
    }

    if (isDirectory) {
      fileTree = await scanDirectory(args.filePath, { exclude: args.exclude });
      if (fileTree.entries.length === 0) {
        console.error(`No markdown files found in directory: ${args.filePath}`);
        process.exit(1);
      }
      content = await readContent(fileTree.entries[0]!.path);
    } else {
      content = await readContent(args.filePath);
    }
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
// Debug Logging
// =============================================================================

if (args.debug) {
  console.error("[debug] file:", isStdin ? "<stdin>" : args.filePath);
  console.error("[debug] theme:", args.theme);
  console.error("[debug] lines:", contentLines.length);
  console.error("[debug] terminal:", process.stdout.columns + "x" + process.stdout.rows);
  console.error("[debug] mouse:", args.noMouse ? "disabled" : "enabled");
}

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
  useMouse: !args.noMouse,
});

// Create syntax style from theme colors
const syntaxStyle = createSyntaxStyle(themeColors);

// =============================================================================
// Cursor Manager Setup
// =============================================================================

// Mutable content state (for directory mode reloads)
let currentContent = content;
let currentContentLines = contentLines;

// Create cursor manager (will get status bar update function later)
let statusBarUpdate: () => void = () => {};
const cursor = createCursorManager(currentContentLines.length, () => statusBarUpdate());

// Create search manager
const search = new SearchManager();

// =============================================================================
// UI Components
// =============================================================================

// Create container and scroll box
const { container, scrollBox, setupHighlighting, reloadMarkdown } = createMainContainer(
  renderer,
  currentContentLines,
);

// Create render node callback
const renderNode = createRenderNode(renderer, themeColors, highlighterInstance);

// Create markdown renderable
let markdown = new MarkdownRenderable(renderer, {
  id: "markdown-content",
  content: currentContent,
  syntaxStyle,
  conceal: true,
  renderNode,
});
scrollBox.add(markdown);

// Setup cursor and selection highlighting (AFTER markdown is added to scrollBox)
// Pass markdown instance to access actual rendered positions via _blockStates
let getLinePosition = setupHighlighting(
  () => ({
    mode: cursor.mode,
    cursorLine: cursor.cursorLine,
    selectionStart: cursor.selectionStart,
    selectionEnd: cursor.selectionEnd,
    searchMatches: search.matches,
  }),
  themeColors.cyan, // Cursor color (subtle)
  themeColors.yellow, // Selection color
  themeColors.codeBg, // Code block background
  themeColors.orange, // Search highlight color
  markdown, // For actual rendered positions
);

// Create status bar
const initialFileName = isDirectory
  ? basename(fileTree!.entries[0]!.path)
  : isStdin
    ? "stdin"
    : basename(args.filePath!);
const {
  statusBar,
  showNotification,
  updateStatusBar,
  setFileName,
  setTotalLines,
  showSearchInput,
  hideSearchInput,
} = createStatusBar(renderer, initialFileName, themeColors, currentContentLines.length);

// Search UI callback: update status bar when search input changes
const onSearchUpdate = () => {
  if (search.isInputActive) {
    showSearchInput(search.inputBuffer);
  } else {
    hideSearchInput();
    statusBarUpdate();
  }
};

// Connect cursor to status bar
statusBarUpdate = () =>
  updateStatusBar(cursor.mode, cursor.cursorLine, cursor.selectionStart, cursor.selectionEnd);

// =============================================================================
// UI Assembly
// =============================================================================

container.add(statusBar);

if (isDirectory && fileTree) {
  // Directory mode: sidebar + content in a row layout
  const appRow = new BoxRenderable(renderer, {
    id: "app-row",
    flexDirection: "row",
    flexGrow: 1,
  });

  const focusManager = createFocusManager("content");

  // Reload content when a file is opened from the sidebar
  const onOpenFile = async (filePath: string) => {
    try {
      const newContent = await readContent(filePath);
      currentContent = newContent;
      currentContentLines = newContent.split("\n");

      // Recreate markdown renderable
      const newMarkdown = new MarkdownRenderable(renderer, {
        id: "markdown-content",
        content: currentContent,
        syntaxStyle,
        conceal: true,
        renderNode,
      });
      markdown = newMarkdown;

      getLinePosition = reloadMarkdown(newMarkdown, currentContentLines);

      // Reset cursor and search for new content
      cursor.reset(currentContentLines.length);
      search.clear();

      // Update status bar
      setFileName(basename(filePath));
      setTotalLines(currentContentLines.length);

      // Re-setup mouse handler for new content
      if (!args.noMouse) {
        setupMouseHandler({
          scrollBox,
          cursor,
          contentLines: currentContentLines,
          showNotification,
          getLinePosition,
        });
      }

      statusBarUpdate();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showNotification(`Error: ${msg}`);
    }
  };

  const sidebar = createSidebar(renderer, fileTree, themeColors, onOpenFile);
  sidebar.highlightEntry(fileTree.entries[0]!.path);

  appRow.add(sidebar.sidebarBox);
  appRow.add(container);
  renderer.root.add(appRow);

  // Update status bar help text based on pane focus
  focusManager.onFocusChange((pane) => {
    if (pane === "sidebar") {
      showNotification("SIDEBAR: j/k navigate, Enter open, Tab/Esc back", 1500);
    }
  });

  // Pane-aware keyboard handler
  setupPaneKeyboardHandler({
    renderer,
    focusManager,
    sidebar,
    sidebarSearch: sidebar.search,
    contentOptions: {
      renderer,
      scrollBox,
      cursor,
      content: currentContent,
      contentLines: currentContentLines,
      showNotification,
      search,
      onSearchUpdate,
    },
  });
} else {
  // Single-file mode (unchanged)
  renderer.root.add(container);

  setupKeyboardHandler({
    renderer,
    scrollBox,
    cursor,
    content: currentContent,
    contentLines: currentContentLines,
    showNotification,
    search,
    onSearchUpdate,
  });
}

// Initial status bar update
statusBarUpdate();

// =============================================================================
// Mouse Handling
// =============================================================================

if (!args.noMouse) {
  setupMouseHandler({
    scrollBox,
    cursor,
    contentLines: currentContentLines,
    showNotification,
    getLinePosition,
  });

  // =============================================================================
  // Native Selection Event (character-level click/drag on text)
  // =============================================================================

  renderer.on("selection", (selection) => {
    const line = mouseYToLine(
      selection.anchor.y,
      scrollBox.viewport.y,
      scrollBox.scrollTop,
      scrollBox.scrollHeight,
      currentContentLines.length,
      getLinePosition,
    );
    if (cursor.mode === "visual") {
      cursor.exitVisual();
    }
    cursor.setCursor(line);
    statusBarUpdate();
  });
}

// Initialize cursor position and scroll
scrollToCursor(scrollBox, cursor.cursorLine, currentContentLines.length, true);
