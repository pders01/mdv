/**
 * CodeAdapter registry and individual adapter behavior.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { createHighlighterInstance, type HighlighterInstance } from "../../highlighting/shiki.js";
import { extractThemeColors } from "../../theme/index.js";
import type { BundledTheme } from "shiki";
import { CodeAdapterRegistry, type CodeAdapter } from "../../server/adapters/index.js";
import { createShikiAdapter } from "../../server/adapters/shiki.js";
import { createMermaidAdapter, MERMAID_BUNDLE_URL } from "../../server/adapters/mermaid.js";
import { renderMarkdown } from "../../server/html.js";

let highlighter: HighlighterInstance;

beforeAll(async () => {
  highlighter = await createHighlighterInstance("github-dark");
  highlighter.colors = extractThemeColors(highlighter.highlighter, "github-dark" as BundledTheme);
});

describe("CodeAdapterRegistry.resolve", () => {
  test("returns the adapter that explicitly claims the language", () => {
    const r = new CodeAdapterRegistry();
    const fallback: CodeAdapter = { langs: ["*"], render: () => "fallback" };
    const ts: CodeAdapter = { langs: ["typescript"], render: () => "typescript" };
    r.register(fallback);
    r.register(ts);
    expect(r.resolve("typescript")?.render("", "typescript")).toBe("typescript");
    expect(r.resolve("python")?.render("", "python")).toBe("fallback");
  });

  test("specific-language match takes precedence regardless of registration order", () => {
    const r = new CodeAdapterRegistry();
    const fallback: CodeAdapter = { langs: ["*"], render: () => "fallback" };
    const mermaid: CodeAdapter = { langs: ["mermaid"], render: () => "mermaid" };
    r.register(fallback);
    r.register(mermaid);
    expect(r.resolve("mermaid")?.render("", "mermaid")).toBe("mermaid");
  });

  test("returns undefined when no adapter is registered", () => {
    const r = new CodeAdapterRegistry();
    expect(r.resolve("typescript")).toBeUndefined();
  });
});

describe("CodeAdapterRegistry asset collection", () => {
  test("collects head and body assets from all adapters", () => {
    const r = new CodeAdapterRegistry();
    r.register({ langs: ["a"], render: () => "", headAssets: "<head-a>", bodyAssets: "<body-a>" });
    r.register({ langs: ["b"], render: () => "", headAssets: "<head-b>" });
    expect(r.collectHeadAssets()).toContain("<head-a>");
    expect(r.collectHeadAssets()).toContain("<head-b>");
    expect(r.collectBodyAssets()).toContain("<body-a>");
    expect(r.collectBodyAssets()).not.toContain("<head-");
  });

  test("merges static-asset maps from adapters", () => {
    const r = new CodeAdapterRegistry();
    r.register({
      langs: ["a"],
      render: () => "",
      staticAssets: { "/_static/a.js": "/tmp/a.js" },
    });
    r.register({
      langs: ["b"],
      render: () => "",
      staticAssets: { "/_static/b.js": "/tmp/b.js" },
    });
    const merged = r.collectStaticAssets();
    expect(merged["/_static/a.js"]).toBe("/tmp/a.js");
    expect(merged["/_static/b.js"]).toBe("/tmp/b.js");
  });
});

describe("MermaidAdapter", () => {
  test("renders mermaid fences as <pre class=\"mermaid\">", () => {
    const r = new CodeAdapterRegistry();
    r.register(createMermaidAdapter({ themeName: "github-dark" }));
    r.register(createShikiAdapter(highlighter));
    const html = renderMarkdown(r, "```mermaid\nflowchart TD\n  A --> B\n```\n");
    expect(html).toContain('<pre class="mermaid">');
    expect(html).toContain("flowchart TD");
    // mermaid adapter wins over shiki for mermaid lang
    expect(html).not.toContain("shiki");
  });

  test("escapes angle brackets in mermaid source", () => {
    const r = new CodeAdapterRegistry();
    r.register(createMermaidAdapter({ themeName: "github-dark" }));
    r.register(createShikiAdapter(highlighter));
    const html = renderMarkdown(r, "```mermaid\nA --> <script>\n```\n");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("body assets reference the local bundle URL, not a CDN", () => {
    const adapter = createMermaidAdapter({ themeName: "github-dark" });
    expect(adapter.bodyAssets).toBeDefined();
    expect(adapter.bodyAssets).toContain(MERMAID_BUNDLE_URL);
    expect(adapter.bodyAssets).not.toContain("cdn.");
    expect(adapter.bodyAssets).not.toContain("https://");
  });

  test("registers the mermaid bundle as a static asset", () => {
    const adapter = createMermaidAdapter({ themeName: "github-dark" });
    expect(adapter.staticAssets).toBeDefined();
    expect(Object.keys(adapter.staticAssets!)).toContain(MERMAID_BUNDLE_URL);
  });

  test("picks dark mermaid theme for dark Shiki themes", () => {
    const dark = createMermaidAdapter({ themeName: "github-dark" });
    expect(dark.bodyAssets).toContain('"dark"');
    const dracula = createMermaidAdapter({ themeName: "dracula" });
    expect(dracula.bodyAssets).toContain('"dark"');
  });

  test("picks default mermaid theme for light Shiki themes", () => {
    const light = createMermaidAdapter({ themeName: "github-light" });
    expect(light.bodyAssets).toContain('"default"');
  });

  test("lazy-loads mermaid only when a page has mermaid blocks", () => {
    const adapter = createMermaidAdapter({ themeName: "github-dark" });
    expect(adapter.bodyAssets).toContain('document.querySelector("pre.mermaid")');
  });

  test("dual mode picks theme from prefers-color-scheme on the client", () => {
    const adapter = createMermaidAdapter({ themeName: "github-dark", dual: true });
    // Loader must defer theme choice to the browser, not bake one in.
    expect(adapter.bodyAssets).toContain('matchMedia("(prefers-color-scheme: dark)")');
    expect(adapter.bodyAssets).toContain('mq.matches ? "dark" : "default"');
    // And re-render on system preference flips so SVGs don't go stale.
    expect(adapter.bodyAssets).toContain('mq.addEventListener("change"');
  });

  test("dual mode does not bake a fixed theme name into the loader", () => {
    const adapter = createMermaidAdapter({ themeName: "github-dark", dual: true });
    // Single-mode bakes `theme: "dark"` / `"default"`. Dual must not.
    expect(adapter.bodyAssets).not.toMatch(/theme:\s*"(dark|default)"/);
  });
});

describe("createShikiAdapter dual mode", () => {
  let dualHl: HighlighterInstance;

  beforeAll(async () => {
    dualHl = await createHighlighterInstance(["github-light", "github-dark"]);
  });

  test("emits both light and dark CSS vars per token in dual mode", () => {
    const adapter = createShikiAdapter(dualHl, {
      dual: { light: "github-light", dark: "github-dark" },
    });
    const html = adapter.render("const x = 1;", "typescript");
    // Shiki marks dual output with these classes.
    expect(html).toContain("shiki-themes");
    expect(html).toContain("github-light");
    expect(html).toContain("github-dark");
    // Each token style block carries both vars.
    expect(html).toContain("--shiki-light:");
    expect(html).toContain("--shiki-dark:");
    // No fixed color/background-color was inlined as the default — the
    // browser picks via the @media stylesheet.
    expect(html).not.toMatch(/style="[^"]*\bcolor:\s*#/);
  });

  test("single-mode (no opts) keeps inline colors, no dual vars", () => {
    const adapter = createShikiAdapter(highlighter);
    const html = adapter.render("const x = 1;", "typescript");
    expect(html).not.toContain("--shiki-light");
    expect(html).not.toContain("--shiki-dark");
    expect(html).toMatch(/style="[^"]*color:#/);
  });
});

describe("Skipping mermaid (--no-mermaid)", () => {
  test("with only shiki registered, mermaid fences fall through to shiki", () => {
    const r = new CodeAdapterRegistry();
    r.register(createShikiAdapter(highlighter));
    const html = renderMarkdown(r, "```mermaid\nflowchart TD\n  A --> B\n```\n");
    // No mermaid pre; shiki produces a plain pre because mermaid isn't a
    // Shiki-known language
    expect(html).not.toContain('class="mermaid"');
    expect(html).toContain("flowchart TD");
  });
});
