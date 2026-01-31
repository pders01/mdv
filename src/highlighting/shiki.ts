/**
 * Shiki syntax highlighter setup and token conversion
 */

import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  type BundledTheme,
} from "shiki";
import { RGBA } from "@opentui/core";
import type { TextChunk, ThemeColors } from "../types.js";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Supported languages for syntax highlighting
 */
export const shikiLangs: BundledLanguage[] = [
  "typescript", "javascript", "python", "json", "bash", "html", "css",
  "yaml", "markdown", "rust", "go", "java", "c", "cpp", "ruby", "php",
];

/**
 * Language aliases for common shorthand names
 */
export const langAliases: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  yml: "yaml",
};

// =============================================================================
// Highlighter Instance
// =============================================================================

/**
 * Highlighter instance holder for module-level access
 */
export interface HighlighterInstance {
  highlighter: Highlighter;
  theme: string;
  colors: ThemeColors;
}

/**
 * Create a Shiki highlighter instance
 */
export async function createHighlighterInstance(
  theme: string,
  colors: ThemeColors
): Promise<HighlighterInstance> {
  const highlighter = await createHighlighter({
    themes: [theme as BundledTheme],
    langs: shikiLangs,
  });

  return { highlighter, theme, colors };
}

// =============================================================================
// Token Conversion
// =============================================================================

/**
 * Convert Shiki tokens to OpenTUI TextChunks
 */
export function shikiToChunks(
  instance: HighlighterInstance,
  code: string,
  lang: string
): TextChunk[] {
  const { highlighter, theme, colors } = instance;
  const supportedLangs = highlighter.getLoadedLanguages();

  if (!supportedLangs.includes(lang as BundledLanguage)) {
    return [{ __isChunk: true, text: code, fg: RGBA.fromHex(colors.fg) }];
  }

  try {
    const result = highlighter.codeToTokens(code, {
      lang: lang as BundledLanguage,
      theme: theme as BundledTheme,
    });

    const chunks: TextChunk[] = [];
    for (let i = 0; i < result.tokens.length; i++) {
      const line = result.tokens[i];
      for (const token of line) {
        const chunk: TextChunk = {
          __isChunk: true,
          text: token.content,
          fg: RGBA.fromHex(token.color || "#E1E4E8"),
        };
        if (token.fontStyle) {
          if (token.fontStyle & 1) chunk.italic = true;
          if (token.fontStyle & 2) chunk.bold = true;
        }
        chunks.push(chunk);
      }
      if (i < result.tokens.length - 1) {
        chunks.push({ __isChunk: true, text: "\n" });
      }
    }
    return chunks;
  } catch {
    return [{ __isChunk: true, text: code, fg: RGBA.fromHex(colors.fg) }];
  }
}

/**
 * Resolve language alias to canonical name
 */
export function resolveLanguage(lang: string): string {
  const normalized = lang.toLowerCase();
  return langAliases[normalized] || normalized;
}
