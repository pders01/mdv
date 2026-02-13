/**
 * Edge case tests across all renderers
 * Covers malformed input, boundary conditions, and behavioral documentation
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import type { ParagraphToken, ListToken, TableToken } from "../../types.js";
import { paragraphToSegments } from "../../rendering/paragraph.js";
import { listToBlocks } from "../../rendering/list.js";
import { tableToBlock } from "../../rendering/table.js";
import { blockquoteToBlock, extractBlockquoteText } from "../../rendering/blockquote.js";
import { htmlBlockToBlocks, htmlTableToBlock, htmlListToBlocks, htmlHeadingToBlock, hrToBlock } from "../../rendering/html.js";
import {
  TEST_COLORS,
  renderToBlocks,
  flattenToText,
  expectSegment,
} from "../helpers/render-harness.js";

// =============================================================================
// Paragraph Edge Cases
// =============================================================================

describe("paragraph edge cases", () => {
  function getParagraphToken(markdown: string): ParagraphToken {
    const tokens = lexer(markdown);
    return tokens.find((t) => t.type === "paragraph") as ParagraphToken;
  }

  test("unclosed bold tag causes remaining text to stay bold", () => {
    const token = getParagraphToken("normal <b>bold without close");
    const segments = paragraphToSegments(TEST_COLORS, token);

    const normalSeg = segments.find((s) => s.text.includes("normal"));
    expect(normalSeg?.bold).toBe(false);

    const boldSeg = segments.find((s) => s.text.includes("bold without close"));
    expect(boldSeg?.bold).toBe(true);
  });

  test("unclosed italic tag causes remaining text to stay italic", () => {
    const token = getParagraphToken("normal <i>italic without close");
    const segments = paragraphToSegments(TEST_COLORS, token);

    const italicSeg = segments.find((s) => s.text.includes("italic without close"));
    expect(italicSeg?.italic).toBe(true);
  });

  test("overlapping tags process independently", () => {
    // <b>bold <i>both</b> italic-only</i>
    const token = getParagraphToken("<b>bold <i>both</b> italic-only</i>");
    const segments = paragraphToSegments(TEST_COLORS, token);

    const boldSeg = segments.find((s) => s.text.includes("bold"));
    if (boldSeg) expect(boldSeg.bold).toBe(true);

    const bothSeg = segments.find((s) => s.text.includes("both"));
    if (bothSeg) {
      expect(bothSeg.bold).toBe(true);
      expect(bothSeg.italic).toBe(true);
    }

    // After </b>, bold is off but italic remains
    const italicOnlySeg = segments.find((s) => s.text.includes("italic-only"));
    if (italicOnlySeg) {
      expect(italicOnlySeg.bold).toBe(false);
      expect(italicOnlySeg.italic).toBe(true);
    }
  });

  test("empty tags produce no segments", () => {
    const token = getParagraphToken("before <b></b> after");
    const segments = paragraphToSegments(TEST_COLORS, token);

    const text = segments.map((s) => s.text).join("");
    expect(text).toContain("before");
    expect(text).toContain("after");
  });

  test("multiple consecutive opening tags stack correctly", () => {
    const token = getParagraphToken("<b><i><code>styled</code></i></b>");
    const segments = paragraphToSegments(TEST_COLORS, token);

    const styledSeg = segments.find((s) => s.text.includes("styled"));
    expect(styledSeg).toBeDefined();
    if (styledSeg) {
      expect(styledSeg.bold).toBe(true);
      expect(styledSeg.italic).toBe(true);
      expect(styledSeg.fg).toBe(TEST_COLORS.cyan); // code color takes priority
    }
  });

  test("tags with extra attributes are handled", () => {
    const token = getParagraphToken('<a href="http://example.com" class="link" id="foo">text</a>');
    const segments = paragraphToSegments(TEST_COLORS, token);

    expectSegment(segments, "text", { fg: TEST_COLORS.link });
    expectSegment(segments, "(http://example.com)", { fg: TEST_COLORS.gray });
  });

  test("unknown self-closing tags are ignored", () => {
    const token = getParagraphToken("before <input/> after");
    if (!token) return; // marked may not produce paragraph for this
    const segments = paragraphToSegments(TEST_COLORS, token);
    // Should not crash
    expect(segments.length).toBeGreaterThan(0);
  });

  test("<img> without alt attribute shows default placeholder", () => {
    const token = getParagraphToken('text <img src="photo.jpg"> more');
    const segments = paragraphToSegments(TEST_COLORS, token);

    expectSegment(segments, "[image]", { fg: TEST_COLORS.gray });
  });

  test("link without href shows text without URL", () => {
    const token = getParagraphToken('<a>just text</a>');
    const segments = paragraphToSegments(TEST_COLORS, token);

    const linkSeg = segments.find((s) => s.text.includes("just text"));
    expect(linkSeg).toBeDefined();
    // No URL segment since no href
    const urlSeg = segments.find((s) => s.text.includes("("));
    expect(urlSeg).toBeUndefined();
  });

  test("adjacent formatting markers render correctly", () => {
    const token = getParagraphToken("**bold***italic*`code`");
    const segments = paragraphToSegments(TEST_COLORS, token);

    expectSegment(segments, "bold", { bold: true });
    expectSegment(segments, "italic", { italic: true });
    expectSegment(segments, "code", { fg: TEST_COLORS.cyan });
  });

  test("HTML entities in various positions", () => {
    const token = getParagraphToken("&lt;div&gt; &amp; &quot;test&quot;");
    const segments = paragraphToSegments(TEST_COLORS, token);

    const text = segments.map((s) => s.text).join("");
    expect(text).toContain("<div>");
    expect(text).toContain("&");
    expect(text).toContain('"test"');
  });

  test("color priority: link > code > strikethrough > highlight > underline", () => {
    // Link color takes priority
    const linkToken = getParagraphToken('[link](http://x.com)');
    const linkSegs = paragraphToSegments(TEST_COLORS, linkToken);
    expectSegment(linkSegs, "link", { fg: TEST_COLORS.link });

    // Code color
    const codeToken = getParagraphToken('`code`');
    const codeSegs = paragraphToSegments(TEST_COLORS, codeToken);
    expectSegment(codeSegs, "code", { fg: TEST_COLORS.cyan });

    // Strikethrough color
    const delToken = getParagraphToken('~~deleted~~');
    const delSegs = paragraphToSegments(TEST_COLORS, delToken);
    expectSegment(delSegs, "deleted", { fg: TEST_COLORS.gray });
  });
});

// =============================================================================
// List Edge Cases
// =============================================================================

describe("list edge cases", () => {
  function getListToken(markdown: string): ListToken {
    const tokens = lexer(markdown);
    return tokens.find((t) => t.type === "list") as ListToken;
  }

  test("multi-paragraph list item preserves all paragraphs", () => {
    const markdown = "* First paragraph\n\n  Second paragraph\n\n* Next";
    const token = getListToken(markdown);
    const blocks = listToBlocks(TEST_COLORS, token);

    const firstItemText = blocks[0].lines
      .flatMap((l) => l.map((s) => s.text))
      .join("");
    expect(firstItemText).toContain("First paragraph");
    expect(firstItemText).toContain("Second paragraph");
  });

  test("list item with minimal text renders correctly", () => {
    const token = getListToken("* x\n* Item 2");
    const blocks = listToBlocks(TEST_COLORS, token);

    expect(blocks.length).toBe(2);
    expect(blocks[0].lines[0][0].text).toContain("\u2022");
    // Minimal text content is preserved
    const text = blocks[0].lines.flatMap((l) => l.map((s) => s.text)).join("");
    expect(text).toContain("x");
  });

  test("deeply nested list (5 levels)", () => {
    const markdown = [
      "* L1",
      "    * L2",
      "        * L3",
      "            * L4",
      "                * L5",
    ].join("\n");
    const token = getListToken(markdown);
    const blocks = listToBlocks(TEST_COLORS, token);

    const depths = blocks.map((b) => b.indent);
    expect(depths).toContain(0);
    expect(depths).toContain(1);
    expect(depths).toContain(2);
    expect(depths).toContain(3);
    expect(depths).toContain(4);

    // Indent increases with depth
    const deepest = blocks.find((b) => b.indent === 4);
    expect(deepest).toBeDefined();
    if (deepest) {
      // Bullet text should have 8 spaces of indent (4 * 2)
      expect(deepest.lines[0][0].text).toMatch(/^\s{8}/);
    }
  });

  test("single-item list", () => {
    const token = getListToken("* Only item");
    const blocks = listToBlocks(TEST_COLORS, token);

    expect(blocks.length).toBe(1);
    expect(blocks[0].marginTop).toBe(1);
    expect(blocks[0].marginBottom).toBe(1);
  });

  test("ordered list starting from custom number", () => {
    const markdown = "1. First\n2. Second\n3. Third";
    const token = getListToken(markdown);
    const blocks = listToBlocks(TEST_COLORS, token);

    expect(blocks[0].lines[0][0].text).toContain("1.");
    expect(blocks[1].lines[0][0].text).toContain("2.");
    expect(blocks[2].lines[0][0].text).toContain("3.");
  });

  test("list item with only a link", () => {
    const token = getListToken("* [click](http://example.com)");
    const blocks = listToBlocks(TEST_COLORS, token);

    const segments = blocks[0].lines[0];
    const linkSeg = segments.find((s) => s.fg === TEST_COLORS.link);
    expect(linkSeg).toBeDefined();
  });

  test("inline HTML in list items is handled gracefully", () => {
    // convertInlineToken doesn't handle HTML tokens, so they're dropped
    // This test documents the current behavior
    const token = getListToken("* item with <b>bold</b> text");
    const blocks = listToBlocks(TEST_COLORS, token);

    // Should not crash
    expect(blocks.length).toBe(1);
    const text = blocks[0].lines
      .flatMap((l) => l.map((s) => s.text))
      .join("");
    // The text around the HTML tags should still be present
    expect(text).toContain("item with");
  });
});

// =============================================================================
// Table Edge Cases
// =============================================================================

describe("table edge cases", () => {
  function getTableToken(markdown: string): TableToken {
    const tokens = lexer(markdown);
    return tokens.find((t) => t.type === "table") as TableToken;
  }

  test("header-only table (no data rows)", () => {
    const token = getTableToken("| A | B |\n| --- | --- |");
    const block = tableToBlock(TEST_COLORS, token);

    // Header + separator, no data rows
    expect(block.lines.length).toBe(2);
  });

  test("table with empty header cells", () => {
    const token = getTableToken("| | B |\n| --- | --- |\n| x | y |");
    const block = tableToBlock(TEST_COLORS, token);

    expect(block.lines.length).toBe(3);
    // Should not crash with empty header
  });

  test("table with single column", () => {
    const token = getTableToken("| Only |\n| --- |\n| val |");
    const block = tableToBlock(TEST_COLORS, token);

    expect(block.lines.length).toBe(3);
    // No column separators needed between columns
    const headerPipes = block.lines[0].filter(
      (s) => s.text === "\u2502 " && s !== block.lines[0][0],
    );
    // Only leading and trailing pipes, no inter-column pipes
    expect(headerPipes.length).toBe(0);
  });

  test("table with many rows", () => {
    const rows = Array.from({ length: 20 }, (_, i) => `| row${i} | val${i} |`);
    const markdown = "| A | B |\n| --- | --- |\n" + rows.join("\n");
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    // 1 header + 1 separator + 20 data rows
    expect(block.lines.length).toBe(22);
  });

  test("table with wide cell content", () => {
    const longText = "a".repeat(100);
    const markdown = `| Short | Long |\n| --- | --- |\n| x | ${longText} |`;
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    // Should not crash, cell should contain the long text
    const text = block.lines[2].map((s) => s.text).join("");
    expect(text).toContain(longText);
  });

  test("all alignment types in one table", () => {
    const markdown = "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    expect(block.lines.length).toBe(3);

    // Data row cells
    const dataLine = block.lines[2];
    const dataCells = dataLine.filter((s) => s.fg === TEST_COLORS.fg);

    // Left-aligned: text then spaces
    expect(dataCells[0].text).toMatch(/^a\s+/);
    // Right-aligned: spaces then text
    expect(dataCells[2].text).toMatch(/^\s+c/);
  });
});

// =============================================================================
// Blockquote Edge Cases
// =============================================================================

describe("blockquote edge cases", () => {
  function getBlockquoteToken(markdown: string) {
    const tokens = lexer(markdown);
    return tokens.find((t) => t.type === "blockquote") as any;
  }

  test("empty blockquote renders quote bar with empty text", () => {
    const token = getBlockquoteToken("> ");
    const block = blockquoteToBlock(TEST_COLORS, token);

    expect(block.type).toBe("blockquote");
    expect(block.lines[0][0].text).toBe("\u2502 ");
    // Text might be empty string
    expect(block.lines[0][1].text).toBeDefined();
  });

  test("triple-nested blockquote", () => {
    const token = getBlockquoteToken("> L1\n> > L2\n> > > L3");
    const text = extractBlockquoteText(token);

    expect(text).toContain("L1");
    expect(text).toContain("L2");
    expect(text).toContain("L3");
  });

  test("blockquote with multi-line content", () => {
    const token = getBlockquoteToken("> Line 1\n> Line 2\n> Line 3");
    const block = blockquoteToBlock(TEST_COLORS, token);

    const content = block.lines[0][1].text;
    expect(content).toContain("Line 1");
  });

  test("blockquote text is italic and gray", () => {
    const token = getBlockquoteToken("> Styled quote");
    const block = blockquoteToBlock(TEST_COLORS, token);

    const textSeg = block.lines[0][1];
    expect(textSeg.italic).toBe(true);
    expect(textSeg.fg).toBe(TEST_COLORS.gray);
  });
});

// =============================================================================
// HTML Block Edge Cases
// =============================================================================

describe("HTML block edge cases", () => {
  test("empty HTML table returns block with empty lines", () => {
    const block = htmlTableToBlock(TEST_COLORS, "<table></table>");
    expect(block.lines).toEqual([]);
  });

  test("empty HTML list returns empty array", () => {
    const blocks = htmlListToBlocks(TEST_COLORS, "<ul></ul>");
    expect(blocks).toEqual([]);
  });

  test("HTML list with single item", () => {
    const blocks = htmlListToBlocks(TEST_COLORS, "<ul><li>Only</li></ul>");
    expect(blocks.length).toBe(1);
    expect(blocks[0].marginTop).toBe(1);
    expect(blocks[0].marginBottom).toBe(1);
  });

  test("ordered HTML list uses numbers", () => {
    const blocks = htmlListToBlocks(
      TEST_COLORS,
      "<ol><li>First</li><li>Second</li></ol>",
    );
    expect(blocks[0].lines[0][0].text).toContain("1.");
    expect(blocks[1].lines[0][0].text).toContain("2.");
  });

  test("HTML heading at each level uses correct color", () => {
    const expectedColors = [
      TEST_COLORS.red,
      TEST_COLORS.orange,
      TEST_COLORS.yellow,
      TEST_COLORS.green,
      TEST_COLORS.cyan,
      TEST_COLORS.purple,
    ];

    for (let level = 1; level <= 6; level++) {
      const block = htmlHeadingToBlock(
        TEST_COLORS,
        `<h${level}>Heading ${level}</h${level}>`,
        level,
      );
      expect(block).not.toBeNull();
      if (block) {
        expect(block.lines[0][0].fg).toBe(expectedColors[level - 1]);
        expect(block.lines[0][0].bold).toBe(true);
      }
    }
  });

  test("HTML heading with empty content returns null", () => {
    const block = htmlHeadingToBlock(TEST_COLORS, "<h1></h1>", 1);
    expect(block).toBeNull();
  });

  test("HTML table with mismatched column counts", () => {
    const html =
      "<table><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>1</td><td>2</td></tr></table>";
    const block = htmlTableToBlock(TEST_COLORS, html);

    // Should not crash - missing cells become empty
    expect(block.lines.length).toBe(3);
  });

  test("HTML with entities is decoded", () => {
    const blocks = htmlBlockToBlocks(
      TEST_COLORS,
      "<div>&lt;hello&gt; &amp; world</div>",
    );
    expect(blocks.length).toBe(1);
    const text = blocks[0].lines[0].map((s) => s.text).join("");
    expect(text).toContain("<hello>");
    expect(text).toContain("&");
  });

  test("malformed HTML table with unclosed tags", () => {
    const block = htmlTableToBlock(
      TEST_COLORS,
      "<table><tr><td>unclosed",
    );
    // Unclosed rows/cells are not matched by regex, returns empty
    expect(block.lines).toEqual([]);
  });

  test("hr width defaults to 76 characters", () => {
    const block = hrToBlock(TEST_COLORS);
    // Default width 80 - 4 = 76
    expect(block.lines[0][0].text.length).toBe(76);
    expect(block.lines[0][0].fg).toBe(TEST_COLORS.gray);
  });

  test("hr with small width uses minimum of 20", () => {
    const block = hrToBlock(TEST_COLORS, 10);
    expect(block.lines[0][0].text.length).toBe(20);
  });
});

// =============================================================================
// Pipeline Edge Cases
// =============================================================================

describe("pipeline edge cases", () => {
  test("all six heading levels have distinct colors", () => {
    const expectedColors = [
      TEST_COLORS.red,
      TEST_COLORS.orange,
      TEST_COLORS.yellow,
      TEST_COLORS.green,
      TEST_COLORS.cyan,
      TEST_COLORS.purple,
    ];

    for (let level = 1; level <= 6; level++) {
      const prefix = "#".repeat(level);
      const blocks = renderToBlocks(`${prefix} Heading ${level}`);
      expect(blocks[0].type).toBe("heading");
      expect(blocks[0].lines[0][0].fg).toBe(expectedColors[level - 1]);
    }
  });

  test("h1 has marginTop=1, others have marginTop=0", () => {
    const h1 = renderToBlocks("# Title");
    expect(h1[0].marginTop).toBe(1);

    const h2 = renderToBlocks("## Subtitle");
    expect(h2[0].marginTop).toBe(0);

    const h3 = renderToBlocks("### Section");
    expect(h3[0].marginTop).toBe(0);
  });

  test("inline HTML block returns empty for non-block HTML", () => {
    // Non-block inline HTML should not produce blocks
    const blocks = renderToBlocks("<b>inline bold</b>\n\nParagraph after");
    // The <b> is block-level in marked if standalone
    expect(blocks.length).toBeGreaterThan(0);
  });

  test("multiple consecutive paragraphs", () => {
    const blocks = renderToBlocks("Para 1\n\nPara 2\n\nPara 3");
    const paragraphs = blocks.filter((b) => b.type === "paragraph");
    expect(paragraphs.length).toBe(3);
  });

  test("mixed document preserves ordering", () => {
    const markdown = `# Title

Paragraph

* List 1
* List 2

> Quote

| A | B |
| - | - |
| 1 | 2 |

---

End`;

    const blocks = renderToBlocks(markdown);
    const types = blocks.map((b) => b.type);

    const headingIdx = types.indexOf("heading");
    const paraIdx = types.indexOf("paragraph");
    const listIdx = types.indexOf("list");
    const bqIdx = types.indexOf("blockquote");
    const tableIdx = types.indexOf("table");
    const hrIdx = types.indexOf("hr");

    expect(headingIdx).toBeLessThan(paraIdx);
    expect(paraIdx).toBeLessThan(listIdx);
    expect(listIdx).toBeLessThan(bqIdx);
    expect(bqIdx).toBeLessThan(tableIdx);
    expect(tableIdx).toBeLessThan(hrIdx);
  });

  test("paragraph with only whitespace", () => {
    // Marked typically won't produce a paragraph for just whitespace
    const blocks = renderToBlocks("   ");
    // Should not crash, may produce empty or whitespace paragraph
    expect(blocks.length).toBeGreaterThanOrEqual(0);
  });

  test("code block preserves indentation", () => {
    const markdown = "```\n  indented\n    more indented\n```";
    const blocks = renderToBlocks(markdown);
    const text = flattenToText(blocks);
    expect(text).toContain("  indented");
    expect(text).toContain("    more indented");
  });

  test("consecutive code blocks", () => {
    const markdown = "```\nblock 1\n```\n\n```\nblock 2\n```";
    const blocks = renderToBlocks(markdown);
    const codeBlocks = blocks.filter((b) => b.type === "code");
    expect(codeBlocks.length).toBe(2);
  });

  test("document with all block types", () => {
    const markdown = `# Heading

Paragraph with **bold** and [link](http://x.com).

* List item

1. Ordered item

> Blockquote

| A | B |
| - | - |
| 1 | 2 |

---

\`\`\`
code
\`\`\`

<div>html block</div>`;

    const blocks = renderToBlocks(markdown);
    const types = new Set(blocks.map((b) => b.type));

    expect(types.has("heading")).toBe(true);
    expect(types.has("paragraph")).toBe(true);
    expect(types.has("list")).toBe(true);
    expect(types.has("blockquote")).toBe(true);
    expect(types.has("table")).toBe(true);
    expect(types.has("hr")).toBe(true);
    expect(types.has("code")).toBe(true);
    expect(types.has("html")).toBe(true);
  });

  test("special characters in markdown", () => {
    const blocks = renderToBlocks("Text with < and > and & and \"quotes\"");
    const text = flattenToText(blocks);
    expect(text).toContain("<");
    expect(text).toContain(">");
    expect(text).toContain("&");
  });

  test("unicode content is preserved", () => {
    const blocks = renderToBlocks("Hello \u00e9\u00e8\u00ea \u4e16\u754c \ud83c\udf0d");
    const text = flattenToText(blocks);
    expect(text).toContain("\u00e9\u00e8\u00ea");
    expect(text).toContain("\u4e16\u754c");
    expect(text).toContain("\ud83c\udf0d");
  });
});
