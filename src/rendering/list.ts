/**
 * List rendering with nesting support
 */

import { RGBA } from "@opentui/core";
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
import type { BoxSpec, Spec } from "../render/spec.js";

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
 * Build a pure Spec for a list. One child BoxSpec per item (column-flex
 * so a nested sub-list stacks under its parent item). Each item carries a
 * TextSpec for the bullet + inline content; nested lists recurse.
 *
 * The Spec carries no source-line info today \u2014 that requires the parser
 * to emit per-item source positions, which mdv currently reconstructs
 * post-hoc via `tokenRaw.indexOf`. When the dispatcher port lands, the
 * source positions will flow in from the same place and we can populate
 * `SourceSpan` here instead of leaving it null.
 */
export function listToSpec(colors: ThemeColors, token: ListToken, depth: number = 0): BoxSpec {
  const indent = "  ".repeat(depth);
  const marker = token.ordered ? "1." : "\u2022";

  const itemSpecs: BoxSpec[] = token.items.map((item, index) => {
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

    const bulletText = token.ordered ? `${index + 1}.` : marker;
    const chunks: TextChunk[] = [
      { __isChunk: true, text: indent + bulletText + " ", fg: RGBA.fromHex(colors.cyan) },
    ];

    let hasContent = false;
    for (const pt of paragraphTokens) {
      const paraTokens = (pt as ParagraphToken)?.tokens;
      if (paraTokens) {
        const segments = inlineTokensToSegments(colors, paraTokens);
        chunks.push(...segmentsToChunks(segments));
        hasContent = true;
      }
    }
    if (!hasContent) {
      const itemText = item.text?.split("\n")[0] || "";
      chunks.push({ __isChunk: true, text: itemText, fg: RGBA.fromHex(colors.fg) });
    }

    const children: Spec[] = [{ kind: "text", chunks, source: null }];
    if (nestedList) children.push(listToSpec(colors, nestedList, depth + 1));

    return {
      kind: "box",
      flexDirection: "column",
      source: null,
      children,
    };
  });

  return {
    kind: "box",
    ...(depth === 0 ? { block: "list" as const } : {}),
    flexDirection: "column",
    marginTop: depth === 0 ? 1 : 0,
    marginBottom: depth === 0 ? 1 : 0,
    source: null,
    children: itemSpecs,
  };
}
