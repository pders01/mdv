/**
 * mdv - Markdown Viewer TUI
 * Uses OpenTUI's MarkdownRenderable with vim keybindings
 */

import { basename, resolve } from "path";
import { openSync, statSync, watch } from "fs";
import { ReadStream } from "tty";
import { createCliRenderer, MarkdownRenderable, BoxRenderable } from "@opentui/core";
import type { BundledTheme } from "shiki";

// Local modules
import {
  type CliArgs,
  showUsageError,
  readContent,
  hasStdinContent,
  readStdinContent,
} from "./cli.js";
import { extractThemeColors, createSyntaxStyle, resolveTheme } from "./theme/index.js";
import { createHighlighterInstance, loadLangsForContent } from "./highlighting/shiki.js";
import { createRenderNode } from "./rendering/index.js";
import { prerenderMermaid } from "./rendering/mermaid.js";
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
import { createPerfOverlay } from "./perf/overlay.js";
import { phase, phaseSync, setPhaseEnabled, dumpPhases } from "./perf/phase.js";

/**
 * Start the TUI viewer. The entry dispatcher in src/index.ts handles
 * help/version/list-themes flags before calling here.
 */
export async function startTui(args: CliArgs): Promise<void> {
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

const resolvedTheme = resolveTheme(args.theme);

if (args.debug) {
  console.error("[debug] file:", isStdin ? "<stdin>" : args.filePath);
  console.error("[debug] theme:", args.theme === "auto" ? `auto -> ${resolvedTheme}` : resolvedTheme);
  console.error("[debug] lines:", contentLines.length);
  console.error("[debug] terminal:", process.stdout.columns + "x" + process.stdout.rows);
  console.error("[debug] mouse:", args.noMouse ? "disabled" : "enabled");
}

setPhaseEnabled(args.debug);

// =============================================================================
// Shiki Syntax Highlighter
// =============================================================================

const highlighterInstance = await phase("shiki:create", () =>
  createHighlighterInstance(resolvedTheme),
);
const themeColors = phaseSync("theme:extract", () =>
  extractThemeColors(highlighterInstance.highlighter, resolvedTheme as BundledTheme),
);
highlighterInstance.colors = themeColors;

// Lazy-load only the fence languages this file actually uses. On a file with
// no code blocks this is a free no-op; on a real file it loads ~3 langs in
// 30–60 ms versus ~150 ms for the full bundle.
await phase("shiki:load-langs", () => loadLangsForContent(highlighterInstance, content));

// =============================================================================
// OpenTUI Setup
// =============================================================================

// targetFps/maxFps lifted from OpenTUI defaults (30/60). The j-key handler
// runs in <2 ms per press; the previous 30 fps cap meant input feedback
// was paced to ~33 ms regardless, so holding j felt jerky. Frame work has
// plenty of headroom for 120 fps even on a 7K-line file (max frame ~13 ms).
const renderer = await phase("renderer:create", () =>
  createCliRenderer({
    exitOnCtrlC: false,
    useMouse: !args.noMouse,
    targetFps: 60,
    maxFps: 120,
  }),
);

// Create syntax style from theme colors
const syntaxStyle = phaseSync("theme:syntax-style", () => createSyntaxStyle(themeColors));

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
const { container, scrollBox, setupHighlighting, reloadContent } = phaseSync(
  "container:create",
  () => createMainContainer(renderer, currentContentLines),
);

// Create render node callback
// In directory mode, subtract sidebar width (30) from available content width
// Scrollbox padding (1 on each side) is accounted for internally
const contentWidth = isDirectory ? renderer.width - 30 - 2 : renderer.width - 2;

// Mermaid pre-pass: render all mermaid code blocks to ASCII before the first
// paint. The map is mutated in place on reloads (directory switch, watch
// reload) so the renderNode closure always sees current state.
// availableWidth is contentWidth minus the code-block padding the wrapper adds.
const mermaidWidth = Math.max(20, contentWidth - 2);
const mermaidRenders = new Map<string, string>();
let mermaidToolWasMissing = false;
let mermaidInitialOverflow = 0;
{
  const result = await phase("mermaid:prerender", () =>
    prerenderMermaid(currentContent, {
      disabled: args.noMermaid,
      availableWidth: mermaidWidth,
    }),
  );
  for (const [k, v] of result.renders) mermaidRenders.set(k, v);
  mermaidToolWasMissing = result.toolMissing;
  mermaidInitialOverflow = result.overflowed;
}

const renderNode = phaseSync("render-node:create", () =>
  createRenderNode(renderer, themeColors, highlighterInstance, contentWidth, mermaidRenders),
);

// Create markdown renderable. Reload paths mutate `markdown.content` rather
// than rebuilding this instance — see container.reloadContent. Construction
// is the dominant startup cost (~250 ms on a 1500-line file) because
// OpenTUI's incremental parser re-runs marked.lex from scratch.
const markdown = phaseSync(
  "markdown:construct",
  () =>
    new MarkdownRenderable(renderer, {
      id: "markdown-content",
      content: currentContent,
      syntaxStyle,
      conceal: true,
      renderNode,
    }),
);
scrollBox.add(markdown);

// Setup cursor and selection highlighting (AFTER markdown is added to scrollBox)
// Pass markdown instance to access actual rendered positions via _blockStates
let { getLinePosition, getContentLineY } = phaseSync("highlighting:setup", () =>
  setupHighlighting(
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
  ),
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

// Refresh mermaidRenders for a new content buffer. Mutates the shared map
// in place so the renderNode closure stays valid across reloads.
const refreshMermaidRenders = async (text: string): Promise<void> => {
  const result = await prerenderMermaid(text, {
    disabled: args.noMermaid,
    availableWidth: mermaidWidth,
  });
  mermaidRenders.clear();
  for (const [k, v] of result.renders) mermaidRenders.set(k, v);
  if (result.toolMissing && result.hadBlocks) {
    showNotification("mermaid-ascii not installed — showing source", 3000);
  } else if (result.overflowed > 0) {
    const n = result.overflowed;
    showNotification(`${n} mermaid diagram${n > 1 ? "s" : ""} too wide — showing source`, 3000);
  }
};

// Initial notifications: tool missing or oversized diagrams.
if (mermaidToolWasMissing) {
  showNotification("mermaid-ascii not installed — showing source", 3000);
} else if (mermaidInitialOverflow > 0) {
  const n = mermaidInitialOverflow;
  showNotification(`${n} mermaid diagram${n > 1 ? "s" : ""} too wide — showing source`, 3000);
}

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

  // Track the currently viewed file for watch-mode reloads
  let currentFilePath = fileTree.entries[0]!.path;

  // Reload content when a file is opened from the sidebar
  const onOpenFile = async (filePath: string) => {
    try {
      const newContent = await readContent(filePath);
      currentContent = newContent;
      currentContentLines = newContent.split("\n");
      currentFilePath = filePath;

      // Refresh mermaid pre-pass and load any new fence langs before swapping.
      await refreshMermaidRenders(newContent);
      await loadLangsForContent(highlighterInstance, newContent);

      ({ getLinePosition, getContentLineY } = reloadContent(currentContent, currentContentLines));

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

  const sidebar = createSidebar(renderer, fileTree, themeColors, async (filePath: string) => {
    sidebar.clearChanged(filePath);
    await onOpenFile(filePath);
  });
  sidebar.highlightEntry(fileTree.entries[0]!.path);

  // Watch directory for file changes
  if (args.watch) {
    const knownPaths = new Set(fileTree.entries.map((e) => e.path));
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 150;

    watch(fileTree.rootDir, { recursive: true }, (_eventType, filename) => {
      if (!filename || !filename.endsWith(".md")) return;

      const fullPath = resolve(fileTree.rootDir, filename);
      if (!knownPaths.has(fullPath)) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        // Mark file as changed in sidebar
        if (fullPath !== currentFilePath) {
          sidebar.markChanged(fullPath);
          return;
        }

        // Reload the currently viewed file
        try {
          showNotification("Reloading...", 500);
          await new Promise((r) => setTimeout(r, 80));

          const newContent = await readContent(fullPath);
          if (newContent === currentContent) return;

          currentContent = newContent;
          currentContentLines = newContent.split("\n");

          // Refresh mermaid pre-pass and load any new fence langs.
          await refreshMermaidRenders(newContent);
          await loadLangsForContent(highlighterInstance, newContent);

          ({ getLinePosition, getContentLineY } = reloadContent(currentContent, currentContentLines));

          cursor.reset(
            currentContentLines.length,
            Math.min(cursor.cursorLine, currentContentLines.length - 1),
          );
          search.clear();
          setTotalLines(currentContentLines.length);

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
          showNotification("File reloaded", 1500);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          showNotification(`Reload error: ${msg}`);
        }
      }, DEBOUNCE_MS);
    });
  }

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
      get getContentLineY() {
        return getContentLineY;
      },
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
    getContentLineY,
  });
}

