/**
 * Paragraph rendering with inline HTML support
 */

import { BoxRenderable, TextRenderable, StyledText, RGBA, type CliRenderer } from "@opentui/core";
import type { Token } from "marked";
import type {
  ThemeColors,
  TextChunk,
  ParagraphToken,
  InlineHtmlState,
  StyledSegment,
  RenderBlock,
  HtmlToken,
  TextToken,
  EscapeToken,
} from "../types.js";
import { decodeHtmlEntities, toSubscript, toSuperscript, convertInlineToken } from "./text.js";

/**
 * Extract styled segments from a paragraph token (pure function, no OpenTUI dependency)
 */
export function paragraphToSegments(colors: ThemeColors, token: ParagraphToken): StyledSegment[] {
  if (!token.tokens) return [];

  const segments: StyledSegment[] = [];
  const state: InlineHtmlState = {
    bold: false,
    italic: false,
    code: false,
    subscript: false,
    superscript: false,
    strikethrough: false,
    underline: false,
    highlight: false,
    kbd: false,
    link: false,
    linkHref: null,
  };

  const addSegment = (text: string) => {
    if (!text) return;

    // Decode HTML entities
    let processedText = decodeHtmlEntities(text);

    // Apply subscript/superscript
    if (state.subscript) {
      processedText = toSubscript(processedText);
    } else if (state.superscript) {
      processedText = toSuperscript(processedText);
    }

    // Determine color
    let fg = colors.fg;
    if (state.link) {
      fg = colors.link;
    } else if (state.code || state.kbd) {
      fg = colors.cyan;
    } else if (state.strikethrough) {
      fg = colors.gray;
    } else if (state.highlight) {
      fg = colors.yellow;
    } else if (state.underline) {
      fg = colors.green;
    }

    segments.push({
      text: processedText,
      fg: fg,
      bold: state.bold,
      italic: state.italic,
    });
  };

  for (const t of token.tokens) {
    if (t.type === "html") {
      const htmlToken = t as HtmlToken;
      const html = htmlToken.raw || "";

      // Parse HTML tag.
      // Regex has 3 capture groups so tagMatch[1..3] are all defined on match.
      const tagMatch = html.match(/^<(\/?)([\w-]+)(?:\s[^>]*)?>(.*)$/s);
      if (tagMatch) {
        const isClosing = tagMatch[1] === "/";
        const tag = tagMatch[2]!.toLowerCase();
        const content = tagMatch[3] || "";

        // Handle self-closing tags
        if (tag === "br") {
          segments.push({ text: "\n", fg: colors.fg, bold: false, italic: false });
          continue;
        }
        if (tag === "img") {
          const altMatch = html.match(/alt=["']([^"']*)["']/);
          const alt = altMatch ? altMatch[1] : "[image]";
          segments.push({ text: `[${alt}]`, fg: colors.gray, bold: false, italic: false });
          continue;
        }

        // Update state based on tag
        switch (tag) {
          case "strong":
          case "b":
            state.bold = !isClosing;
            break;
          case "em":
          case "i":
            state.italic = !isClosing;
            break;
          case "code":
          case "samp":
            state.code = !isClosing;
            break;
          case "sub":
            state.subscript = !isClosing;
            break;
          case "sup":
            state.superscript = !isClosing;
            break;
          case "del":
          case "s":
          case "strike":
            state.strikethrough = !isClosing;
            break;
          case "ins":
          case "u":
            state.underline = !isClosing;
            break;
          case "mark":
            state.highlight = !isClosing;
            break;
          case "kbd":
            state.kbd = !isClosing;
            break;
          case "a":
            if (!isClosing) {
              // Opening tag - extract href
              const hrefMatch = html.match(/href=["']([^"']*)["']/);
              state.linkHref = hrefMatch ? (hrefMatch[1] ?? null) : null;
              state.link = true;
            } else {
              // Closing tag - append URL in parentheses if we have one
              if (state.linkHref) {
                segments.push({
                  text: " (" + state.linkHref + ")",
                  fg: colors.gray,
                  bold: false,
                  italic: false,
                });
              }
              state.link = false;
              state.linkHref = null;
            }
            break;
          case "abbr":
          case "dfn":
            // Just show the text, no special styling needed
            break;
        }

        if (content.trim()) {
          addSegment(content);
        }
      }
      continue;
    }

    // Handle text and escape tokens through addSegment to apply inline HTML state
    if (t.type === "text" || t.type === "escape") {
      const textToken = t as TextToken | EscapeToken;
      addSegment(textToken.text || "");
    } else {
      // Recursively walk inline tokens so nested styling (e.g. a codespan
      // inside a strong block) is preserved. convertInlineToken only looks
      // at t.text for strong/em/del, which would leak raw markdown markers
      // for any inline children; the walker below delegates leaf conversion
      // to convertInlineToken and merges parent styles into each segment.
      emitInline(t, { bold: false, italic: false, strike: false }, segments, colors);
    }
  }

  return segments;
}

