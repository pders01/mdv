/**
 * Main renderNode dispatcher
 * Combines all rendering modules into a single callback
 */

import { BoxRenderable, TextRenderable, TextAttributes, type CliRenderer } from "@opentui/core";
import type { Token } from "marked";
import type { ThemeColors, ListToken, TableToken, ParagraphToken, HtmlToken } from "../types.js";

interface HeadingToken extends Token {
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
 * RenderNode callback type (matches MarkdownRenderable's expected signature)
 */
export type RenderNodeCallback = (token: Token, context: { depth: number }) => BoxRenderable | null;

/**
 * Create a renderNode callback with all rendering capabilities
 */
export function createRenderNode(
  renderer: CliRenderer,
  colors: ThemeColors,
  highlighterInstance: HighlighterInstance,
  contentWidth?: number,
): RenderNodeCallback {
  // Heading colors by depth (h1 = most prominent, h6 = subtlest)
  const headingColors = [
    colors.red,    // h1
    colors.orange, // h2
    colors.yellow, // h3
    colors.green,  // h4
    colors.cyan,   // h5
    colors.blue,   // h6
  ];

  return (token: Token, _context: { depth: number }): BoxRenderable | null => {
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
      return renderCodeBlock(
        renderer,
        colors,
        highlighterInstance,
        token as Token & { text: string; lang?: string },
      );
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

    // Handle paragraphs with inline HTML or escape sequences
    if (token.type === "paragraph") {
      const para = token as ParagraphToken;
      // Check if paragraph contains inline HTML, escape tokens, or links
      const hasInlineHtml = para.tokens?.some((t) => t.type === "html" && !(t as HtmlToken).block);
      const hasEscapes = para.tokens?.some((t) => t.type === "escape");
      const hasLinks = para.tokens?.some((t) => t.type === "link");
      if (hasInlineHtml || hasEscapes || hasLinks) {
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
