/**
 * Blockquote rendering
 */

import { BoxRenderable, TextRenderable, TextAttributes, type CliRenderer } from "@opentui/core";
import type { Token } from "marked";
import type { ThemeColors, RenderBlock } from "../types.js";

/**
 * Token with optional text content (for recursive extraction)
 */
interface ContentToken extends Token {
  tokens?: ContentToken[];
  text?: string;
  raw?: string;
}

/**
 * Extract text from blockquote tokens recursively
 */
export function extractBlockquoteText(token: ContentToken): string {
  if (token.text) return token.text;
  if (!token.tokens) return token.raw || "";

  return token.tokens
    .map((t) => {
      if (t.type === "paragraph" || t.type === "text") {
        return t.text || t.raw || "";
      }
      if (t.type === "blockquote") {
        return "> " + extractBlockquoteText(t);
      }
      return extractBlockquoteText(t);
    })
    .join("\n")
    .trim();
}

/**
 * Convert a blockquote token to a RenderBlock (pure function, no OpenTUI dependency)
 */
export function blockquoteToBlock(colors: ThemeColors, token: ContentToken): RenderBlock {
  const textContent = extractBlockquoteText(token);

  return {
    type: "blockquote",
    lines: [
      [
        { text: "\u2502 ", fg: colors.purple, bold: false, italic: false },
        { text: textContent, fg: colors.gray, bold: false, italic: true },
      ],
    ],
    indent: 0,
    marginTop: 1,
    marginBottom: 1,
  };
}

/**
 * Render blockquote with proper styling
 */
export function renderBlockquote(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: ContentToken,
): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    marginTop: 1,
    marginBottom: 1,
    paddingLeft: 2,
  });

  // Add quote bar
  const contentBox = new BoxRenderable(renderer, {
    flexDirection: "row",
  });

  // Extract text from blockquote tokens
  const textContent = extractBlockquoteText(token);

  const quoteBar = new TextRenderable(renderer, {
    content: "\u2502 ",
    fg: colors.purple,
  });

  const quoteText = new TextRenderable(renderer, {
    content: textContent,
    fg: colors.gray,
    attributes: TextAttributes.ITALIC,
  });

  contentBox.add(quoteBar);
  contentBox.add(quoteText);
  wrapper.add(contentBox);

  return wrapper;
}
