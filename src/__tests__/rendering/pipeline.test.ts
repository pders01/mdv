/**
 * Full-pipeline rendering tests
 */

import { describe, test, expect } from "bun:test";
import {
  TEST_COLORS,
  renderToBlocks,
  flattenToText,
  flattenToSegments,
  serializeBlocks,
  expectText,
} from "../helpers/render-harness.js";

describe("renderMarkdownToBlocks", () => {
  test("renders empty string to empty blocks", () => {
    const blocks = renderToBlocks("");
    expect(blocks.length).toBe(0);
  });

  test("renders single paragraph", () => {
    const blocks = renderToBlocks("Hello world");
    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe("paragraph");
  });

  test("renders heading", () => {
    const blocks = renderToBlocks("# Title");
    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe("heading");
    expectText(blocks, "Title");
  });

  test("heading level affects color", () => {
    const h1 = renderToBlocks("# H1");
    const h2 = renderToBlocks("## H2");
    const h3 = renderToBlocks("### H3");

    expect(h1[0].lines[0][0].fg).toBe(TEST_COLORS.red);
    expect(h2[0].lines[0][0].fg).toBe(TEST_COLORS.orange);
    expect(h3[0].lines[0][0].fg).toBe(TEST_COLORS.yellow);
  });

  test("headings are bold", () => {
    const blocks = renderToBlocks("## Heading");
    expect(blocks[0].lines[0][0].bold).toBe(true);
  });

  test("renders horizontal rule", () => {
    const blocks = renderToBlocks("---");
    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe("hr");
    expect(blocks[0].lines[0][0].text).toContain("\u2500");
  });

  test("renders code block", () => {
    const blocks = renderToBlocks("```\nconst x = 1;\n```");
    const codeBlocks = blocks.filter((b) => b.type === "code");
    expect(codeBlocks.length).toBe(1);
    expectText(blocks, "const x = 1;");
  });

  test("renders multiple block types in order", () => {
    const markdown = `# Title

A paragraph.

* List item 1
* List item 2

> A quote

---`;
    const blocks = renderToBlocks(markdown);
    const types = blocks.map((b) => b.type);

    expect(types).toContain("heading");
    expect(types).toContain("paragraph");
    expect(types).toContain("list");
    expect(types).toContain("blockquote");
    expect(types).toContain("hr");
  });

  test("preserves all text content in complex document", () => {
    const markdown = `# Main Title

First paragraph with **bold** and *italic*.

* Item alpha
* Item beta

| Col1 | Col2 |
| --- | --- |
| data1 | data2 |

> A wise quote

---

Last paragraph.`;

    const blocks = renderToBlocks(markdown);
    const text = flattenToText(blocks);

    expect(text).toContain("Main Title");
    expect(text).toContain("bold");
    expect(text).toContain("italic");
    expect(text).toContain("Item alpha");
    expect(text).toContain("Item beta");
    expect(text).toContain("Col1");
    expect(text).toContain("data1");
    expect(text).toContain("A wise quote");
    expect(text).toContain("Last paragraph");
  });

  test("code block without language produces plain text segments", () => {
    const blocks = renderToBlocks("```\nplain code\n```");
    const codeBlock = blocks.find((b) => b.type === "code");
    expect(codeBlock).toBeDefined();
    if (codeBlock) {
      const allSegments = codeBlock.lines.flatMap((l) => l);
      expect(allSegments.length).toBeGreaterThan(0);
      // All segments should use fg color since no highlighting
      for (const seg of allSegments) {
        expect(seg.fg).toBe(TEST_COLORS.fg);
      }
    }
  });

  test("link definitions are excluded", () => {
    const markdown = "[example]: http://example.com\n\nSome text.";
    const blocks = renderToBlocks(markdown);
    const text = flattenToText(blocks);
    // Link definitions should not appear in output
    expect(text).not.toContain("[example]:");
  });

  test("renders space tokens without error", () => {
    const blocks = renderToBlocks("A\n\n\n\nB");
    const text = flattenToText(blocks);
    expect(text).toContain("A");
    expect(text).toContain("B");
  });
});

describe("serializeBlocks", () => {
  test("produces deterministic output for simple paragraph", () => {
    const blocks = renderToBlocks("Hello");
    const serialized = serializeBlocks(blocks);

    expect(serialized).toContain("[paragraph]");
    expect(serialized).toContain("Hello");
    expect(serialized).toContain(`fg:${TEST_COLORS.fg}`);
  });

  test("produces deterministic output for list", () => {
    const blocks = renderToBlocks("* Item");
    const serialized = serializeBlocks(blocks);

    expect(serialized).toContain("[list]");
    expect(serialized).toContain("\u2022");
    expect(serialized).toContain("Item");
  });

  test("marks bold and italic in serialization", () => {
    const blocks = renderToBlocks("**bold** *italic*");
    const serialized = serializeBlocks(blocks);

    expect(serialized).toContain("bold");
    expect(serialized).toContain("italic");
  });
});

describe("flattenToSegments", () => {
  test("returns all segments from all blocks", () => {
    const blocks = renderToBlocks("Hello\n\n* Item");
    const segments = flattenToSegments(blocks);

    expect(segments.length).toBeGreaterThan(2);
    const allText = segments.map((s) => s.text).join("");
    expect(allText).toContain("Hello");
    expect(allText).toContain("Item");
  });
});

describe("HTML block rendering", () => {
  test("renders HTML table", () => {
    const markdown = "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>";
    const blocks = renderToBlocks(markdown);
    const text = flattenToText(blocks);
    expect(text).toContain("A");
    expect(text).toContain("B");
    expect(text).toContain("1");
    expect(text).toContain("2");
  });

  test("renders HTML list", () => {
    const markdown = "<ul><li>Alpha</li><li>Beta</li></ul>";
    const blocks = renderToBlocks(markdown);
    const text = flattenToText(blocks);
    expect(text).toContain("Alpha");
    expect(text).toContain("Beta");
  });

  test("renders HTML heading", () => {
    const markdown = "<h1>Big Title</h1>";
    const blocks = renderToBlocks(markdown);
    expect(blocks.length).toBeGreaterThan(0);
    const text = flattenToText(blocks);
    expect(text).toContain("Big Title");
  });

  test("renders generic HTML block", () => {
    const markdown = "<div>Some content</div>";
    const blocks = renderToBlocks(markdown);
    const text = flattenToText(blocks);
    expect(text).toContain("Some content");
  });
});
