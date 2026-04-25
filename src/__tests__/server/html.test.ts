/**
 * Server-side HTML rendering smoke tests.
 *
 * These exercise the marked + Shiki pipeline directly, without booting
 * Bun.serve. The server route layer is thin (just template fill-in and path
 * resolution), so verifying renderMarkdown covers the bulk of the logic.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { createHighlighterInstance, type HighlighterInstance } from "../../highlighting/shiki.js";
import { extractThemeColors } from "../../theme/index.js";
import type { BundledTheme } from "shiki";
import { renderMarkdown } from "../../server/html.js";
import { renderSidebar } from "../../server/sidebar.js";
import { themeColorsToCss } from "../../server/theme-vars.js";
import { CodeAdapterRegistry } from "../../server/adapters/index.js";
import { createShikiAdapter } from "../../server/adapters/shiki.js";
import type { FileTree } from "../../fs/tree.js";

let highlighter: HighlighterInstance;
let registry: CodeAdapterRegistry;

beforeAll(async () => {
  highlighter = await createHighlighterInstance("github-dark");
  highlighter.colors = extractThemeColors(highlighter.highlighter, "github-dark" as BundledTheme);
  registry = new CodeAdapterRegistry();
  registry.register(createShikiAdapter(highlighter));
});

describe("renderMarkdown", () => {
  test("renders headings and paragraphs", () => {
    const html = renderMarkdown(registry, "# Title\n\nHello world.\n");
    expect(html).toContain("<h1");
    expect(html).toContain("Title");
    expect(html).toContain("<p>Hello world.</p>");
  });

  test("hands fenced code blocks to Shiki", () => {
    const md = "```ts\nconst x: number = 1;\n```\n";
    const html = renderMarkdown(registry, md);
    expect(html).toContain("shiki");
    // Shiki emits inline color styles on tokens
    expect(html).toMatch(/<span style="color:/);
  });

  test("falls back to plain pre on unknown language", () => {
    const md = "```nope\nfoo\n```\n";
    const html = renderMarkdown(registry, md);
    expect(html).toContain("<pre");
    expect(html).toContain("foo");
  });

  test("escapes HTML in code blocks", () => {
    const md = "```\n<script>alert(1)</script>\n```\n";
    const html = renderMarkdown(registry, md);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("renders inline code", () => {
    const html = renderMarkdown(registry, "Use `npm install`.");
    expect(html).toContain("<code>npm install</code>");
  });

  test("renders tables", () => {
    const md = "| A | B |\n|---|---|\n| 1 | 2 |\n";
    const html = renderMarkdown(registry, md);
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
  });
});

describe("renderSidebar", () => {
  const tree: FileTree = {
    rootDir: "/tmp/docs",
    entries: [
      { path: "/tmp/docs/README.md", relativePath: "README.md", depth: 0 },
      { path: "/tmp/docs/guide/intro.md", relativePath: "guide/intro.md", depth: 1 },
    ],
  };

  test("emits one entry per file", () => {
    const html = renderSidebar(tree, null);
    const entries = html.match(/class="mdv-sidebar__entry"/g) ?? [];
    expect(entries.length).toBe(2);
  });

  test("marks the active entry", () => {
    const html = renderSidebar(tree, "guide/intro.md");
    expect(html).toContain('aria-current="page"');
    // Active mark is on the right entry
    const activeMatch = html.match(/data-path="([^"]+)"[^>]*aria-current="page"/);
    expect(activeMatch?.[1]).toBe("guide/intro.md");
  });

  test("encodes path segments in href", () => {
    const t: FileTree = {
      rootDir: "/tmp",
      entries: [{ path: "/tmp/spaces in name.md", relativePath: "spaces in name.md", depth: 0 }],
    };
    const html = renderSidebar(t, null);
    expect(html).toContain("/spaces%20in%20name.md");
  });

  test("escapes attribute values", () => {
    const t: FileTree = {
      rootDir: "/tmp",
      entries: [{ path: '/tmp/a"b.md', relativePath: 'a"b.md', depth: 0 }],
    };
    const html = renderSidebar(t, null);
    expect(html).not.toMatch(/data-path="a"b\.md"/);
  });
});

describe("themeColorsToCss", () => {
  test("emits :root with all variables", () => {
    const css = themeColorsToCss({
      fg: "#fff",
      bg: "#000",
      link: "#0af",
      red: "#f00",
      orange: "#fa0",
      yellow: "#ff0",
      green: "#0f0",
      cyan: "#0ff",
      blue: "#00f",
      purple: "#a0f",
      gray: "#888",
      codeBg: "#111",
    });
    expect(css).toContain(":root {");
    expect(css).toContain("--mdv-fg: #fff");
    expect(css).toContain("--mdv-code-bg: #111");
    expect(css).toMatch(/}\s*$/);
  });
});
