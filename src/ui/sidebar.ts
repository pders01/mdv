/**
 * Sidebar file tree component for directory browsing mode
 *
 * Uses a single TextRenderable for the file list to avoid per-child
 * layout issues in ScrollBox. Cursor highlight is drawn via renderAfter.
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
import type { FileTree, FileEntry } from "../fs/tree.js";
import type { ThemeColors } from "../types.js";

export interface SidebarSetup {
  sidebarBox: BoxRenderable;
  handleKey: (event: KeyEvent) => boolean;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => boolean;
  highlightEntry: (filePath: string) => void;
}

const SIDEBAR_WIDTH = 30;
const MAX_LABEL_LEN = SIDEBAR_WIDTH - 3;

function formatEntryLabel(entry: FileEntry): string {
  // Show relative path to distinguish files in different directories
  const relPath = entry.relativePath;
  if (relPath.length <= MAX_LABEL_LEN) return relPath;
  // Truncate from the left, keeping the filename visible
  return "..." + relPath.slice(relPath.length - MAX_LABEL_LEN + 3);
}

function buildListContent(entries: FileEntry[], selected: number): string {
  return entries
    .map((e, i) => {
      const prefix = i === selected ? ">" : " ";
      return prefix + formatEntryLabel(e);
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
  let cursorIndex = 0;
  let visible = true;

  const cursorRGBA = RGBA.fromHex(colors.blue);
  cursorRGBA.a = 0.3;

  // Outer container
  const sidebarBox = new BoxRenderable(renderer, {
    id: "sidebar",
    width: SIDEBAR_WIDTH,
    flexShrink: 0,
    flexDirection: "column",
  });

  // Header
  const header = new TextRenderable(renderer, {
    id: "sidebar-header",
    content: "FILES",
    fg: colors.fg,
    attributes: TextAttributes.BOLD,
    height: 1,
    paddingLeft: 1,
  });
  sidebarBox.add(header);

  // Scrollable file list
  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "sidebar-scroll",
    flexGrow: 1,
    scrollY: true,
    scrollX: false,
  });
  sidebarBox.add(scrollBox);

  // Single text renderable for the entire file list
  const listText = new TextRenderable(renderer, {
    id: "sidebar-list",
    content: buildListContent(entries, cursorIndex),
    fg: colors.fg,
    wrapMode: "none",
    truncate: true,
  });
  scrollBox.add(listText);

  // Rebuild list content to reflect new cursor position.
  // Setting .content dirties the renderable, triggering a repaint.
  const refreshList = () => {
    listText.content = buildListContent(entries, cursorIndex);
  };

  // Draw cursor highlight overlay on the scroll content.
  if (scrollBox.content) {
    scrollBox.content.renderAfter = (buffer) => {
      if (entries.length === 0) return;

      const baseY = listText.y;
      const y = baseY + cursorIndex;

      // Clip to visible area
      if (y < 0 || y >= buffer.height) return;
      buffer.fillRect(0, y, buffer.width, 1, cursorRGBA);
    };
  }

  const scrollToCursor = () => {
    if (entries.length === 0) return;

    // Each entry = 1 terminal row. Use lineCount from the text buffer
    // to get the actual content height; fall back to entry count.
    const totalLines = listText.lineCount > 0 ? listText.lineCount : entries.length;
    const scrollHeight = scrollBox.scrollHeight;
    if (scrollHeight <= 0) return;

    const lineHeight = scrollHeight / totalLines;
    const cursorY = cursorIndex * lineHeight;
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
    sidebarBox.width = show ? SIDEBAR_WIDTH : 0;
    sidebarBox.flexShrink = show ? 0 : 1;
  };

  const highlightEntry = (filePath: string) => {
    const idx = entries.findIndex((e) => e.path === filePath);
    if (idx >= 0) {
      cursorIndex = idx;
      refreshList();
    }
  };

  const toggleVisible = (): boolean => {
    setVisible(!visible);
    return visible;
  };

  return { sidebarBox, handleKey, setVisible, toggleVisible, highlightEntry };
}
