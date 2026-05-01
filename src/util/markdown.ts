/**
 * Shared markdown helpers.
 *
 * Today this is just `walkCodeFences()` — yields every fenced code block
 * in a document, recursing through nested tokens (list items,
 * blockquotes). Used by the TUI mermaid pre-pass and ready for any future
 * pre-pass (math, plantuml, server-side SVG) that needs the same
 * traversal.
 */

import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import type { Root } from "mdast";

export interface CodeBlock {
  /** Fence language tag (e.g. "ts", "mermaid"). Empty string when none specified. */
  lang: string;
  /** Raw source between the fence markers. */
  text: string;
}

let sharedProcessor: Processor<Root, Root, Root, Root, string> | null = null;
function getProcessor(): Processor<Root, Root, Root, Root, string> {
  if (!sharedProcessor) {
    sharedProcessor = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml", "toml"])
      .use(remarkGfm, { singleTilde: false }) as unknown as Processor<Root, Root, Root, Root, string>;
  }
  return sharedProcessor;
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
  const proc = getProcessor();
  const tree = proc.runSync(proc.parse(content)) as Root;
  visit(tree as { children?: unknown[] }, callback);
}

function visit(node: { type?: string; children?: unknown[]; lang?: string | null; value?: string }, cb: (block: CodeBlock) => void): void {
  if (node.type === "code") {
    cb({ lang: node.lang ?? "", text: node.value ?? "" });
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      visit(child as { type?: string; children?: unknown[] }, cb);
    }
  }
}
