/**
 * List rendering with nesting support
 */

import { BoxRenderable, TextRenderable, TextAttributes, type CliRenderer } from "@opentui/core";
import type { Token } from "marked";
import type { ThemeColors, ListToken, ParagraphToken, StyledSegment, RenderBlock } from "../types.js";
import { convertInlineToken } from "./text.js";

/**
 * Convert inline tokens to styled segments (pure function, no OpenTUI dependency)
 */
export function inlineTokensToSegments(colors: ThemeColors, tokens: Token[]): StyledSegment[] {
  const segments: StyledSegment[] = [];

  for (const token of tokens) {
    const result = convertInlineToken(token, colors);
    if (!result) continue;

    segments.push(result.segment);
    if (result.urlSegment) {
      segments.push(result.urlSegment);
    }
  }

  return segments;
}

/**
 * Convert a list token to RenderBlocks (pure function, no OpenTUI dependency)
 */
export function listToBlocks(
  colors: ThemeColors,
  token: ListToken,
  depth: number = 0,
): RenderBlock[] {
  const blocks: RenderBlock[] = [];

  token.items.forEach((item, index) => {
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

    const indent = "  ".repeat(depth);
    const bulletText = token.ordered ? `${index + 1}.` : "\u2022";
    const bulletSegment: StyledSegment = {
      text: indent + bulletText + " ",
      fg: colors.cyan,
      bold: false,
      italic: false,
    };

    const paraTokens = (paragraphToken as ParagraphToken | null)?.tokens;
    let contentSegments: StyledSegment[];
    if (paraTokens) {
      contentSegments = inlineTokensToSegments(colors, paraTokens);
    } else {
      const itemText = item.text?.split("\n")[0] || "";
      contentSegments = [{ text: itemText, fg: colors.fg, bold: false, italic: false }];
    }

    blocks.push({
      type: "list",
      lines: [[bulletSegment, ...contentSegments]],
      indent: depth,
      marginTop: depth === 0 && index === 0 ? 1 : 0,
      marginBottom: depth === 0 && index === token.items.length - 1 ? 1 : 0,
    });

    if (nestedList) {
      blocks.push(...listToBlocks(colors, nestedList, depth + 1));
    }
  });

  return blocks;
}

/**
 * Render inline tokens (for list items, etc.)
 */
export function renderInlineTokens(
  renderer: CliRenderer,
  colors: ThemeColors,
  tokens: Token[],
): BoxRenderable {
  const row = new BoxRenderable(renderer, {
    flexDirection: "row",
    flexWrap: "wrap",
  });

  const segments = inlineTokensToSegments(colors, tokens);
  for (const seg of segments) {
    let attrs = 0;
    if (seg.bold) attrs |= TextAttributes.BOLD;
    if (seg.italic) attrs |= TextAttributes.ITALIC;

    row.add(
      new TextRenderable(renderer, {
        content: seg.text,
        fg: seg.fg,
        attributes: attrs || undefined,
      }),
    );
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
  depth: number = 0,
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

    lineWrapper.add(
      new TextRenderable(renderer, {
        content: indent + bulletText + " ",
        fg: colors.cyan,
      }),
    );

    // Render inline content with proper token handling
    const paraTokens = (paragraphToken as ParagraphToken | null)?.tokens;
    if (paraTokens) {
      const inlineContent = renderInlineTokens(renderer, colors, paraTokens);
      lineWrapper.add(inlineContent);
    } else {
      // Fallback to plain text
      const itemText = item.text?.split("\n")[0] || "";
      lineWrapper.add(
        new TextRenderable(renderer, {
          content: itemText,
          fg: colors.fg,
        }),
      );
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
