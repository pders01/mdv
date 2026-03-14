/**
 * List rendering with nesting support
 */

import { BoxRenderable, TextRenderable, StyledText, RGBA, type CliRenderer } from "@opentui/core";
import type { Token } from "marked";
import type {
  ThemeColors,
  TextChunk,
  ListToken,
  ParagraphToken,
  StyledSegment,
  RenderBlock,
} from "../types.js";
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
    const paragraphTokens: Token[] = [];

    if (item.tokens) {
      for (const t of item.tokens) {
        if (t.type === "paragraph" || t.type === "text") {
          paragraphTokens.push(t);
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

    let contentSegments: StyledSegment[] = [];
    if (paragraphTokens.length > 0) {
      for (let i = 0; i < paragraphTokens.length; i++) {
        const paraTokens = (paragraphTokens[i] as ParagraphToken)?.tokens;
        if (paraTokens) {
          if (i > 0) {
            contentSegments.push({ text: " ", fg: colors.fg, bold: false, italic: false });
          }
          contentSegments.push(...inlineTokensToSegments(colors, paraTokens));
        }
      }
    }
    if (contentSegments.length === 0) {
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
 * Convert styled segments to TextChunks for use with StyledText
 */
function segmentsToChunks(segments: StyledSegment[]): TextChunk[] {
  return segments.map((seg) => ({
    __isChunk: true,
    text: seg.text,
    fg: seg.fg ? RGBA.fromHex(seg.fg) : undefined,
    bold: seg.bold || undefined,
    italic: seg.italic || undefined,
  }));
}

/**
 * Render inline tokens (for list items, etc.)
 */
export function renderInlineTokens(
  renderer: CliRenderer,
  colors: ThemeColors,
  tokens: Token[],
): TextRenderable {
  const segments = inlineTokensToSegments(colors, tokens);
  const chunks = segmentsToChunks(segments);
  const styledText = new StyledText(chunks as any);

  return new TextRenderable(renderer, {
    content: styledText,
  });
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
    const paragraphTokens: Token[] = [];

    if (item.tokens) {
      for (const t of item.tokens) {
        if (t.type === "paragraph" || t.type === "text") {
          paragraphTokens.push(t);
        } else if (t.type === "list") {
          nestedList = t as ListToken;
        }
      }
    }

    // Build all chunks for this list item (bullet + content) as a single StyledText
    const bulletText = token.ordered ? `${index + 1}.` : marker;
    const allChunks: TextChunk[] = [
      { __isChunk: true, text: indent + bulletText + " ", fg: RGBA.fromHex(colors.cyan) },
    ];

    let hasContent = false;
    for (const pt of paragraphTokens) {
      const paraTokens = (pt as ParagraphToken)?.tokens;
      if (paraTokens) {
        const segments = inlineTokensToSegments(colors, paraTokens);
        allChunks.push(...segmentsToChunks(segments));
        hasContent = true;
      }
    }
    if (!hasContent) {
      const itemText = item.text?.split("\n")[0] || "";
      allChunks.push({ __isChunk: true, text: itemText, fg: RGBA.fromHex(colors.fg) });
    }

    const styledText = new StyledText(allChunks as any);
    itemWrapper.add(new TextRenderable(renderer, { content: styledText }));

    // Render nested list if present
    if (nestedList) {
      const nestedRendered = renderList(renderer, colors, nestedList, depth + 1);
      itemWrapper.add(nestedRendered);
    }

    wrapper.add(itemWrapper);
  });

  return wrapper;
}
