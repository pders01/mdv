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
import type { Token } from "marked";
import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import wikiLink from "remark-wiki-link";
import remarkDeflist from "remark-deflist";
import remarkDirective from "remark-directive";
import remarkMarkers from "remark-flexible-markers";
import remarkSupersub from "remark-supersub";
import type { Root } from "mdast";
import { mdastRootToTokens } from "../util/mdast-to-marked.js";

/**
 * Subset of OpenTUI's `RenderNodeContext` that our renderers actually use.
 * `defaultRender` is here because the type signature `src/rendering/*`
 * accepts requires it; we never invoke it (every handler returns its own
 * Renderable) so a no-op stub is safe.
 */
export interface MdvRenderNodeContext {
  conceal: boolean;
  defaultRender: () => Renderable | null;
}

export type MdvRenderNode = (
  token: Token,
  context: MdvRenderNodeContext,
) => Renderable | null | undefined;

/**
 * Mirrors the BlockState shape `container.ts` introspects via
 * `markdown._blockStates`. Three fields are accessed externally: `token.type`,
 * `tokenRaw` (matched against the source string for line-mapping), and
 * `renderable.y` (current render offset).
 */
export interface MdvBlockState {
  token: Token;
  tokenRaw: string;
  renderable: Renderable;
}

export interface MdvMarkdownOptions extends BoxOptions {
  content?: string;
  conceal?: boolean;
  renderNode?: MdvRenderNode;
}

/** Shared processor — remark-parse + remark-gfm is stateless across calls. */
let sharedProcessor: Processor<Root, Root, Root, Root, string> | null = null;
function getProcessor(): Processor<Root, Root, Root, Root, string> {
  if (!sharedProcessor) {
    sharedProcessor = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml", "toml"])
      // singleTilde:false reserves `~text~` for remark-supersub (subscript)
      // — GFM strikethrough still works as `~~text~~`.
      .use(remarkGfm, { singleTilde: false })
      .use(remarkMath)
      .use(wikiLink, { aliasDivider: "|" })
      .use(remarkDeflist)
      .use(remarkDirective)
      .use(remarkMarkers)
      .use(remarkSupersub) as unknown as Processor<Root, Root, Root, Root, string>;
  }
  return sharedProcessor;
}

export class MdvMarkdownRenderable extends BoxRenderable {
  private _content = "";
  private _conceal = true;
  private _renderNode?: MdvRenderNode;
  /** Public-by-name (matching OpenTUI's `_blockStates`) so `container.ts` can read it. */
  _blockStates: MdvBlockState[] = [];

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
      this.remove(block.renderable.id);
      block.renderable.destroy();
    }
    this._blockStates = [];

    if (!this._content || !this._renderNode) return;

    const proc = getProcessor();
    // `runSync` applies transformer plugins (markers, supersub, alert,
    // wiki-link, etc.) on top of the raw `parse` tree. Skipping it leaves
    // ==highlight==, ~sub~, ^sup^, and similar syntaxes as literal text.
    const tree = proc.runSync(proc.parse(this._content)) as Root;
    const tokens = mdastRootToTokens(tree);
    const rawSlices = computeRawSlices(this._content, tree);

    const ctx: MdvRenderNodeContext = {
      conceal: this._conceal,
      defaultRender: () => null,
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const renderable = this._renderNode(token, ctx);
      if (!renderable) continue;
      this.add(renderable);
      this._blockStates.push({
        token,
        tokenRaw: rawSlices[i] ?? "",
        renderable,
      });
    }
  }
}

/**
 * Compute the source slice that "belongs to" each top-level mdast block,
 * including trailing whitespace up to the next block. The raw slice is
 * what `container.ts` searches for in the full content to map blocks
 * back to source lines (`fullContent.indexOf(tokenRaw, searchStart)`),
 * and its line count drives cursor positioning, so we extend each block's
 * end offset to the next block's start (or end of content).
 */
function computeRawSlices(content: string, tree: Root): string[] {
  const slices: string[] = [];
  const children = tree.children;
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!;
    const start = node.position?.start.offset ?? 0;
    const end =
      i + 1 < children.length
        ? (children[i + 1]!.position?.start.offset ?? node.position?.end.offset ?? content.length)
        : content.length;
    slices.push(content.slice(start, end));
  }
  return slices;
}
