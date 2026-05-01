/**
 * Sidebar file tree component for directory browsing mode.
 *
 * Renders the file list as a nested tree (directory headers + indented
 * basenames) using the shared `buildFileTree` from src/fs/tree.ts, so the
 * structural shape of the listing stays in sync with the web sidebar.
 *
 * One TextRenderable holds the whole list (necessary to keep ScrollBox
 * happy; per-row renderables produce layout artifacts). The cursor still
 * tracks an index into the flat file-leaf list — that keeps every
 * existing consumer (search, open, highlight, change markers) working
 * with no math changes — while the rendering layer translates that leaf
 * index to a display-row index when drawing the cursor overlay or
 * computing the scroll target.
 */

import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextRenderable,
  TextAttributes,
  RGBA,
  type CliRenderer,
  type KeyEvent,
} from "@opentui/core";
import { basename } from "node:path";
import { buildFileTree, type FileEntry, type FileTree, type TreeNode } from "../fs/tree.js";
import type { ThemeColors } from "../types.js";
import { SearchManager } from "../input/search.js";

export interface SidebarSetup {
  sidebarBox: BoxRenderable;
  handleKey: (event: KeyEvent) => boolean;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => boolean;
  highlightEntry: (filePath: string) => void;
  markChanged: (filePath: string) => void;
  clearChanged: (filePath: string) => void;
  showSearchInput: (buffer: string) => void;
  hideSearchInput: () => void;
  readonly search: SearchManager;
}

const SIDEBAR_WIDTH = 30;
const INDENT = "  ";

/** Available char columns for the sidebar header text (paddingLeft eats one). */
const HEADER_INNER_WIDTH = SIDEBAR_WIDTH - 1;

/**
 * Truncate `s` to fit `max` columns, appending `…` when shortening. Matches
 * the web sidebar's behavior of showing the rootDir basename, but here we
 * have to do it manually since there's no CSS text-overflow in the TUI.
 */
function truncateEnd(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return "…";
  return s.slice(0, max - 1) + "…";
}

type DisplayRow = { kind: "dir"; text: string } | { kind: "file"; text: string; entry: FileEntry };

/**
 * Walk the tree depth-first, emitting one DisplayRow per node. Directories
 * become labeled headers with a trailing `/`; files become indented
 * basenames. The leaf order matches the input entry order, so the file
 * leaves appear at the same positions a flat-sort listing would have
 * placed them.
 */
function buildDisplayRows(nodes: TreeNode[], level = 0): DisplayRow[] {
  const out: DisplayRow[] = [];
  for (const n of nodes) {
    if (n.type === "dir") {
      out.push({ kind: "dir", text: INDENT.repeat(level) + n.name + "/" });
      out.push(...buildDisplayRows(n.children, level + 1));
    } else {
      out.push({ kind: "file", text: INDENT.repeat(level) + n.name, entry: n.entry });
    }
  }
  return out;
}

function buildListContent(rows: DisplayRow[], changedFiles: Set<string>): string {
  return rows
    .map((r) => {
      if (r.kind === "dir") return r.text;
      const marker = changedFiles.has(r.entry.path) ? " ●" : "";
      return r.text + marker;
    })
    .join("\n");
}

