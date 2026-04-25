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
import { escapeHtml } from "../util/escape.js";

// =============================================================================
// Configuration
// =============================================================================

/**
 * Supported languages for syntax highlighting
 */
export const shikiLangs: BundledLanguage[] = [
  "typescript",
  "javascript",
  "python",
  "json",
  "bash",
  "html",
  "css",
  "yaml",
  "markdown",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "ruby",
  "php",
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
 * Highlighter instance holder for module-level access.
 *
 * `colors` is filled in by the caller after construction, by passing the
 * highlighter through `extractThemeColors`. It's `undefined` until then —
 * Shiki's own highlighting paths (codeToHtml, codeToTokens) don't need it,
 * only the TUI chunk converter does.
 */
export interface HighlighterInstance {
  highlighter: Highlighter;
  theme: string;
  colors: ThemeColors | undefined;
}

/**
 * Create a Shiki highlighter instance.
 */
export async function createHighlighterInstance(theme: string): Promise<HighlighterInstance> {
  const highlighter = await createHighlighter({
    themes: [theme as BundledTheme],
    langs: shikiLangs,
  });

  return { highlighter, theme, colors: undefined };
}

// =============================================================================
// Token Conversion
// =============================================================================

/**
 * Cache for RGBA color objects to avoid repeated parsing
 */
const colorCache = new Map<string, ReturnType<typeof RGBA.fromHex>>();

/**
 * Get cached RGBA color from hex string
 */
function getCachedColor(hex: string): ReturnType<typeof RGBA.fromHex> {
  let color = colorCache.get(hex);
  if (!color) {
    color = RGBA.fromHex(hex);
    colorCache.set(hex, color);
  }
  return color;
}

/**
 * Convert Shiki tokens to OpenTUI TextChunks
 */
export function shikiToChunks(
  instance: HighlighterInstance,
  code: string,
  lang: string,
): TextChunk[] {
  const { highlighter, theme, colors } = instance;
  const supportedLangs = highlighter.getLoadedLanguages();
  // Caller (TUI) always populates colors via extractThemeColors before
  // chunking — fall back to Shiki's default light fg if it ever doesn't.
  const fallbackFg = colors?.fg ?? "#E1E4E8";

  if (!supportedLangs.includes(lang as BundledLanguage)) {
    return [{ __isChunk: true, text: code, fg: getCachedColor(fallbackFg) }];
  }

  try {
    const result = highlighter.codeToTokens(code, {
      lang: lang as BundledLanguage,
      theme: theme as BundledTheme,
    });

    const chunks: TextChunk[] = [];
    for (let i = 0; i < result.tokens.length; i++) {
      const line = result.tokens[i]!;
      for (const token of line) {
        const chunk: TextChunk = {
          __isChunk: true,
          text: token.content,
          fg: getCachedColor(token.color || "#E1E4E8"),
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
  } catch (error) {
    // Log error in debug mode to aid troubleshooting
    if (process.env.DEBUG) {
      console.error(`Syntax highlighting failed for language '${lang}':`, error);
    }
    return [{ __isChunk: true, text: code, fg: getCachedColor(fallbackFg) }];
  }
}

/**
 * Resolve language alias to canonical name
 */
export function resolveLanguage(lang: string): string {
  const normalized = lang.toLowerCase();
  return langAliases[normalized] || normalized;
}

/**
 * Render a code block to themed HTML using the same highlighter the TUI uses.
 * Falls back to a plain <pre><code> on unsupported language or highlighter
 * error so the server route never 500s on a bad fence.
 */
export function shikiToHtml(instance: HighlighterInstance, code: string, lang: string): string {
  const { highlighter, theme } = instance;
  const resolved = resolveLanguage(lang);
  const supportedLangs = highlighter.getLoadedLanguages();

  if (!resolved || !supportedLangs.includes(resolved as BundledLanguage)) {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }

  try {
    return highlighter.codeToHtml(code, { lang: resolved as BundledLanguage, theme });
  } catch {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }
}
