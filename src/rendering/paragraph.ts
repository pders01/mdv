/**
 * Paragraph rendering with inline HTML support
 */

import {
  BoxRenderable,
  TextRenderable,
  TextAttributes,
  type CliRenderer,
} from "@opentui/core";
import type { ThemeColors, ParagraphToken, InlineHtmlState, StyledSegment, HtmlToken, TextToken, EscapeToken } from "../types.js";
import { decodeHtmlEntities, toSubscript, toSuperscript, convertInlineToken } from "./text.js";

/**
 * Render paragraph with inline HTML support
 */
export function renderParagraph(
  renderer: CliRenderer,
  colors: ThemeColors,
  token: ParagraphToken
): BoxRenderable | null {
  if (!token.tokens) return null;

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

      // Parse HTML tag
      const tagMatch = html.match(/^<(\/?)([\w-]+)(?:\s[^>]*)?>(.*)$/s);
      if (tagMatch) {
        const isClosing = tagMatch[1] === "/";
        const tag = tagMatch[2].toLowerCase();
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
              state.linkHref = hrefMatch ? hrefMatch[1] : null;
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
      // Use shared inline token converter for other token types
      const result = convertInlineToken(t, colors);
      if (result) {
        segments.push(result.segment);
        if (result.urlSegment) {
          segments.push(result.urlSegment);
        }
      }
    }
  }

  if (segments.length === 0) return null;

  const wrapper = new BoxRenderable(renderer, {
    marginBottom: 1,
  });

  // Render each segment as a separate TextRenderable
  const textRow = new BoxRenderable(renderer, {
    flexDirection: "row",
    flexWrap: "wrap",
  });

  for (const seg of segments) {
    let attrs = 0;
    if (seg.bold) attrs |= TextAttributes.BOLD;
    if (seg.italic) attrs |= TextAttributes.ITALIC;

    textRow.add(new TextRenderable(renderer, {
      content: seg.text,
      fg: seg.fg,
      attributes: attrs || undefined,
    }));
  }

  wrapper.add(textRow);
  return wrapper;
}
