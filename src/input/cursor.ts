/**
 * Cursor and selection management (Vim-style)
 *
 * Normal mode: cursor indicates current line
 * Visual mode: selection from anchor to cursor
 */

import type { ScrollBoxRenderable } from "@opentui/core";
import type { Mode } from "../types.js";

/**
 * Cursor/selection state
 */
export interface CursorState {
  mode: Mode;
  cursorLine: number;
  anchorLine: number; // Only used in visual mode
}

/**
 * Cursor manager with Vim-style behavior
 */
export class CursorManager {
  private _mode: Mode = "normal";
  private _cursorLine = 0;
  private _anchorLine = 0;
  private totalLines: number;
  private onUpdate: () => void;

  constructor(totalLines: number, onUpdate: () => void) {
    this.totalLines = totalLines;
    this.onUpdate = onUpdate;
  }

  get mode(): Mode {
    return this._mode;
  }

  get cursorLine(): number {
    return this._cursorLine;
  }

  get anchorLine(): number {
    return this._anchorLine;
  }

  /**
   * Get selection start (smaller of anchor/cursor)
   */
  get selectionStart(): number {
    return Math.min(this._anchorLine, this._cursorLine);
  }

  /**
   * Get selection end (larger of anchor/cursor)
   */
  get selectionEnd(): number {
    return Math.max(this._anchorLine, this._cursorLine);
  }

  /**
   * Move cursor by relative amount
   */
  moveCursor(delta: number): void {
    this._cursorLine = Math.max(0, Math.min(this._cursorLine + delta, this.totalLines - 1));
    this.onUpdate();
  }

  /**
   * Move cursor to specific line
   */
  setCursor(line: number): void {
    this._cursorLine = Math.max(0, Math.min(line, this.totalLines - 1));
    this.onUpdate();
  }

  /**
   * Move cursor to first line
   */
  moveToFirst(): void {
    this._cursorLine = 0;
    this.onUpdate();
  }

  /**
   * Move cursor to last line
   */
  moveToLast(): void {
    this._cursorLine = this.totalLines - 1;
    this.onUpdate();
  }

  /**
   * Enter visual mode (anchor at current cursor)
   */
  enterVisual(): void {
    this._mode = "visual";
    this._anchorLine = this._cursorLine;
    this.onUpdate();
  }

  /**
   * Exit visual mode back to normal
   */
  exitVisual(): void {
    this._mode = "normal";
    this.onUpdate();
  }

  /**
   * Get selected line count (1 in normal mode)
   */
  getSelectedLineCount(): number {
    if (this._mode === "normal") return 1;
    return this.selectionEnd - this.selectionStart + 1;
  }

  /**
   * Get selected content from content lines
   */
  getSelectedContent(contentLines: string[]): string {
    if (this._mode === "normal") {
      return contentLines[this._cursorLine] || "";
    }
    return contentLines.slice(this.selectionStart, this.selectionEnd + 1).join("\n");
  }

  /**
   * Initialize cursor from scroll position (center of viewport)
   */
  initFromScroll(scrollBox: ScrollBoxRenderable): void {
    if (this.totalLines === 0 || scrollBox.scrollHeight <= 0) return;

    const lineHeight = scrollBox.scrollHeight / this.totalLines;
    const viewportHeight = scrollBox.viewport?.height || scrollBox.scrollHeight;
    const centerY = scrollBox.scrollTop + viewportHeight / 2;
    const centerLine = Math.floor(centerY / lineHeight);

    this._cursorLine = Math.max(0, Math.min(centerLine, this.totalLines - 1));
  }
}

/**
 * Create a cursor manager
 */
export function createCursorManager(
  totalLines: number,
  onUpdate: () => void
): CursorManager {
  return new CursorManager(totalLines, onUpdate);
}

/**
 * Scroll viewport to keep cursor visible
 */
export function scrollToCursor(
  scrollBox: ScrollBoxRenderable,
  cursorLine: number,
  totalLines: number,
  center: boolean = false
): void {
  if (totalLines === 0 || scrollBox.scrollHeight <= 0) return;

  const lineHeight = scrollBox.scrollHeight / totalLines;
  const viewportHeight = scrollBox.viewport?.height || scrollBox.scrollHeight;
  const cursorY = cursorLine * lineHeight;

  if (center) {
    // Center cursor in viewport
    const centerOffset = Math.floor(viewportHeight / 2);
    scrollBox.scrollTo(Math.max(0, cursorY - centerOffset));
  } else {
    // Keep cursor visible with margin
    const margin = Math.floor(lineHeight * 3); // 3-line margin
    const currentTop = scrollBox.scrollTop;
    const currentBottom = currentTop + viewportHeight;

    if (cursorY < currentTop + margin) {
      // Cursor above visible area
      scrollBox.scrollTo(Math.max(0, cursorY - margin));
    } else if (cursorY + lineHeight > currentBottom - margin) {
      // Cursor below visible area
      scrollBox.scrollTo(Math.max(0, cursorY + lineHeight + margin - viewportHeight));
    }
  }
}
