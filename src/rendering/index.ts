/**
 * Main renderNode dispatcher
 * Combines all rendering modules into a single callback
 */

import { BoxRenderable, type CliRenderer } from "@opentui/core";
import type { Token } from "marked";
import type { ThemeColors, ListToken, TableToken, ParagraphToken } from "../types.js";
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
export type RenderNodeCallback = (
  token: Token,
  context: { depth: number }
) => BoxRenderable | null;

/**
 * Create a renderNode callback with all rendering capabilities
 */
export function createRenderNode(
  renderer: CliRenderer,
  colors: ThemeColors,
  highlighterInstance: HighlighterInstance
): RenderNodeCallback {
  return (token: Token, _context: { depth: number }): BoxRenderable | null => {
    // Handle code blocks with shiki highlighting
    if (token.type === "code") {
      return renderCodeBlock(
        renderer,
        colors,
        highlighterInstance,
        token as Token & { text: string; lang?: string }
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
      return renderTable(renderer, colors, token as TableToken);
    }

    // Handle paragraphs with inline HTML or escape sequences
    if (token.type === "paragraph") {
      const para = token as ParagraphToken;
      // Check if paragraph contains inline HTML, escape tokens, or links
      const hasInlineHtml = para.tokens?.some(t => t.type === "html" && !(t as any).block);
      const hasEscapes = para.tokens?.some(t => t.type === "escape");
      const hasLinks = para.tokens?.some(t => t.type === "link");
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
export { renderCodeBlock } from "./code.js";
export { renderHorizontalRule, renderHtmlBlock, renderHtmlTable, renderHtmlList, renderHtmlHeading } from "./html.js";
export { renderBlockquote, extractBlockquoteText } from "./blockquote.js";
export { renderList, renderInlineTokens } from "./list.js";
export { renderTable } from "./table.js";
export { renderParagraph } from "./paragraph.js";
export { decodeHtmlEntities, toSubscript, toSuperscript } from "./text.js";
