/**
 * Markdown → HTML rendering for `mdv serve`.
 *
 * Built on the unified / remark / rehype pipeline:
 *
 *   markdown
 *     → remark-parse           (mdast tree)
 *     → remark-gfm             (tables, task lists, strikethrough, autolinks)
 *     → remark-rehype          (mdast → hast, with custom code handler)
 *     → rehype-stringify       (hast → HTML, raw nodes pass through)
 *
 * The custom `code` handler is where `CodeAdapterRegistry` plugs in. Each
 * fenced code block routes to the adapter that claims its language (Shiki
 * by default, mermaid for `mermaid` blocks). Adapters return ready-to-emit
 * HTML, which we wrap in a `raw` hast node — `rehype-stringify` with
 * `allowDangerousHtml` writes those out verbatim. Skipping `rehype-raw`
 * (would re-parse them into the tree) preserves CommonMark's "raw HTML
 * passes through unchanged" rule for both code-adapter output and the
 * markdown's own HTML blocks.
 *
 * Migrated from `marked` in 2026-05 — see commit history for the rationale
 * (CommonMark conformance jumped 96.8% → 99.1%, plugin ecosystem unlocked).
 */

import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkAlert from "remark-github-blockquote-alert";
import remarkMath from "remark-math";
import wikiLink from "remark-wiki-link";
import remarkDeflist from "remark-deflist";
import remarkDirective from "remark-directive";
import remarkMarkers from "remark-flexible-markers";
import remarkSupersub from "remark-supersub";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import type { Code } from "mdast";
import type { CodeAdapterRegistry } from "./adapters/index.js";
import { escapeHtml } from "../util/escape.js";

type MarkdownProcessor = Processor<undefined, undefined, undefined, undefined, string>;

export function createMarkdown(registry: CodeAdapterRegistry): MarkdownProcessor {
  return (
    unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ["yaml", "toml"])
      // singleTilde:false reserves `~text~` for remark-supersub (subscript)
      // — GFM strikethrough still works as `~~text~~`.
      .use(remarkGfm, { singleTilde: false })
      .use(remarkMath)
      .use(wikiLink, { aliasDivider: "|" })
      .use(remarkDeflist)
      .use(remarkDirective)
      .use(remarkMarkers)
      .use(remarkSupersub)
      .use(remarkAlert)
      .use(remarkRehype, {
        allowDangerousHtml: true,
        handlers: {
          code(_state, node: Code) {
            const lang = (node.lang ?? "").trim();
            const adapter = registry.resolve(lang);
            const html = adapter
              ? adapter.render(node.value, lang)
              : `<pre><code>${escapeHtml(node.value)}</code></pre>`;
            return { type: "raw", value: html };
          },
        },
      })
      .use(rehypeKatex)
      .use(rehypeStringify, {
        allowDangerousHtml: true,
        // Conventional HTML output uses named refs (`&lt;`, `&gt;`, `&amp;`).
        // Default hex refs (`&#x3C;`) are equivalent to browsers but break
        // toContain-style assertions that expect the readable form.
        characterReferences: { useNamedReferences: true },
      }) as MarkdownProcessor
  );
}

export function renderMarkdown(registry: CodeAdapterRegistry, source: string): string {
  const result = createMarkdown(registry).processSync(source);
  return collapseRuns(String(result));
}

/**
 * `mdast-util-gfm-table` inserts a whitespace text node between every row
 * and cell, which `rehype-stringify` faithfully emits as a newline each.
 * The result is 10+ blank lines preceding every `<table>`. Browsers don't
 * care, but the output is unreadable for diffing and snapshot reviews.
 * Collapsing runs of 3+ newlines to 2 is HTML-equivalent (block-level
 * whitespace is collapsed by the rendering engine) and keeps snapshots
 * stable across remark-gfm internal changes.
 */
function collapseRuns(html: string): string {
  return html.replace(/\n{3,}/g, "\n\n");
}