/**
 * Recursive inline-token walker. For parent tokens with nested children
 * (strong → {text, codespan, text}), descends and propagates the parent's
 * visual style into each leaf. For leaf tokens, defers to convertInlineToken.
 *
 * `strike` propagates gray color into plain-text leaves. Leaves that already
 * carry a meaningful color (codespan → cyan, link → link color) keep theirs,
 * so `~~\`code\`~~` still renders as code rather than losing the styling.
 */
interface ParentStyle {
  bold: boolean;
  italic: boolean;
  strike: boolean;
}

function emitInline(
  t: Token,
  parentStyle: ParentStyle,
  segments: StyledSegment[],
  colors: ThemeColors,
): void {
  const children = (t as Token & { tokens?: Token[] }).tokens;

  if (t.type === "strong" && children && children.length > 0) {
    for (const child of children) {
      emitInline(child, { ...parentStyle, bold: true }, segments, colors);
    }
    return;
  }
  if (t.type === "em" && children && children.length > 0) {
    for (const child of children) {
      emitInline(child, { ...parentStyle, italic: true }, segments, colors);
    }
    return;
  }
  if (t.type === "del" && children && children.length > 0) {
    for (const child of children) {
      emitInline(child, { ...parentStyle, strike: true }, segments, colors);
    }
    return;
  }

  // Leaf case (or strong/em/del with no nested tokens — fall back to .text)
  const result = convertInlineToken(t, colors);
  if (!result) return;

  // Default-colored text inside a strikethrough block becomes gray.
  // Codespans and links retain their own color — content semantics win
  // over decoration semantics, matching the documented priority order.
  const fg =
    parentStyle.strike && result.segment.fg === colors.fg ? colors.gray : result.segment.fg;

  segments.push({
    ...result.segment,
    fg,
    bold: result.segment.bold || parentStyle.bold,
    italic: result.segment.italic || parentStyle.italic,
  });
  if (result.urlSegment) {
    segments.push(result.urlSegment);
  }
}

/**
 * Convert paragraph segments to a RenderBlock
 */
export function paragraphToBlock(colors: ThemeColors, token: ParagraphToken): RenderBlock | null {
  const segments = paragraphToSegments(colors, token);
  if (segments.length === 0) return null;

  return {
    type: "paragraph",
    lines: [segments],
    indent: 0,
    marginTop: 0,
    marginBottom: 1,
  };
}

/**
 * Render paragraph with inline HTML support
 */
export function renderParagraph(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: ParagraphToken,
): BoxRenderable | null {
  const segments = paragraphToSegments(colors, token);
  if (segments.length === 0) return null;

  const wrapper = new BoxRenderable(renderer, {
    marginBottom: 1,
  });

  const chunks: TextChunk[] = segments.map((seg) => ({
    __isChunk: true,
    text: seg.text,
    fg: seg.fg ? RGBA.fromHex(seg.fg) : undefined,
    bold: seg.bold || undefined,
    italic: seg.italic || undefined,
  }));

  const styledText = new StyledText(chunks as any);
  wrapper.add(new TextRenderable(renderer, { content: styledText }));
  return wrapper;
}
