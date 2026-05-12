/**
 * Measurement dep for stage 4 of the render pipeline.
 *
 * Today the only producer is `yogaMeasure` (mount the spec into an
 * off-screen TestRenderer and read back the Yoga-computed `y`/`height`).
 * Tests use `staticMeasure` which trusts whatever values the test caller
 * provides — keeps stage-4 logic testable without spinning a renderer.
 *
 * The shape of the result mirrors what cursor / selection / search need:
 * absolute Y on the scroll surface, total visible height, and per-source-
 * line offsets within the spec subtree (so cursor row math doesn't have
 * to divide block-height by source-line count again).
 */

import type { Spec, SourceSpan } from "./spec.js";

export interface PositionedSpec {
  /** Y offset of this spec within its parent's local layout box. */
  y: number;
  /** Total visible row count after wrap. */
  height: number;
  /** Source span this spec covers, or null for decorative subtrees. */
  source: SourceSpan | null;
  /**
   * Y offset and height per source line covered. Empty when the spec is
   * decorative or maps to a single source line. Cursor / selection draw
   * from this; uniform divide is gone.
   */
  rows: PositionedRow[];
  children: PositionedSpec[];
}

export interface PositionedRow {
  sourceLine: number;
  y: number;
  height: number;
}

/**
 * Measure a spec tree. Pure given a pure implementation.
 *
 *  - viewportWidth: available cell width for wrap math.
 *  - Implementations are free to recurse into the tree (the production
 *    Yoga-backed measure does so via mount-and-readback; the static mock
 *    expects callers to pre-supply positions).
 */
export type Measure = (spec: Spec, viewportWidth: number) => PositionedSpec;
