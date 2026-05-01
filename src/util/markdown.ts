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
import { decodeHTML } from "entities";

/**
 * Parser options used everywhere mdv invokes marked. Centralized so the
 * TUI's `marked.lexer()` calls and the server's `new Marked(...)` instance
 * can't disagree on `gfm` / `breaks` / future flags.
 *
 * `walkTokens` decodes HTML named/numeric entity references in places the
 * CommonMark spec requires (text, link/image href + title, code lang).
 * Marked v15 preserves entity refs verbatim in the token stream, so the TUI
 * would otherwise render `&copy;` literally and the server would emit
 * unprocessed entities — tightening this here closes ~12 spec failures
 * across the Entity, Link, and Fenced-code sections.
 */
export function createMarkedOptions(): MarkedOptions {
  return {
    gfm: true,
    breaks: false,
    walkTokens: decodeEntitiesInToken,
  };
}

/**
 * In-place entity decode for token fields where CommonMark says entity
 * references are recognized. Skipped for code spans / code blocks — the
 * spec preserves them as literal characters there.
 */
function decodeEntitiesInToken(token: Token): void {
  switch (token.type) {
    case "text":
    case "escape": {
      const t = token as Token & { text?: string };
      if (typeof t.text === "string") t.text = decodeHTML(t.text);
      return;
    }
    case "link":
    case "image": {
      const t = token as Token & { href?: string; title?: string | null };
      if (typeof t.href === "string") t.href = decodeHTML(t.href);
      if (typeof t.title === "string") t.title = decodeHTML(t.title);
      return;
    }
    case "code": {
      const t = token as Token & { lang?: string };
      if (typeof t.lang === "string") t.lang = decodeHTML(t.lang);
      return;
    }
    default:
      return;
  }
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
