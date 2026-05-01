/**
 * Main renderNode dispatcher
 * Combines all rendering modules into a single callback
 */

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
  type Renderable,
} from "@opentui/core";
import type { MdvRenderNodeContext } from "../ui/markdown.js";
import type { Token } from "marked";
import type { ThemeColors, ListToken, TableToken, ParagraphToken } from "../types.js";

interface HeadingToken {
  type: "heading";
  depth: number;
  text: string;
}
import type { HighlighterInstance } from "../highlighting/shiki.js";
import { renderCodeBlock } from "./code.js";
import { renderHorizontalRule, renderHtmlBlock } from "./html.js";
import { renderBlockquote } from "./blockquote.js";
import { renderList } from "./list.js";
import { renderTable } from "./table.js";
import { renderParagraph } from "./paragraph.js";

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
  contentWidth?: number,
  mermaidRenders?: Map<string, string>,
): RenderNodeCallback {
  // Heading colors by depth (h1 = most prominent, h6 = subtlest)
  const headingColors = [
    colors.red, // h1
    colors.orange, // h2
    colors.yellow, // h3
    colors.green, // h4
    colors.cyan, // h5
    colors.blue, // h6
  ];

  return (token: Token, _context: MdvRenderNodeContext): BoxRenderable | null => {
    // Handle headings (OpenTUI 0.1.86+ no longer renders these by default
    // when a renderNode callback is provided)
    if (token.type === "heading") {
      const heading = token as HeadingToken;
      const wrapper = new BoxRenderable(renderer, {
        marginTop: heading.depth <= 2 ? 2 : 1,
        marginBottom: 1,
      });
      const color = headingColors[Math.min(heading.depth - 1, headingColors.length - 1)];
      const prefix = heading.depth <= 2 ? "" : "#".repeat(heading.depth) + " ";
      wrapper.add(
        new TextRenderable(renderer, {
          content: prefix + heading.text,
          fg: color,
          attributes: TextAttributes.BOLD,
        }),
      );
      return wrapper;
    }

    // Handle code blocks with shiki highlighting
    if (token.type === "code") {
      const codeToken = token as Token & { text: string; lang?: string };
      // Mermaid interception: substitute pre-rendered ASCII when available.
      // Strip the lang so the replacement renders as plain text rather than
      // attempting (and failing) to highlight ASCII art as source code.
      // wrapMode "none" keeps box-drawing characters intact — overflowing
      // diagrams clip at the right edge instead of fragmenting line-by-line.
      if (codeToken.lang === "mermaid" && mermaidRenders?.has(codeToken.text)) {
        return renderCodeBlock(
          renderer,
          colors,
          highlighterInstance,
          {
            ...codeToken,
            text: mermaidRenders.get(codeToken.text)!,
            lang: "",
          },
          "none",
        );
      }
      return renderCodeBlock(renderer, colors, highlighterInstance, codeToken);
    }

    // Handle horizontal rules
    if (token.type === "hr") {
      return renderHorizontalRule(renderer, colors);
    }

    // Handle blockquotes
    if (token.type === "blockquote") {
      return renderBlockquote(renderer, colors, token as Token & { tokens?: Token[] });
    }

    // Handle lists with proper indentation
    if (token.type === "list") {
      return renderList(renderer, colors, token as ListToken);
    }

    // Handle tables
    if (token.type === "table") {
      return renderTable(renderer, colors, token as TableToken, contentWidth);
    }

    // Handle paragraphs explicitly. OpenTUI's fallback path doesn't apply
    // concealment for inline markers when a renderNode callback is provided
    // (same phenomenon as headings in 0.1.86+), so if we leave this to the
    // default, `**bold**` and `` `code` `` show up with their markers intact.
    // Taking over via renderParagraph → paragraphToSegments → convertInlineToken
    // applies the correct styling for strong/em/codespan/link/del and hides
    // the surrounding syntax characters.
    if (token.type === "paragraph") {
      const para = token as ParagraphToken;
      if (para.tokens && para.tokens.length > 0) {
        const rendered = renderParagraph(renderer, colors, para);
        if (rendered) return rendered;
      }
    }

    // Handle HTML blocks
    if (token.type === "html") {
      const htmlToken = token as Token & { raw: string; block?: boolean };
      const html = htmlToken.raw;

      // Block-level HTML
      if (htmlToken.block) {
        const rendered = renderHtmlBlock(renderer, colors, html);
        if (rendered) return rendered;
        return new BoxRenderable(renderer, {});
      }

      // Inline HTML - return null to let paragraph handler deal with it
      return null;
    }

    // Hide link definitions (they should not be displayed)
    if (token.type === "def") {
      return new BoxRenderable(renderer, {}); // Empty, hidden
    }

    return null;
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
