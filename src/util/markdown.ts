/**
 * Shared markdown helpers used by both TUI and server modes.
 *
 * Today this is just two primitives:
 *   - `createMarkedOptions()` — the parser flags both modes use, so they
 *     can't drift on `gfm`, `breaks`, etc. without it being visible.
 *   - `walkCodeFences()` — yields every fenced code block in a document,
 *     recursing through nested tokens (list items, blockquotes). Used by
 *     the TUI mermaid pre-pass; ready for any future pre-pass (math,
 *     plantuml, server-side SVG) that needs the same traversal.
 */

import { marked, type MarkedOptions, type Token } from "marked";

/**
 * Parser options used everywhere mdv invokes marked. Centralized so the
 * TUI's `marked.lexer()` calls and the server's `new Marked(...)` instance
 * can't disagree on `gfm` / `breaks` / future flags.
 *
 * Today this matches marked v15 defaults; the explicit object documents
 * intent and makes drift visible in code review.
 */
export function createMarkedOptions(): MarkedOptions {
  return {
    gfm: true,
    breaks: false,
  };
}

export interface CodeBlock {
  /** Fence language tag (e.g. "ts", "mermaid"). Empty string when none specified. */
  lang: string;
  /** Raw source between the fence markers. */
  text: string;
}

/**
 * Walk every fenced code block in `content`, invoking `callback` for each
 * one. Recurses into nested tokens — code blocks inside lists, blockquotes,
 * and similar containers are visited too.
 *
 * Order is depth-first source order, which is what callers building
 * caches keyed by content (the TUI mermaid pre-pass) want.
 */
export function walkCodeFences(content: string, callback: (block: CodeBlock) => void): void {
  const tokens = marked.lexer(content, createMarkedOptions());
  walkTokens(tokens, callback);
}

function walkTokens(tokens: Token[], cb: (block: CodeBlock) => void): void {
  for (const t of tokens) {
    if (t.type === "code") {
      const code = t as Token & { lang?: string; text: string };
      cb({ lang: code.lang ?? "", text: code.text });
    }
    const nested = (t as Token & { tokens?: Token[] }).tokens;
    if (Array.isArray(nested)) walkTokens(nested, cb);
    const items = (t as Token & { items?: Token[] }).items;
    if (Array.isArray(items)) walkTokens(items, cb);
  }
}
