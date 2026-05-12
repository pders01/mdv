/**
 * Pure measurement for code-block specs.
 *
 * A code block is a Box(padding=1) wrapping a single TextRenderable whose
 * lines we already cell-measured during spec emission. Given the inner
 * content width (viewport minus padding), wrap row count per source line
 * is `ceil(displayWidth / contentWidth)` — no need to ask OpenTUI.
 *
 * Returned offsets are local to the block's painted box: callers add the
 * block's `r.y` to convert to scroll-surface coordinates. The split keeps
 * this function pure and Yoga-agnostic.
 */

import type { BoxSpec, TextSpec, TextLine } from "./spec.js";
import { cellWidth } from "../util/width.js";

export interface CodeLineOffset {
  sourceLine: number;
  /** Row offset within the block (0 at the top of the inner text area). */
  innerY: number;
  /** Visible rows the source line occupies after wrap. */
  height: number;
}

export interface CodeMeasurement {
  /** Inner text area y, relative to the block's box (= padding-top). */
  innerYStart: number;
  /** Total visible rows the inner text area occupies. */
  innerHeight: number;
  /** Per-source-line offsets within the inner text area. */
  lines: CodeLineOffset[];
}

export function measureCodeBlock(spec: BoxSpec, viewportWidth: number): CodeMeasurement {
  const padding = spec.padding ?? 0;
  const text = spec.children[0] as TextSpec | undefined;
  return measureCodeLines(text?.lines ?? [], viewportWidth, padding);
}

/**
 * Primitive used by `measureCodeBlock` and by container.ts's line-mapping
 * cache, which has access to the raw code text but not the full spec.
 */
export function measureCodeLines(
  lines: TextLine[],
  viewportWidth: number,
  padding: number,
): CodeMeasurement {
  const contentWidth = Math.max(1, viewportWidth - padding * 2);

  const offsets: CodeLineOffset[] = [];
  let cursor = 0;
  for (const line of lines) {
    const rows = Math.max(1, Math.ceil(line.displayWidth / contentWidth));
    offsets.push({ sourceLine: line.sourceLine, innerY: cursor, height: rows });
    cursor += rows;
  }

  return { innerYStart: padding, innerHeight: cursor, lines: offsets };
}

/**
 * Convenience: build a `TextLine[]` from raw code-block text + the source
 * line index of the opening fence. Used by container.ts which receives
 * tokens straight from the parser and never builds a Spec.
 */
export function textLinesFromCodeText(text: string, openingFenceLine: number): TextLine[] {
  return text.split("\n").map((t, i) => ({
    sourceLine: openingFenceLine + 1 + i,
    displayWidth: cellWidth(t),
    displayText: t,
  }));
}
