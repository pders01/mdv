/**
 * Cursor and selection management (Vim-style)
 *
 * Normal mode: cursor indicates current line
 * Visual mode: selection from anchor to cursor
 */

import type { ScrollBoxRenderable } from "@opentui/core";
import type { Mode } from "../types.js";
import type { GetContentLineY } from "../ui/container.js";

/**
 * Cursor/selection state
 */
export interface CursorState {
  mode: Mode;
  cursorLine: number;
  anchorLine: number; // Only used in visual mode
}

/**
 * Cursor manager with Vim-style behavior.
 *
 * The cursor is constrained to "cursorable" lines — typically lines that map
 * to a parsed markdown token, since gap lines between tokens aren't part of
 * any yankable block. Without the constraint, j/k traversed blanks but the
 * highlight disappeared on those rows (no block to anchor it to), which
 * read as the cursor jumping past empty space.
 *
 * The predicate is supplied after construction (the renderer's block
 * mapping isn't ready until first paint); until then every line is
 * considered cursorable so the cursor doesn't get stranded at startup.
 */
export class CursorManager {
  private _mode: Mode = "normal";
  private _cursorLine = 0;
  private _anchorLine = 0;
  private _selectionStart = 0;
  private _selectionEnd = 0;
  private totalLines: number;
  private onUpdate: () => void;
  private isCursorable: (line: number) => boolean = () => true;

  constructor(totalLines: number, onUpdate: () => void) {
    this.totalLines = totalLines;
    this.onUpdate = onUpdate;
  }

  /** Constrain cursor to lines the predicate accepts (default: all). */
  setCursorablePredicate(predicate: (line: number) => boolean): void {
    this.isCursorable = predicate;
  }

