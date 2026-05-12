/**
 * Main renderNode dispatcher.
 *
 * Builds a pure Spec per token, mounts to a Renderable once at the end.
 * Renderer-specific files (./code.ts, ./list.ts, …) expose `*ToSpec` pure
 * factories; the legacy `render*` adapters survive only as test entry
 * points. Adding a new token kind: add a `*ToSpec`, route to it here.
 */

import { type CliRenderer, type Renderable } from "@opentui/core";
import type { MdvRenderNodeContext } from "../ui/markdown.js";
import type { Token } from "marked";
import type { ThemeColors, ListToken, TableToken, ParagraphToken } from "../types.js";

import type { HighlighterInstance } from "../highlighting/shiki.js";
import { codeBlockToSpec } from "./code.js";
import { hrToSpec } from "./html.js";
import { renderHtmlBlock } from "./html.js";
import { blockquoteToSpec } from "./blockquote.js";
import { listToSpec } from "./list.js";
import { tableToSpec } from "./table.js";
import { paragraphToSpec } from "./paragraph.js";
import { renderDefList } from "./deflist.js";
import { headingToSpec, type HeadingToken } from "./heading.js";
import type { Spec } from "../render/spec.js";
import { mountSpec } from "../render/mount.js";

/**
 * RenderNode callback type — matches MarkdownRenderable's expected signature.
 * Returns `Renderable | null | undefined` to stay compatible with OpenTUI
 * even though this module always returns `BoxRenderable | null` in practice.
 */
export type RenderNodeCallback = (
  token: Token,
  context: MdvRenderNodeContext,
) => Renderable | null | undefined;

/**
 * Create a renderNode callback with all rendering capabilities.
 *
 * `mermaidRenders` is a map from raw mermaid source text to pre-rendered ASCII
 * output (produced by `prerenderMermaid` before the render pass). When a
 * mermaid code block is encountered and has an entry in the map, the ASCII is
 * substituted; otherwise the raw source falls through to the normal code-block
 * path (rendered unhighlighted since "mermaid" isn't a known Shiki language).
 */
export function createRenderNode(
  renderer: CliRenderer,
  colors: ThemeColors,
  highlighterInstance: HighlighterInstance,
  contentWidth: number,
  mermaidRenders?: Map<string, string>,
): RenderNodeCallback {
  // Empty box spec — used to render hidden link definitions and HTML
  // blocks that we don't know how to handle. Mounting still gives the
  // dispatcher a non-null Renderable so block-state indexing stays in
  // sync with the source token stream.
  const emptySpec = (): Spec => ({ kind: "box", source: null, children: [] });

  const toSpec = (token: Token): Spec | null => {
    // Handle headings (OpenTUI 0.1.86+ no longer renders these by default
    // when a renderNode callback is provided)
    if (token.type === "heading") {
      return headingToSpec(colors, token as HeadingToken);
    }

    if (token.type === "code") {
      const codeToken = token as Token & { text: string; lang?: string };
      // Mermaid interception: substitute pre-rendered ASCII when available.
      // Strip the lang so the replacement renders as plain text rather than
      // attempting (and failing) to highlight ASCII art as source code.
      // wrapMode "none" keeps box-drawing characters intact — overflowing
      // diagrams clip at the right edge instead of fragmenting line-by-line.
      if (codeToken.lang === "mermaid" && mermaidRenders?.has(codeToken.text)) {
        return codeBlockToSpec(
          colors,
          highlighterInstance,
          { ...codeToken, text: mermaidRenders.get(codeToken.text)!, lang: "" },
          0,
          "none",
        );
      }
      return codeBlockToSpec(colors, highlighterInstance, codeToken, 0);
    }

    if (token.type === "hr") {
      return hrToSpec(colors, contentWidth);
    }

    if (token.type === "blockquote") {
      return blockquoteToSpec(colors, token as Token & { tokens?: Token[] });
    }

    if (token.type === "list") {
      return listToSpec(colors, token as ListToken);
    }

    if (token.type === "table") {
      return tableToSpec(colors, token as TableToken, contentWidth);
    }

    // Handle paragraphs explicitly. OpenTUI's fallback path doesn't apply
    // concealment for inline markers when a renderNode callback is provided
    // (same phenomenon as headings in 0.1.86+), so if we leave this to the
    // default, `**bold**` and `` `code` `` show up with their markers intact.
    // paragraphToSpec applies the correct inline styling for
    // strong/em/codespan/link/del and hides the surrounding syntax characters.
    if (token.type === "paragraph") {
      const para = token as ParagraphToken;
      if (para.tokens && para.tokens.length > 0) {
        return paragraphToSpec(colors, para);
      }
    }

    if (token.type === "html") {
      const htmlToken = token as Token & { raw: string; block?: boolean };
      if (htmlToken.block) {
        // renderHtmlBlock still returns a Renderable directly — it's the
        // last legacy renderer (covers raw <table>/<ol>/<h2> in source).
        // We surface its output via a leaked spec by mounting null here;
        // the dispatcher handles that case below.
        return null;
      }
      // Inline HTML — let the paragraph handler take over upstream.
      return null;
    }

    return null;
  };

  return (token: Token, _context: MdvRenderNodeContext): Renderable | null => {
    // deflist + raw block HTML are still legacy Renderable-returning
    // paths; route them before the spec path.
    if ((token as Token & { type: string }).type === "deflist") {
      return renderDefList(renderer, colors, token);
    }
    if (token.type === "html") {
      const htmlToken = token as Token & { raw: string; block?: boolean };
      if (htmlToken.block) {
        const rendered = renderHtmlBlock(renderer, colors, htmlToken.raw);
        return rendered ?? mountSpec(renderer, emptySpec());
      }
      return null;
    }
    if (token.type === "def") {
      return mountSpec(renderer, emptySpec());
    }

    const spec = toSpec(token);
    if (!spec) return null;
    return mountSpec(renderer, spec);
  };
}

// Re-export individual renderers for testing
export { renderCodeBlock, codeToBlock } from "./code.js";
export {
  renderHorizontalRule,
  renderHtmlBlock,
  renderHtmlTable,
  renderHtmlList,
  renderHtmlHeading,
  htmlTableToBlock,
  htmlListToBlocks,
  htmlHeadingToBlock,
  htmlBlockToBlocks,
  hrToBlock,
} from "./html.js";
export { renderBlockquote, extractBlockquoteText, blockquoteToBlock } from "./blockquote.js";
export { renderList, renderInlineTokens, listToBlocks, inlineTokensToSegments } from "./list.js";
export { renderTable, tableToBlock } from "./table.js";
export { renderParagraph, paragraphToSegments, paragraphToBlock } from "./paragraph.js";
export { decodeHtmlEntities, toSubscript, toSuperscript } from "./text.js";
export { renderMarkdownToBlocks } from "./segments.js";
