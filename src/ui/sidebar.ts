/**
 * Sidebar file tree component for directory browsing mode
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
import type { FileTree } from "../fs/tree.js";
import type { ThemeColors } from "../types.js";

export interface SidebarSetup {
  sidebarBox: BoxRenderable;
  handleKey: (event: KeyEvent) => boolean;
  setVisible: (visible: boolean) => void;
  highlightEntry: (filePath: string) => void;
}

const SIDEBAR_WIDTH = 30;

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
    content: " FILES",
    fg: colors.fg,
    attributes: TextAttributes.BOLD,
    height: 1,
  });
  sidebarBox.add(header);

  // Separator line under header
  const sep = new TextRenderable(renderer, {
    id: "sidebar-sep",
    content: "─".repeat(SIDEBAR_WIDTH),
    fg: colors.gray,
    height: 1,
  });
  sidebarBox.add(sep);

  // Scrollable file list
  const scrollBox = new ScrollBoxRenderable(renderer, {
    id: "sidebar-scroll",
    flexGrow: 1,
    scrollY: true,
    scrollX: false,
  });
  sidebarBox.add(scrollBox);

  // File entry renderables
  const entryRenderables: TextRenderable[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const indent = "  ".repeat(entry.depth);
    const label = indent + entry.relativePath.split("/").pop()!;
    const truncated =
      label.length > SIDEBAR_WIDTH - 2 ? label.slice(0, SIDEBAR_WIDTH - 5) + "..." : label;

    const text = new TextRenderable(renderer, {
      id: `sidebar-entry-${i}`,
      content: ` ${truncated}`,
      fg: colors.fg,
      height: 1,
    });
    entryRenderables.push(text);
    scrollBox.add(text);
  }

  // Highlight the cursor entry
  const updateHighlight = () => {
    for (let i = 0; i < entryRenderables.length; i++) {
      entryRenderables[i]!.fg = i === cursorIndex ? colors.link : colors.fg;
      entryRenderables[i]!.attributes =
        i === cursorIndex ? TextAttributes.BOLD : TextAttributes.NONE;
    }
  };

  // Draw cursor highlight overlay
  if (scrollBox.content) {
    scrollBox.content.renderAfter = (buffer) => {
      if (entries.length === 0) return;
      const y = cursorIndex;
      if (y >= 0 && y < buffer.height) {
        buffer.fillRect(0, y, buffer.width, 1, cursorRGBA);
      }
    };
  }

  updateHighlight();

  const moveCursor = (delta: number) => {
    const newIndex = Math.max(0, Math.min(cursorIndex + delta, entries.length - 1));
    if (newIndex === cursorIndex) return;
    cursorIndex = newIndex;
    updateHighlight();

    // Scroll to keep cursor visible
    if (scrollBox.scrollHeight > 0 && entries.length > 0) {
      const lineHeight = scrollBox.scrollHeight / entries.length;
      const cursorY = cursorIndex * lineHeight;
      const viewportHeight = scrollBox.viewport?.height || scrollBox.scrollHeight;
      const margin = lineHeight * 2;

      if (cursorY < scrollBox.scrollTop + margin) {
        scrollBox.scrollTo(Math.max(0, cursorY - margin));
      } else if (cursorY + lineHeight > scrollBox.scrollTop + viewportHeight - margin) {
        scrollBox.scrollTo(Math.max(0, cursorY + lineHeight + margin - viewportHeight));
      }
    }
  };

  const handleKey = (event: KeyEvent): boolean => {
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
        updateHighlight();
        if (scrollBox.scrollHeight > 0) {
          scrollBox.scrollTo(scrollBox.scrollHeight);
        }
        return true;
      case "g":
        if (!event.ctrl && !event.shift) {
          // Single g press — we'd need double-g tracking, keep simple for now
          // Just go to top on g
          cursorIndex = 0;
          updateHighlight();
          scrollBox.scrollTo(0);
          return true;
        }
        return false;
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
      updateHighlight();
    }
  };

  return { sidebarBox, handleKey, setVisible, highlightEntry };
}
