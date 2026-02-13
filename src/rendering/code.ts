/**
 * Code block rendering with Shiki syntax highlighting
 *
 * Note: Code block backgrounds are drawn at the container level (container.ts)
 * using _blockStates for accurate scroll-aware positioning.
 */

import { BoxRenderable, TextRenderable, StyledText, RGBA, type CliRenderer } from "@opentui/core";
import type { Token } from "marked";
import type { ThemeColors, TextChunk, StyledSegment, RenderBlock } from "../types.js";
import { shikiToChunks, resolveLanguage, type HighlighterInstance } from "../highlighting/shiki.js";

/**
 * Code token type
 */
interface CodeToken extends Token {
  text: string;
  lang?: string;
}

/**
 * Convert a code token to a RenderBlock (pure function, no OpenTUI dependency)
 * When highlighterInstance is provided, uses Shiki for syntax highlighting.
 * Otherwise, produces plain text segments.
 */
export function codeToBlock(
  colors: ThemeColors,
  token: CodeToken,
  highlighterInstance?: HighlighterInstance,
): RenderBlock {
  const lang = token.lang ? resolveLanguage(token.lang) : "";

  let segments: StyledSegment[];

  if (lang && highlighterInstance) {
    const chunks = shikiToChunks(highlighterInstance, token.text, lang);
    segments = chunks.map((chunk) => ({
      text: chunk.text,
      fg: chunk.fg ? `#${chunk.fg.r.toString(16).padStart(2, "0")}${chunk.fg.g.toString(16).padStart(2, "0")}${chunk.fg.b.toString(16).padStart(2, "0")}` : colors.fg,
      bold: chunk.bold || false,
      italic: chunk.italic || false,
    }));
  } else {
    segments = [{ text: token.text, fg: colors.fg, bold: false, italic: false }];
  }

  // Split segments into lines at \n boundaries
  const lines: StyledSegment[][] = [[]];
  for (const seg of segments) {
    if (seg.text === "\n") {
      lines.push([]);
    } else {
      lines[lines.length - 1].push(seg);
    }
  }

  return {
    type: "code",
    lines,
    indent: 0,
    marginTop: 1,
    marginBottom: 1,
  };
}

/**
 * Render code block with Shiki syntax highlighting
 */
export function renderCodeBlock(
  renderer: CliRenderer,
  colors: ThemeColors,
  highlighterInstance: HighlighterInstance,
  token: CodeToken,
): BoxRenderable {
  const lang = token.lang ? resolveLanguage(token.lang) : "";

  // Create chunks with syntax highlighting
  const chunks: TextChunk[] = lang
    ? shikiToChunks(highlighterInstance, token.text, lang)
    : [{ __isChunk: true, text: token.text, fg: RGBA.fromHex(colors.fg) }];

  const styledText = new StyledText(chunks as any);

  const codeText = new TextRenderable(renderer, {
    content: styledText,
  });

  // Wrapper provides padding/margins; background is drawn by container.ts
  const wrapper = new BoxRenderable(renderer, {
    padding: 1,
    marginTop: 1,
    marginBottom: 1,
  });

  wrapper.add(codeText);

  return wrapper;
}
