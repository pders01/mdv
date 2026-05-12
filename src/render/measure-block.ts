/**
 * Single entry point for per-row measurement of a rendered block.
 *
 * Two strategies inside, dispatched by token kind:
 *  - Code blocks bypass the rendered tree entirely and use the pure
 *    `measureCodeLines` wrap math. Each source line maps to N visible
 *    rows = `ceil(displayWidth / contentWidth)`; the inner Y area is
 *    `padding` rows past the block top.
 *  - Everything else walks the renderable subtree: a direct-child match
 *    if `getChildren().length === linesInBlock`, otherwise a DFS leaf
 *    walk over the block's renderable tree. Falls back to uniform divide
 *    when neither shape lines up with the source-line count (single-
 *    paragraph wrap is the canonical case — one child, N visible rows,
 *    `r.height / linesInBlock` gives the right answer for the only
 *    source line in the block).
 *
 * This replaces the duo of `codeRowMapFor` + `getRowLayout` previously
 * embedded in `container.ts` and keeps line-mapping logic in one file.
 */

import type { CodeMeasurement } from "./measure-code.js";
import { measureCodeLines } from "./measure-code.js";
import type { BoxSpec, Spec, TextSpec } from "./spec.js";

/**
 * Block state shape the measurer needs. `spec.block` tells the
 * measurer what kind of block this is (for code-block fast-path);
 * `spec.source` carries the source-line range; nested TextSpec.lines
 * carries the per-source-line wrap data for code blocks.
 */
export interface BlockStateForMeasure {
  renderable: RowRenderable;
  spec: Spec;
}

function asTopBox(spec: Spec): BoxSpec | null {
  return spec.kind === "box" ? spec : null;
}

function codeTextSpec(spec: Spec): TextSpec | null {
  const box = asTopBox(spec);
  if (!box || box.block !== "code") return null;
  const inner = box.children[0];
  return inner && inner.kind === "text" && inner.lines ? inner : null;
}

export interface RowRenderable {
  x: number;
  y: number;
  width: number;
  height: number;
  getChildren?: () => RowRenderable[];
}

/**
 * Layout slot for a single source line within a rendered block. `y` is in
 * the same coordinate frame as the block's renderable `r.y` (so
 * scroll-surface Y for screen overlays, layout-Y for `scrollTo`).
 */
export interface RowLayout {
  x: number;
  y: number;
  height: number;
}

/** Code-block row map, keyed by absolute source-line index. */
export interface CodeRowMap {
  innerYStart: number;
  rows: Map<number, { innerY: number; height: number }>;
}

/**
 * Pre-compute the per-source-line wrap map for a code block from its
 * current rendered width. Returns null for non-code blocks or code blocks
 * lacking a text body. Recomputed per call so resize / sidebar-toggle
 * reflow takes effect immediately.
 */
export function codeRowMapFor(
  state: BlockStateForMeasure,
  codeBlockPadding = 1,
): CodeRowMap | null {
  const textSpec = codeTextSpec(state.spec);
  if (!textSpec) return null;
  const span = state.spec.source;
  if (!span) return null;
  const measurement = measureCodeLines(textSpec.lines!, state.renderable.width, codeBlockPadding);
  return buildCodeRowMap(measurement, span.start, span.end, codeBlockPadding);
}

function buildCodeRowMap(
  measurement: CodeMeasurement,
  startLine: number,
  endLine: number,
  padding: number,
): CodeRowMap {
  const rows = new Map<number, { innerY: number; height: number }>();
  // The opening / closing fence rows live at the padding bands; map them
  // explicitly so cursor highlights land cleanly on the fence lines.
  rows.set(startLine, { innerY: -measurement.innerYStart, height: padding });
  for (const row of measurement.lines) {
    rows.set(row.sourceLine, { innerY: row.innerY, height: row.height });
  }
  rows.set(endLine, { innerY: measurement.innerHeight, height: padding });
  return { innerYStart: measurement.innerYStart, rows };
}

/**
 * Measure one source line within a block. Returns the row layout in the
 * same coordinate frame as the block's `renderable.y`.
 */
export function measureBlockLine(
  state: BlockStateForMeasure,
  line: number,
  codeBlockPadding = 1,
): RowLayout {
  const r = state.renderable;
  const span = state.spec.source ?? { start: 0, end: 0 };
  const linesInBlock = span.end - span.start + 1;
  const lineWithinBlock = line - span.start;

  const codeMap = codeRowMapFor(state, codeBlockPadding);
  if (codeMap) {
    const exact = codeMap.rows.get(line);
    if (exact) {
      return { x: r.x, y: r.y + codeMap.innerYStart + exact.innerY, height: exact.height };
    }
  }

  const row = walkRenderable(r, linesInBlock, lineWithinBlock);
  return { x: r.x, y: row.y, height: row.height };
}

/**
 * Same as `measureBlockLine` but skips the code-block path. Used by the
 * line-mapping cache after it has already determined the block is not a
 * code block.
 */
export function walkRenderable(
  r: RowRenderable,
  linesInBlock: number,
  lineWithinBlock: number,
): { y: number; height: number } {
  if (linesInBlock > 1 && typeof r.getChildren === "function") {
    const children = r.getChildren();
    if (children.length === linesInBlock) {
      const child = children[lineWithinBlock];
      if (child) return { y: child.y, height: child.height };
    }
    const leaves = collectLeafRows(r);
    if (leaves.length === linesInBlock) {
      const leaf = leaves[lineWithinBlock];
      if (leaf) return { y: leaf.y, height: leaf.height };
    }
  }
  const lineHeight = linesInBlock > 0 ? r.height / linesInBlock : 1;
  return { y: r.y + lineWithinBlock * lineHeight, height: lineHeight };
}

/**
 * DFS leaf collection. A leaf is any renderable without nested children;
 * paint order (top-to-bottom for column flex) lines up with source-line
 * order in lists, table rows, nested-list rows, blockquote rows.
 */
function collectLeafRows(r: RowRenderable): RowRenderable[] {
  const out: RowRenderable[] = [];
  const visit = (node: RowRenderable) => {
    const get = node.getChildren;
    if (typeof get !== "function") {
      out.push(node);
      return;
    }
    const children = get.call(node);
    if (children.length === 0) {
      out.push(node);
      return;
    }
    for (const child of children) visit(child);
  };
  visit(r);
  return out;
}
