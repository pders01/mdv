/**
 * List rendering with nesting support
 */

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
} from "@opentui/core";
import type { Token } from "marked";
import type { ThemeColors, ListToken, ParagraphToken } from "../types.js";
import { convertInlineToken } from "./text.js";

/**
 * Render inline tokens (for list items, etc.)
 */
export function renderInlineTokens(
  renderer: CliRenderer,
  colors: ThemeColors,
  tokens: Token[]
): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    flexDirection: "row",
    flexWrap: "wrap",
  });

  for (const token of tokens) {
    const result = convertInlineToken(token, colors);
    if (!result) continue;

    const { segment, urlSegment } = result;
    let attrs = 0;
    if (segment.bold) attrs |= TextAttributes.BOLD;
    if (segment.italic) attrs |= TextAttributes.ITALIC;

    row.add(new TextRenderable(renderer, {
      content: segment.text,
      fg: segment.fg,
      attributes: attrs || undefined,
    }));

    if (urlSegment) {
      row.add(new TextRenderable(renderer, {
        content: urlSegment.text,
        fg: urlSegment.fg,
      }));
    }
  }

  return row;
}

/**
 * Render list with proper indentation for nested lists
 */
export function renderList(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: ListToken,
  depth: number = 0
): BoxRenderable {
  const wrapper = new BoxRenderable(renderer, {
    flexDirection: "column",
    marginTop: depth === 0 ? 1 : 0,
    marginBottom: depth === 0 ? 1 : 0,
  });

  const indent = "  ".repeat(depth);
  const marker = token.ordered ? "1." : "\u2022";

  token.items.forEach((item, index) => {
    const itemWrapper = new BoxRenderable(renderer, {
      flexDirection: "column",
    });

    let nestedList: ListToken | null = null;
    let paragraphToken: Token | null = null;

    if (item.tokens) {
      for (const t of item.tokens) {
        if (t.type === "paragraph" || t.type === "text") {
          paragraphToken = t;
        } else if (t.type === "list") {
          nestedList = t as ListToken;
        }
      }
    }

    // Render the list item line
    const lineWrapper = new BoxRenderable(renderer, {
      flexDirection: "row",
    });

    const bulletText = token.ordered ? `${index + 1}.` : marker;

    lineWrapper.add(new TextRenderable(renderer, {
      content: indent + bulletText + " ",
      fg: colors.cyan,
    }));

    // Render inline content with proper token handling
    const paraTokens = (paragraphToken as ParagraphToken | null)?.tokens;
    if (paraTokens) {
      const inlineContent = renderInlineTokens(renderer, colors, paraTokens);
      lineWrapper.add(inlineContent);
    } else {
      // Fallback to plain text
      const itemText = item.text?.split("\n")[0] || "";
      lineWrapper.add(new TextRenderable(renderer, {
        content: itemText,
        fg: colors.fg,
      }));
    }

    itemWrapper.add(lineWrapper);

    // Render nested list if present
    if (nestedList) {
      const nestedRendered = renderList(renderer, colors, nestedList, depth + 1);
      itemWrapper.add(nestedRendered);
    }

    wrapper.add(itemWrapper);
  });

  return wrapper;
}
