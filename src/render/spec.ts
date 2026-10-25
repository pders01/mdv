/**
 * Renderable Spec — IR for mdv's render pipeline.
 *
 * `documentToSpecs` emits these trees through the shared token factories.
 * `mount.ts` constructs the TUI renderable graph; `ansi.ts` lays out rows
 * for one-shot terminal output. Chunks retain OpenTUI RGBA color values,
 * but building a Spec never requires a renderer instance.
 *
 * Source spans and TextLine metadata also support TUI line measurement.
 * See SPEC.md for the backend boundary and stdout layout contract.
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

/**
 * Block-kind tag on top-level specs. Lets downstream code (measurement,
 * cursor overlays) dispatch without reaching back into the source token.
 * Top-level *ToSpec factories set this; inner / decorative boxes leave
 * it unset.
 */
export type BlockTag =
  | "code"
  | "paragraph"
  | "heading"
  | "list"
  | "table"
  | "blockquote"
  | "hr"
  | "html"
  | "deflist";

export interface BoxSpec {
  kind: "box";
  /** Stable id for the resulting Renderable; lets mount diff on reload. */
  id?: string;
  /** Block-kind tag (top-level only). */
  block?: BlockTag;
  padding?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
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
