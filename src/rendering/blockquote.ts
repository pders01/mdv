/**
 * Blockquote rendering
 */

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
} from "@opentui/core";
import type { Token } from "marked";
import type { ThemeColors } from "../types.js";

/**
 * Extract text from blockquote tokens recursively
 */
export function extractBlockquoteText(
  token: Token & { tokens?: Token[]; text?: string; raw?: string }
): string {
  if (token.text) return token.text;
  if (!token.tokens) return token.raw || "";

  return token.tokens.map(t => {
    if (t.type === "paragraph" || t.type === "text") {
      return (t as any).text || (t as any).raw || "";
    }
    if (t.type === "blockquote") {
      return "> " + extractBlockquoteText(t as any);
    }
    return extractBlockquoteText(t as any);
  }).join("\n").trim();
}

/**
 * Render blockquote with proper styling
 */
export function renderBlockquote(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: Token & { tokens?: Token[] }
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