export function createSidebar(
  renderer: CliRenderer,
  fileTree: FileTree,
  colors: ThemeColors,
  onOpen: (filePath: string) => void,
): SidebarSetup {
  const entries = fileTree.entries;
  const displayRows = buildDisplayRows(buildFileTree(entries));

  // leafIndex → displayRow index lookup. The cursor moves in leaf space
  // (so search, open, change markers all index by file), but the visual
  // row for highlight/scroll lives at displayRows[leafToRow[cursor]].
  const leafToRow: number[] = [];
  displayRows.forEach((r, i) => {
    if (r.kind === "file") leafToRow.push(i);
  });
  const getCursorRow = () => leafToRow[cursorIndex] ?? 0;

  let cursorIndex = 0;
  let visible = true;
  const changedFiles = new Set<string>();

  // Sidebar search state — labels are the file relative paths so the
  // search query matches against the FULL path even though the visible
  // label only shows the basename. Useful for "I know it's somewhere
  // under guides/".
  const sidebarSearch = new SearchManager();
  const entryLabels = entries.map((e) => e.relativePath);

  // Cursor row tint: pre-blended against theme bg so the cell paints the
  // visible "cyan over bg" color in one pass — OpenTUI's fillRect alpha
  // composites against an empty buffer, which would otherwise turn 22%
  // cyan into 22% of cyan on black (a dark solid). Same accent the
  // content pane uses so both panes read as part of one TUI.
  const bgRGBA = RGBA.fromHex(colors.bg);
  const accentRGBA = RGBA.fromHex(colors.cyan);
  const cursorTintRGBA = RGBA.fromValues(
    accentRGBA.r * 0.22 + bgRGBA.r * 0.78,
    accentRGBA.g * 0.22 + bgRGBA.g * 0.78,
    accentRGBA.b * 0.22 + bgRGBA.b * 0.78,
    1,
  );

  const sidebarBox = new BoxRenderable(renderer, {
    id: "sidebar",
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    flexDirection: "column",
    overflow: "hidden",
  });

  // Header label mirrors the web sidebar: basename of the root directory,
  // uppercased + truncated to fit the fixed sidebar width. The web side
  // applies the same transformation via CSS (text-transform: uppercase
  // on `.mdv-sidebar__header`); here we do it manually. Falls back to
  // "FILES" when mdv is opened on a single file (no meaningful dir name).
  const rawLabel = fileTree.rootDir ? basename(fileTree.rootDir) || "FILES" : "FILES";
  const headerLabel = truncateEnd(rawLabel.toUpperCase(), HEADER_INNER_WIDTH);
  const header = new TextRenderable(renderer, {
    id: "sidebar-header",
    content: headerLabel,
    fg: colors.gray,
    attributes: TextAttributes.BOLD,
    height: 1,
    paddingLeft: 1,
  });
  sidebarBox.add(header);

  const searchText = new TextRenderable(renderer, {
    id: "sidebar-search",
    content: "",
    fg: colors.fg,
    height: 0,
    paddingLeft: 1,
  });
  sidebarBox.add(searchText);

  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "sidebar-scroll",
    flexGrow: 1,
    scrollY: true,
    scrollX: false,
  });
  sidebarBox.add(scrollBox);

  const listText = new TextRenderable(renderer, {
    id: "sidebar-list",
    content: buildListContent(displayRows, changedFiles),
    fg: colors.fg,
    wrapMode: "none",
    truncate: true,
  });
  scrollBox.add(listText);

  const refreshList = () => {
    listText.content = buildListContent(displayRows, changedFiles);
  };

  // Cursor highlight overlay. Y maps from leaf index to display row so
  // the rect lands on the right text line — directory headers between
  // file rows get correctly skipped over.
  if (scrollBox.content) {
    scrollBox.content.renderAfter = (buffer) => {
      if (entries.length === 0) return;
      const y = listText.y + getCursorRow();
      if (y < 0 || y >= buffer.height) return;
      buffer.fillRect(0, y, buffer.width, 1, cursorTintRGBA);
    };
  }

  const scrollToCursor = () => {
    if (entries.length === 0) return;
    const totalLines = listText.lineCount > 0 ? listText.lineCount : displayRows.length;
    const scrollHeight = scrollBox.scrollHeight;
    if (scrollHeight <= 0) return;

    const lineHeight = scrollHeight / totalLines;
    const cursorY = getCursorRow() * lineHeight;
    const viewportHeight = scrollBox.viewport?.height || scrollHeight;
    const margin = lineHeight * 2;

    if (cursorY < scrollBox.scrollTop + margin) {
      scrollBox.scrollTo(Math.max(0, cursorY - margin));
    } else if (cursorY + lineHeight > scrollBox.scrollTop + viewportHeight - margin) {
      scrollBox.scrollTo(Math.max(0, cursorY + lineHeight + margin - viewportHeight));
    }
  };

  const moveCursor = (delta: number) => {
    const newIndex = Math.max(0, Math.min(cursorIndex + delta, entries.length - 1));
    if (newIndex === cursorIndex) return;
    cursorIndex = newIndex;
    refreshList();
    scrollToCursor();
  };

  const handleKey = (event: KeyEvent): boolean => {
    const height = renderer.height;

    // Search input mode
    if (sidebarSearch.isInputActive) {
      if (event.name === "escape") {
        sidebarSearch.cancelInput();
        hideSearchInput();
        return true;
      }
      if (event.name === "return" || event.name === "enter") {
        const found = sidebarSearch.confirm(entryLabels);
        if (found) {
          const line = sidebarSearch.firstMatchFrom(cursorIndex);
          if (line >= 0) {
            cursorIndex = line;
            refreshList();
            scrollToCursor();
          }
        }
        hideSearchInput();
        return true;
      }
      if (event.name === "backspace" || event.name === "delete") {
        sidebarSearch.deleteChar();
        showSearchInput(sidebarSearch.inputBuffer);
        return true;
      }
      if (event.sequence && event.sequence.length === 1 && !event.ctrl && !event.meta) {
        sidebarSearch.appendChar(event.sequence);
        showSearchInput(sidebarSearch.inputBuffer);
        return true;
      }
      return true;
    }

    if (event.name === "/" || (event.sequence === "/" && !event.ctrl)) {
      sidebarSearch.startInput();
      showSearchInput("");
      return true;
    }

    if (event.name === "n" && !event.ctrl && !event.shift) {
      if (sidebarSearch.pattern) {
        const line = sidebarSearch.nextMatch();
        if (line >= 0) {
          cursorIndex = line;
          refreshList();
          scrollToCursor();
        }
      }
      return true;
    }

    if (event.name === "N" || (event.name === "n" && event.shift)) {
      if (sidebarSearch.pattern) {
        const line = sidebarSearch.prevMatch();
        if (line >= 0) {
          cursorIndex = line;
          refreshList();
          scrollToCursor();
        }
      }
      return true;
    }

    switch (event.name) {
      case "j":
      case "down":
        moveCursor(1);
        return true;
      case "k":
      case "up":
        moveCursor(-1);
        return true;
      case "return":
      case "enter":
        if (entries.length > 0) {
          onOpen(entries[cursorIndex]!.path);
        }
        return true;
      case "G":
        cursorIndex = entries.length - 1;
        refreshList();
        scrollToCursor();
        return true;
      case "g":
        if (!event.ctrl && !event.shift) {
          cursorIndex = 0;
          refreshList();
          scrollBox.scrollTo(0);
          return true;
        }
        return false;
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
        cursorIndex = 0;
        refreshList();
        scrollBox.scrollTo(0);
        return true;
      case "end":
        cursorIndex = entries.length - 1;
        refreshList();
        scrollToCursor();
        return true;
      default:
        return false;
    }
  };

  const setVisible = (show: boolean) => {
    if (visible === show) return;
    visible = show;
    if (show) {
      sidebarBox.width = SIDEBAR_WIDTH;
      sidebarBox.flexShrink = 0;
      header.content = "FILES";
      refreshList();
    } else {
      sidebarBox.width = 0;
      sidebarBox.flexShrink = 1;
      header.content = "";
      listText.content = "";
    }
  };

  const highlightEntry = (filePath: string) => {
    const idx = entries.findIndex((e) => e.path === filePath);
    if (idx >= 0) {
      cursorIndex = idx;
      refreshList();
    }
  };

  const markChanged = (filePath: string) => {
    changedFiles.add(filePath);
    refreshList();
  };

  const clearChanged = (filePath: string) => {
    changedFiles.delete(filePath);
    refreshList();
  };

  const toggleVisible = (): boolean => {
    setVisible(!visible);
    return visible;
  };

  const showSearchInput = (buffer: string) => {
    searchText.content = `/${buffer}_`;
    searchText.height = 1;
  };

  const hideSearchInput = () => {
    searchText.content = "";
    searchText.height = 0;
  };

  return {
    sidebarBox,
    handleKey,
    setVisible,
    toggleVisible,
    highlightEntry,
    markChanged,
    clearChanged,
    showSearchInput,
    hideSearchInput,
    search: sidebarSearch,
  };
}