  /**
   * If the current line is not cursorable, scan in `prefer` direction first;
   * fall back to the opposite direction if no cursorable line exists there.
   * Bails out (leaves cursor where it is) if the predicate accepts nothing.
   */
  private snapToCursorable(prefer: "down" | "up"): void {
    if (this.totalLines === 0) return;
    if (this.isCursorable(this._cursorLine)) return;

    const tryDir = (step: number): boolean => {
      let l = this._cursorLine + step;
      while (l >= 0 && l < this.totalLines) {
        if (this.isCursorable(l)) {
          this._cursorLine = l;
          return true;
        }
        l += step;
      }
      return false;
    };

    if (prefer === "down") {
      if (!tryDir(1) && !tryDir(-1)) return;
    } else {
      if (!tryDir(-1) && !tryDir(1)) return;
    }
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
   * Get selection start (smaller of anchor/cursor) - cached
   */
  get selectionStart(): number {
    return this._selectionStart;
  }

  /**
   * Get selection end (larger of anchor/cursor) - cached
   */
  get selectionEnd(): number {
    return this._selectionEnd;
  }

  /**
   * Update cached selection bounds
   */
  private updateSelectionBounds(): void {
    this._selectionStart = Math.min(this._anchorLine, this._cursorLine);
    this._selectionEnd = Math.max(this._anchorLine, this._cursorLine);
  }

  /**
   * Move cursor by relative amount, snapping past gap lines in the same
   * direction. A single j press over a paragraph boundary therefore lands
   * on the first line of the next block instead of pausing on a blank row.
   */
  moveCursor(delta: number): void {
    this._cursorLine = Math.max(0, Math.min(this._cursorLine + delta, this.totalLines - 1));
    this.snapToCursorable(delta >= 0 ? "down" : "up");
    this.updateSelectionBounds();
    this.onUpdate();
  }

  /**
   * Move cursor to specific line. Used by mouse clicks, search jumps, and
   * file-switch resets — snap downward by default so a click lands on the
   * nearest content row (matches what the user pointed at).
   */
  setCursor(line: number): void {
    this._cursorLine = Math.max(0, Math.min(line, this.totalLines - 1));
    this.snapToCursorable("down");
    this.updateSelectionBounds();
    this.onUpdate();
  }

  /**
   * Move cursor to first line
   */
  moveToFirst(): void {
    this._cursorLine = 0;
    this.snapToCursorable("down");
    this.updateSelectionBounds();
    this.onUpdate();
  }

  /**
   * Move cursor to last line
   */
  moveToLast(): void {
    this._cursorLine = this.totalLines - 1;
    this.snapToCursorable("up");
    this.updateSelectionBounds();
    this.onUpdate();
  }

  /**
   * Enter visual mode (anchor at current cursor)
   */
  enterVisual(): void {
    this._mode = "visual";
    this._anchorLine = this._cursorLine;
    this.updateSelectionBounds();
    this.onUpdate();
  }

  /**
   * Exit visual mode back to normal
   */
  exitVisual(): void {
    this._mode = "normal";
    this.updateSelectionBounds();
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
    if (contentLines.length === 0) return "";
    if (this._mode === "normal") {
      return contentLines[this._cursorLine] || "";
    }
    return contentLines.slice(this.selectionStart, this.selectionEnd + 1).join("\n");
  }

  /**
   * Reset cursor for new content (directory mode file switch)
   */
  reset(newTotalLines: number, startLine: number = 0): void {
    this.totalLines = newTotalLines;
    this._cursorLine = Math.max(0, Math.min(startLine, newTotalLines - 1));
    this._anchorLine = 0;
    this._selectionStart = 0;
    this._selectionEnd = 0;
    this._mode = "normal";
    this.snapToCursorable("down");
    this.onUpdate();
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
    this.updateSelectionBounds();
  }
}

/**
 * Create a cursor manager
 */
export function createCursorManager(totalLines: number, onUpdate: () => void): CursorManager {
  return new CursorManager(totalLines, onUpdate);
}

// Cache for scroll calculations to avoid redundant division/multiplication
let scrollCache = {
  scrollHeight: -1,
  totalLines: -1,
  lineHeight: 0,
  viewportHeight: 0,
};

/**
 * Update scroll cache if dimensions changed
 */
function updateScrollCache(scrollBox: ScrollBoxRenderable, totalLines: number): void {
  if (totalLines === 0) return; // Guard against division by zero

  const currentScrollHeight = scrollBox.scrollHeight;
  const currentViewportHeight = scrollBox.viewport?.height || scrollBox.scrollHeight;

  if (
    currentScrollHeight !== scrollCache.scrollHeight ||
    totalLines !== scrollCache.totalLines ||
    currentViewportHeight !== scrollCache.viewportHeight
  ) {
    scrollCache = {
      scrollHeight: currentScrollHeight,
      totalLines,
      lineHeight: currentScrollHeight / totalLines,
      viewportHeight: currentViewportHeight,
    };
  }
}

/**
 * Scroll viewport to keep cursor visible
 *
 * Uses uniform line height estimation for scrolling (predictable, no render dependency).
 * Actual block positions are only used for rendering highlights.
 */
export function scrollToCursor(
  scrollBox: ScrollBoxRenderable,
  cursorLine: number,
  totalLines: number,
  center: boolean = false,
  getContentLineY?: GetContentLineY,
): void {
  if (totalLines === 0 || scrollBox.scrollHeight <= 0) return;

  updateScrollCache(scrollBox, totalLines);

  const { lineHeight: uniformLineHeight, viewportHeight } = scrollCache;

  // Use actual content-space Y when available (scroll-independent).
  // Falls back to uniform estimate before first render or for unmapped lines.
  const contentY = getContentLineY?.(cursorLine);
  const cursorY = contentY ?? cursorLine * uniformLineHeight;

  if (center) {
    // Center cursor in viewport
    const centerOffset = Math.floor(viewportHeight / 2);
    scrollBox.scrollTo(Math.max(0, cursorY - centerOffset));
  } else {
    // Keep cursor visible with margin
    const margin = Math.floor(uniformLineHeight * 3); // 3-line margin
    const currentTop = scrollBox.scrollTop;
    const currentBottom = currentTop + viewportHeight;

    if (cursorY < currentTop + margin) {
      // Cursor above visible area
      scrollBox.scrollTo(Math.max(0, cursorY - margin));
    } else if (cursorY + uniformLineHeight > currentBottom - margin) {
      // Cursor below visible area
      scrollBox.scrollTo(Math.max(0, cursorY + uniformLineHeight + margin - viewportHeight));
    }
  }
}
