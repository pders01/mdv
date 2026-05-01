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
    walkTokens: normalizeToken,
  };
}

/**
 * Per-token spec-conformance fixups applied bottom-up by `walkTokens`.
 *
 * 1. Decode HTML named/numeric entity refs in fields the spec recognizes
 *    (text, link/image href + title, code lang). Marked preserves entities
 *    verbatim in the token stream, so without this the TUI prints `&copy;`
 *    literally and HTML output emits unprocessed refs.
 * 2. Strip continuation-line whitespace from paragraphs. Spec §6.9
 *    collapses indentation on lines 2..N of a paragraph; marked preserves
 *    it. Scoped to direct text children of paragraph/heading so code spans,
 *    fences, and link-label inner text aren't disturbed.
 */
function normalizeToken(token: Token): void {
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
    case "paragraph":
    case "heading": {
      const t = token as Token & { tokens?: Token[] };
      if (!Array.isArray(t.tokens)) return;
      // Strip leading whitespace only on the first child (line 1 indent).
      // Strip continuation-line whitespace (`\n   foo` → `\n foo`-style) on
      // every child — it's safe regardless of position because the source
      // newline is intrinsic to the text fragment, not inter-token spacing.
      let first = true;
      for (const child of t.tokens) {
        if (child.type !== "text") {
          first = false;
          continue;
        }
        const ct = child as Token & { text?: string };
        if (typeof ct.text === "string") {
          ct.text = stripContinuationIndent(ct.text, first);
        }
        first = false;
      }
      return;
    }
    default:
      return;
  }
}

/**
 * CommonMark §6.9: line 1 indentation and continuation-line indentation
 * are non-significant in paragraphs. Marked preserves both literally.
 *
 * `stripLeading` controls whether the very start of the fragment is also
 * trimmed. Only set for the first inline child of a block — interior text
 * tokens (those following an em/strong/code-span sibling) need their
 * leading space preserved as the inter-token separator.
 */
function stripContinuationIndent(text: string, stripLeading: boolean): string {
  let out = text;
  if (stripLeading) out = out.replace(/^[ \t]+/, "");
  return out.replace(/[ \t]*\n[ \t]+/g, "\n");
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
