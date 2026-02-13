/**
 * Full-pipeline markdown-to-IR conversion
 * Converts markdown text into RenderBlock[] for testing without OpenTUI
 */

import { lexer, type Token } from "marked";
import type { ThemeColors, RenderBlock, ListToken, TableToken, ParagraphToken, HtmlToken } from "../types.js";
import type { HighlighterInstance } from "../highlighting/shiki.js";
import { paragraphToBlock, paragraphToSegments } from "./paragraph.js";
import { listToBlocks } from "./list.js";
import { tableToBlock } from "./table.js";
import { blockquoteToBlock } from "./blockquote.js";
import { codeToBlock } from "./code.js";
import { htmlBlockToBlocks, hrToBlock } from "./html.js";


/**
 * Convert a single token to RenderBlock(s)
 */
function tokenToBlocks(
  token: Token,
  colors: ThemeColors,
  highlighterInstance?: HighlighterInstance,
): RenderBlock[] {
  if (token.type === "code") {
    return [codeToBlock(colors, token as Token & { text: string; lang?: string }, highlighterInstance)];
  }

  if (token.type === "hr") {
    return [hrToBlock(colors)];
  }

  if (token.type === "blockquote") {
    return [blockquoteToBlock(colors, token as Token & { tokens?: Token[] })];
  }

  if (token.type === "list") {
    return listToBlocks(colors, token as ListToken);
  }

  if (token.type === "table") {
    return [tableToBlock(colors, token as TableToken)];
  }

  if (token.type === "paragraph") {
    const para = token as ParagraphToken;
    // Mirror createRenderNode: only use paragraphToBlock for paragraphs
    // with inline HTML, escapes, or links. Otherwise fall through to
    // default inline rendering.
    const hasInlineHtml = para.tokens?.some((t) => t.type === "html" && !(t as HtmlToken).block);
    const hasEscapes = para.tokens?.some((t) => t.type === "escape");
    const hasLinks = para.tokens?.some((t) => t.type === "link");
    if (hasInlineHtml || hasEscapes || hasLinks) {
      const block = paragraphToBlock(colors, para);
      if (block) return [block];
    }

    // Default paragraph rendering via inline tokens
    if (para.tokens) {
      const segments = paragraphToSegments(colors, para);
      if (segments.length > 0) {
        return [
          {
            type: "paragraph",
            lines: [segments],
            indent: 0,
            marginTop: 0,
            marginBottom: 1,
          },
        ];
      }
    }

    return [];
  }

  if (token.type === "heading") {
    const heading = token as Token & { text: string; depth: number };
    const headingColors = [
      colors.red,
      colors.orange,
      colors.yellow,
      colors.green,
      colors.cyan,
      colors.purple,
    ];
    const level = heading.depth || 1;
    return [
      {
        type: "heading",
        lines: [
          [
            {
              text: heading.text,
              fg: headingColors[level - 1] || colors.blue,
              bold: true,
              italic: false,
            },
          ],
        ],
        indent: 0,
        marginTop: level === 1 ? 1 : 0,
        marginBottom: 1,
      },
    ];
  }

  if (token.type === "html") {
    const htmlToken = token as Token & { raw: string; block?: boolean };
    if (htmlToken.block) {
      return htmlBlockToBlocks(colors, htmlToken.raw);
    }
    return [];
  }

  if (token.type === "space") {
    return [];
  }

  if (token.type === "def") {
    return [];
  }

  return [];
}

/**
 * Convert markdown text to an array of RenderBlocks (full pipeline)
 */
export function renderMarkdownToBlocks(
  markdown: string,
  colors: ThemeColors,
  highlighterInstance?: HighlighterInstance,
): RenderBlock[] {
  const tokens = lexer(markdown);
  const blocks: RenderBlock[] = [];

  for (const token of tokens) {
    blocks.push(...tokenToBlocks(token, colors, highlighterInstance));
  }

  return blocks;
}
