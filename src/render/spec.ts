/**
 * Renderable Spec — IR for mdv's render pipeline.
 *
 * Stage 4 of the pipeline emits a tree of `Spec` values. Stage 5 (the
 * mounter in ./mount.ts) walks the tree and constructs the OpenTUI
 * Renderable graph. Splitting the IR from Renderable construction means:
 *
 *  - block renderers (`src/rendering/*`) become pure functions returning
 *    plain data — snapshot-testable without a TestRenderer.
 *  - stage 4 receives Spec, computes Y/height via an injected `Measure`
 *    dep, and emits a positioned line map that downstream overlays
 *    (cursor, selection, search) read directly. No more reverse-engineering
 *    `_blockStates` and dividing `r.height / linesInBlock`.
 *  - the pipeline runs without OpenTUI imports until mount time. mdv serve
 *    can share stages 1-4 with the TUI and only diverge at stage 5.
 *
 * The spec stays narrow: only the BoxRenderable / TextRenderable props
 * mdv's block renderers actually set. Extend as renderers port over —
 * adding a new prop here is the signal that we're starting to need it.
 */

import type { TextChunk } from "../types.js";

/**
 * Source-line span a spec subtree covers. Used by stage 4 to build the
 * line map. `start`/`end` are inclusive indices into the source content
 * lines. A block that doesn't correspond to source content (decorative
 * padding, fence borders rendered as their own subtree) carries `null`.
 */
export interface SourceSpan {
  start: number;
  end: number;
}

export interface BoxSpec {
  kind: "box";
  /** Stable id for the resulting Renderable; lets mount diff on reload. */
  id?: string;
  padding?: number;
  marginTop?: number;
  marginBottom?: number;
  flexDirection?: "row" | "column";
  /** Source-line range this box covers; null for purely-decorative wrappers. */
  source: SourceSpan | null;
  children: Spec[];
}

export interface TextSpec {
  kind: "text";
  id?: string;
  /** Text chunks, already styled. */
  chunks: TextChunk[];
  /** OpenTUI wrap mode; omit to use the default (word wrap). */
  wrapMode?: "none" | "char" | "word";
  /**
   * Per-source-line breakdown of `chunks`. Required when the text spec
   * spans more than one source line (e.g. a code block's content
   * TextRenderable holds all content lines). Used by stage 4 to compute
   * per-line wrap heights without re-parsing the chunks. One entry per
   * source line, in source order.
   */
  lines?: TextLine[];
  source: SourceSpan | null;
}

export interface TextLine {
  /** Source-line index this line came from. */
  sourceLine: number;
  /**
   * Cell-width of the rendered text, ignoring wrap. Stage 4 divides this
   * by the available viewport width to compute visible row count for the
   * source line. Pre-computed so the wrap measurer doesn't need access to
   * the chunks themselves.
   */
  displayWidth: number;
  /**
   * Plain (post-conceal) text for the line. Search column conversion and
   * yank reuse this; cursor row hit-testing reuses `displayWidth`.
   */
  displayText: string;
}

export type Spec = BoxSpec | TextSpec;
