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
 * Languages supported for syntax highlighting. Used to filter content
 * scanning so unknown fence labels (`text`, `output`, `console`, …) skip
 * the load round-trip and render as plain.
 *
 * Languages are loaded lazily by `loadLangsForContent` based on what the
 * rendered content actually uses; eager loading the whole set added
 * ~150 ms to cold-open even on files with no code blocks.
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

const SHIKI_LANGS_SET: ReadonlySet<string> = new Set(shikiLangs);

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
 *
 * `theme` is the primary theme — used for `codeToTokens` (TUI) and as the
 * single-theme HTML target. `themes` lists every theme actually loaded so
 * dual-theme HTML rendering can verify both names are available.
 */
export interface HighlighterInstance {
  highlighter: Highlighter;
  theme: string;
  themes: string[];
  colors: ThemeColors | undefined;
}

/**
 * Create a Shiki highlighter instance.
 *
 * Pass an array to load multiple themes at once — the first is the primary
 * (used by the TUI chunk converter and `shikiToHtml`); the rest are
 * available to `shikiToHtmlDual` for `prefers-color-scheme` rendering.
 *
 * No languages are pre-loaded — call `loadLangsForContent` (or
 * `highlighter.loadLanguage` directly) before rendering. Cold-open creates
 * the highlighter in ~5 ms instead of the ~150 ms an eager load took.
 */
export async function createHighlighterInstance(
  theme: string | string[],
): Promise<HighlighterInstance> {
  const themes = Array.isArray(theme) ? theme : [theme];
  const highlighter = await createHighlighter({
    themes: themes as BundledTheme[],
    langs: [],
  });

  return { highlighter, theme: themes[0]!, themes, colors: undefined };
}

/**
 * Scan markdown content for fenced code-block languages. Returns canonical
 * (alias-resolved) names that are in the supported set. Cheap regex pass —
 * no marked.lex dependency, so safe to call before MarkdownRenderable
 * construction without paying the parse cost twice.
 */
const FENCE_LANG_RE = /^[ \t]*(?:```|~~~)[ \t]*([A-Za-z0-9_+-]+)/gm;

export function detectFenceLangs(content: string): string[] {
  const found = new Set<string>();
  for (const m of content.matchAll(FENCE_LANG_RE)) {
    const raw = m[1];
    if (!raw) continue;
    const resolved = resolveLanguage(raw);
    if (SHIKI_LANGS_SET.has(resolved)) found.add(resolved);
  }
  return [...found];
}

/**
 * Load any languages referenced by `content` that the highlighter does not
 * already have. No-op when every fence lang is already loaded — important
 * for the reload path, which must stay cheap when the file shape is stable.
 */
export async function loadLangsForContent(
  instance: HighlighterInstance,
  content: string,
): Promise<void> {
  const langs = detectFenceLangs(content);
  if (langs.length === 0) return;
  const loaded = new Set(instance.highlighter.getLoadedLanguages());
  const missing = langs.filter((l) => !loaded.has(l));
  if (missing.length === 0) return;
  await instance.highlighter.loadLanguage(...(missing as BundledLanguage[]));
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

/**
 * Render a code block with both light and dark themes inlined as CSS vars.
 *
 * Output uses `--shiki-light` and `--shiki-dark` custom properties; the page
 * stylesheet picks one based on `prefers-color-scheme`. `defaultColor: false`
 * disables Shiki's default-theme injection so neither variant wins until the
 * stylesheet decides — that's what lets the browser drive the swap without
 * a server roundtrip.
 */
export function shikiToHtmlDual(
  instance: HighlighterInstance,
  code: string,
  lang: string,
  themes: { light: string; dark: string },
): string {
  const { highlighter } = instance;
  const resolved = resolveLanguage(lang);
  const supportedLangs = highlighter.getLoadedLanguages();

  if (!resolved || !supportedLangs.includes(resolved as BundledLanguage)) {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }

  try {
    return highlighter.codeToHtml(code, {
      lang: resolved as BundledLanguage,
      themes,
      defaultColor: false,
    });
  } catch {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }
}
