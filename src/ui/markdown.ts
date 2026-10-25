/**
 * mdv's markdown renderable.
 *
 * Forks the surface area of OpenTUI's `MarkdownRenderable` so the TUI can
 * use the unified parser instead of OpenTUI's bundled `marked`. The point
 * of the fork is conformance + plugin reach: `mdv serve` already runs on
 * unified (99.1% spec, plugin ecosystem); this brings the TUI to the same
 * parser without rewriting every renderer in `src/rendering/*`.
 *
 * Strategy:
 *   1. Parse content with the same processor `mdv serve` uses (remark-parse
 *      + remark-gfm, no rehype — we want the mdast tree).
 *   2. `mdast → marked-token-shape` adapter (`util/mdast-to-marked.ts`).
 *   3. Walk top-level tokens, hand each to the user's `renderNode` callback,
 *      mount the returned Renderable as a vertical child.
 *   4. Expose a `_blockStates` array shaped like OpenTUI's so
 *      `src/ui/container.ts` can keep mapping source lines → rendered block
 *      positions for cursor highlighting.
 *
 * Trade-offs vs upstream:
 *   - No tree-sitter integration (we already use Shiki via `renderNode`).
 *   - No incremental token reuse on `set content` — parse is fast enough
 *     (≪5ms on a 1500-line file) that a full rebuild is acceptable. Can
 *     be added later by hashing top-level tokens and reusing children.
 *   - No streaming mode. mdv reads files synchronously; not needed.
 */

import { BoxRenderable, type Renderable, type RenderContext } from "@opentui/core";
import type { BoxOptions } from "@opentui/core";
import { documentToSpecs, type RenderNode, type RenderNodeContext } from "../render/document.js";
import type { Spec } from "../render/spec.js";
import { mountSpec } from "../render/mount.js";

/**
 * Subset of OpenTUI's `RenderNodeContext` that our renderers actually use.
 * `defaultRender` is here because the type signature `src/rendering/*`
 * accepts requires it; we never invoke it (every handler returns its own
 * Renderable) so a no-op stub is safe.
 *
 * `sourceLineStart` is the 0-indexed source line where the current block
 * begins, populated by `rebuild` before each `renderNode` call. Code
 * block emission uses it to set absolute `TextLine.sourceLine` values
 * so per-line measurement maps directly without post-hoc shifts.
 */
export type MdvRenderNodeContext = RenderNodeContext;
export type MdvRenderNode = RenderNode;

/**
 * Per-block state exposed via `MdvMarkdownRenderable.blockStates`.
 * Source-line ranges live on `spec.source` (always populated for
 * top-level blocks by `rebuild`). Block-kind dispatch reads
 * `spec.block`; the source token is not retained.
 */
export interface MdvBlockState {
  renderable: Renderable;
  /**
   * The spec the dispatcher emitted for this block. `spec.source`
   * carries the 0-indexed inclusive source-line range, set in
   * `rebuild` before mount.
   */
  spec: Spec;
}

export interface MdvMarkdownOptions extends BoxOptions {
  content?: string;
  conceal?: boolean;
  renderNode?: MdvRenderNode;
}

export class MdvMarkdownRenderable extends BoxRenderable {
  private _content = "";
  private _conceal = true;
  private _renderNode?: MdvRenderNode;
  private _blockStates: MdvBlockState[] = [];

  /**
   * Per-block state in source order. Read by `container.ts` line-mapping,
   * cursor overlays, search, and measurement. Returned as the live array
   * so callers can pin a reference across reloads; treat as read-only.
   */
  get blockStates(): readonly MdvBlockState[] {
    return this._blockStates;
  }

  constructor(ctx: RenderContext, options: MdvMarkdownOptions) {
    super(ctx, {
      ...options,
      // BoxRenderable defaults to row layout; markdown is a vertical stack.
      flexDirection: "column",
    });
    this._conceal = options.conceal ?? true;
    this._renderNode = options.renderNode;
    if (typeof options.content === "string") {
      this._content = options.content;
      this.rebuild();
    }
  }

  get content(): string {
    return this._content;
  }
  set content(value: string) {
    if (value === this._content) return;
    this._content = value;
    this.rebuild();
  }

  get conceal(): boolean {
    return this._conceal;
  }
  set conceal(value: boolean) {
    if (value === this._conceal) return;
    this._conceal = value;
    this.rebuild();
  }

  /**
   * Swap the renderNode and re-run rebuild. Used when something the
   * renderNode closure captured (e.g. content-pane width on sidebar
   * toggle) has changed and the existing children need to be re-laid
   * out against the new context.
   */
  setRenderNode(renderNode: MdvRenderNode): void {
    this._renderNode = renderNode;
    this.rebuild();
  }

  /**
   * Discard existing children + block states, re-parse content, mount fresh
   * children. Called on construction and on every `content` / `conceal`
   * mutation. Cheap enough at current document sizes that incremental reuse
   * isn't yet worth the complexity.
   */
  private rebuild(): void {
    for (const block of this._blockStates) {
      this.remove(block.renderable);
      block.renderable.destroy();
    }
    this._blockStates = [];

    if (!this._content || !this._renderNode) return;

    for (const spec of documentToSpecs(this._content, this._renderNode, this._conceal)) {
      const renderable = mountSpec(this.ctx, spec);
      this.add(renderable);
      this._blockStates.push({ renderable, spec });
    }
  }
}

