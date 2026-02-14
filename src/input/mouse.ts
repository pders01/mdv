/**
 * Mouse event handling for click-to-position on non-selectable areas
 *
 * Character-level selection is handled natively by OpenTUI's renderer.
 * This module only handles clicks on gaps/margins (non-selectable areas)
 * to position the cursor. Native selection is cleared via keyboard handlers
 * (Esc, V-mode entry) — not here, to avoid interfering with the renderer's
 * selection anchor on mouseDown.
 */

import type { ScrollBoxRenderable, MouseEvent } from "@opentui/core";
import { MouseButton } from "@opentui/core";
import type { CursorManager } from "./cursor.js";
import { scrollToCursor } from "./cursor.js";
import type { GetLinePosition } from "../ui/container.js";

export interface MouseHandlerOptions {
  scrollBox: ScrollBoxRenderable;
  cursor: CursorManager;
  contentLines: string[];
  showNotification: (message: string, durationMs?: number) => void;
  getLinePosition: GetLinePosition;
}

/**
 * Convert a mouse Y screen coordinate to a content line number
 * using the uniform line-height model (fallback when rendered positions
 * are unavailable).
 *
 *   lineHeight  = scrollHeight / totalLines
 *   contentY    = scrollTop + (eventY - viewportTop)
 *   line        = floor(contentY / lineHeight)
 *
 * Exported for testing.
 */
export function uniformMouseYToLine(
  eventY: number,
  viewportTop: number,
  scrollTop: number,
  scrollHeight: number,
  totalLines: number,
): number {
  if (totalLines === 0 || scrollHeight <= 0) return 0;

  const lineHeight = scrollHeight / totalLines;
  const contentY = scrollTop + (eventY - viewportTop);
  const line = Math.floor(contentY / lineHeight);

  return Math.max(0, Math.min(line, totalLines - 1));
}

/**
 * Convert a mouse Y screen coordinate to a content line number
 * using actual rendered block positions.
 *
 * getLinePosition returns Y coordinates in screen-space (the scroll box's
 * layout system adjusts renderable positions for scrolling), so we compare
 * event.y directly against pos.y — no viewport offset subtraction needed.
 *
 * Strategy: compute a uniform estimate, then search outward using
 * actual positions to find the line whose rendered row contains the
 * click point.
 *
 * Exported for testing.
 */
export function mouseYToLine(
  eventY: number,
  viewportTop: number,
  scrollTop: number,
  scrollHeight: number,
  totalLines: number,
  getLinePos: GetLinePosition | null,
): number {
  if (totalLines === 0 || scrollHeight <= 0) return 0;

  // Uniform estimate — always available, used as starting point
  const estimate = uniformMouseYToLine(eventY, viewportTop, scrollTop, scrollHeight, totalLines);

  if (!getLinePos) return estimate;

  // Target in screen-space: getLinePosition Y values are already in screen
  // coordinates (the scroll box bakes the scroll offset into renderable
  // positions), so event.y maps directly to pos.y.
  const targetY = eventY;

  // Search outward from the uniform estimate using actual rendered positions.
  // The search window covers the full viewport (~50-80 lines) which is
  // generous; getLinePosition is O(1) per call (cached maps).
  const maxRadius = 50;

  for (let r = 0; r <= maxRadius; r++) {
    const candidates = r === 0 ? [estimate] : [estimate - r, estimate + r];
    for (const line of candidates) {
      if (line < 0 || line >= totalLines) continue;
      const pos = getLinePos(line);
      if (!pos) continue;
      if (targetY >= pos.y && targetY < pos.y + pos.height) {
        return line;
      }
    }
  }

  // No exact hit (click in a gap between blocks) — find the closest line
  let bestLine = estimate;
  let bestDist = Infinity;
  for (let r = 0; r <= maxRadius; r++) {
    const candidates = r === 0 ? [estimate] : [estimate - r, estimate + r];
    for (const line of candidates) {
      if (line < 0 || line >= totalLines) continue;
      const pos = getLinePos(line);
      if (!pos) continue;
      const center = pos.y + pos.height / 2;
      const dist = Math.abs(targetY - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestLine = line;
      }
    }
  }

  return bestLine;
}

export function setupMouseHandler(options: MouseHandlerOptions): void {
  const { scrollBox, cursor, contentLines, getLinePosition } = options;
  const totalLines = contentLines.length;

  if (totalLines === 0) return;

  scrollBox.onMouseDown = (event: MouseEvent) => {
    if (event.button !== MouseButton.LEFT) return;

    const line = mouseYToLine(
      event.y,
      scrollBox.viewport.y,
      scrollBox.scrollTop,
      scrollBox.scrollHeight,
      totalLines,
      getLinePosition,
    );

    // Click exits visual mode and repositions cursor
    if (cursor.mode === "visual") {
      cursor.exitVisual();
    }
    cursor.setCursor(line);
    scrollToCursor(scrollBox, cursor.cursorLine, totalLines);
  };
}