// Initial status bar update
statusBarUpdate();

// =============================================================================
// Perf Overlay (Ctrl-G)
// =============================================================================

// Global toggle that runs ahead of pane dispatch so it works regardless of
// which pane has focus.
const perfOverlay = createPerfOverlay(renderer, themeColors);
renderer.keyInput.on("keypress", (event) => {
  if (event.ctrl && event.name === "g") {
    const on = perfOverlay.toggle();
    showNotification(on ? "Perf overlay on" : "Perf overlay off", 1200);
  }
});

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

// =============================================================================
// File Watching (--watch mode)
// =============================================================================

if (args.watch && !isStdin && !isDirectory && args.filePath) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 150;
  const watchPath = args.filePath;

  const reloadFile = async () => {
    try {
      showNotification("Reloading...", 500);

      // Brief delay so the "Reloading..." notification is visible
      await new Promise((r) => setTimeout(r, 80));

      const newContent = await readContent(watchPath);

      // Skip reload if content hasn't actually changed
      if (newContent === currentContent) return;

      currentContent = newContent;
      currentContentLines = newContent.split("\n");

      // Refresh mermaid pre-pass and load any new fence langs.
      await refreshMermaidRenders(newContent);
      await loadLangsForContent(highlighterInstance, newContent);

      ({ getLinePosition, getContentLineY } = reloadContent(currentContent, currentContentLines));

      // Clamp cursor to new content bounds (don't reset to top)
      cursor.reset(
        currentContentLines.length,
        Math.min(cursor.cursorLine, currentContentLines.length - 1),
      );
      search.clear();
      setTotalLines(currentContentLines.length);

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
      showNotification("File reloaded", 1500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      showNotification(`Reload error: ${msg}`);
    }
  };

  const startWatcher = () => {
    const watcher = watch(watchPath, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(reloadFile, DEBOUNCE_MS);
    });

    // Re-establish watcher if it closes (happens on macOS rename-based saves)
    watcher.on("close", () => {
      setTimeout(startWatcher, 100);
    });
  };

  startWatcher();
}

// Initialize cursor position and scroll
scrollToCursor(scrollBox, cursor.cursorLine, currentContentLines.length, true, getContentLineY);

dumpPhases("[perf:startup]");
}

