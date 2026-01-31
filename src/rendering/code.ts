/**
 * Code block rendering with Shiki syntax highlighting
 *
 * Note: Code block backgrounds are drawn at the container level (container.ts)
 * using _blockStates for accurate scroll-aware positioning.
 */

import {
  BoxRenderable,
  TextRenderable,
  StyledText,
  RGBA,
  type CliRenderer,
} from "@opentui/core";
import type { Token } from "marked";
import type { ThemeColors, TextChunk } from "../types.js";
import {
  shikiToChunks,
  resolveLanguage,
  type HighlighterInstance,
} from "../highlighting/shiki.js";

/**
 * Code token type
 */
interface CodeToken extends Token {
  text: string;
  lang?: string;
}

/**
 * Render code block with Shiki syntax highlighting
 */
export function renderCodeBlock(
  renderer: CliRenderer,
  colors: ThemeColors,
  highlighterInstance: HighlighterInstance,
  token: CodeToken
): BoxRenderable {
  const lang = token.lang
    ? resolveLanguage(token.lang)
    : "";

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
