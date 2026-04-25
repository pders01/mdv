/**
 * Markdown → HTML rendering for `mdv serve`.
 *
 * Marked parses the source; the `code` renderer hook delegates fenced blocks
 * to a CodeAdapterRegistry. The default Shiki adapter handles syntax
 * highlighting; specific-language adapters (mermaid, etc.) take precedence
 * for their claimed languages.
 */

import { Marked } from "marked";
import type { CodeAdapterRegistry } from "./adapters/index.js";
import { escapeHtml } from "../util/escape.js";
import { createMarkedOptions } from "../util/markdown.js";

export function createMarkdown(registry: CodeAdapterRegistry): Marked {
  const m = new Marked(createMarkedOptions());

  m.use({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const language = (lang ?? "").trim();
        const adapter = registry.resolve(language);
        if (adapter) return adapter.render(text, language);
        // No adapter at all — extremely unlikely if a default is registered,
        // but keep a safe escape so the page still renders.
        return `<pre><code>${escapeHtml(text)}</code></pre>`;
      },
    },
  });

  return m;
}

export function renderMarkdown(registry: CodeAdapterRegistry, source: string): string {
  return createMarkdown(registry).parse(source) as string;
}
