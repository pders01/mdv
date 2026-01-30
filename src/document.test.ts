import { describe, it, expect } from "bun:test";
import {
  createDocument,
  createStreamingDocument,
  parseBlocks,
  computeLinePositions,
  findBlockAtLine,
  getVisibleBlocks,
  type Block,
  type Document,
  type StreamingDocument,
} from "./document";

describe("parseBlocks", () => {
  it("parses empty content", () => {
    const blocks = parseBlocks("");
    expect(blocks).toEqual([]);
  });

  it("parses a single heading", () => {
    const blocks = parseBlocks("# Hello");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].token.type).toBe("heading");
  });

  it("parses a single paragraph", () => {
    const blocks = parseBlocks("Hello world");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].token.type).toBe("paragraph");
  });

  it("parses multiple blocks", () => {
    const content = `# Title

Some paragraph text.

## Subtitle

More text here.`;
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(4);
    expect(blocks[0].token.type).toBe("heading");
    expect(blocks[1].token.type).toBe("paragraph");
    expect(blocks[2].token.type).toBe("heading");
    expect(blocks[3].token.type).toBe("paragraph");
  });

  it("parses code blocks", () => {
    const content = "```js\nconst x = 1;\n```";
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].token.type).toBe("code");
  });

  it("parses blockquotes", () => {
    const content = "> This is a quote";
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].token.type).toBe("blockquote");
  });

  it("parses lists", () => {
    const content = "- Item 1\n- Item 2\n- Item 3";
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].token.type).toBe("list");
  });

  it("parses horizontal rules", () => {
    const content = "---";
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].token.type).toBe("hr");
  });

  it("parses HTML blocks", () => {
    const content = "<div>Hello</div>";
    const blocks = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].token.type).toBe("html");
  });

  it("filters out space tokens", () => {
    const content = "# Title\n\n\n\nParagraph";
    const blocks = parseBlocks(content);
    // Should only have heading and paragraph, not space tokens
    expect(blocks.every((b) => b.token.type !== "space")).toBe(true);
  });

  it("initializes blocks with zero line positions", () => {
    const blocks = parseBlocks("# Hello\n\nWorld");
    for (const block of blocks) {
      expect(block.startLine).toBe(0);
      expect(block.lineCount).toBe(0);
    }
  });
});

describe("computeLinePositions", () => {
  it("computes positions for empty blocks", () => {
    const blocks: Block[] = [];
    computeLinePositions(blocks, 80);
    expect(blocks).toEqual([]);
  });

  it("computes single line for short heading", () => {
    const blocks = parseBlocks("# Hello");
    computeLinePositions(blocks, 80);
    expect(blocks[0].startLine).toBe(0);
    expect(blocks[0].lineCount).toBe(1);
  });

  it("computes line count for wrapped paragraph", () => {
    // 100 chars at width 50 = 2 lines
    const longText = "a".repeat(100);
    const blocks = parseBlocks(longText);
    computeLinePositions(blocks, 50);
    expect(blocks[0].lineCount).toBe(2);
  });

  it("accumulates startLine across blocks", () => {
    const content = "# Title\n\nParagraph";
    const blocks = parseBlocks(content);
    computeLinePositions(blocks, 80);
    expect(blocks[0].startLine).toBe(0);
    // Second block starts after first block's lines
    expect(blocks[1].startLine).toBe(blocks[0].lineCount);
  });

  it("handles code blocks with newlines", () => {
    const content = "```\nline1\nline2\nline3\n```";
    const blocks = parseBlocks(content);
    computeLinePositions(blocks, 80);
    expect(blocks[0].lineCount).toBe(3);
  });

  it("handles lists with multiple items", () => {
    const content = "- Item 1\n- Item 2\n- Item 3";
    const blocks = parseBlocks(content);
    computeLinePositions(blocks, 80);
    expect(blocks[0].lineCount).toBe(3);
  });
});

describe("findBlockAtLine", () => {
  function makeDoc(content: string, width = 80): Document {
    const blocks = parseBlocks(content);
    computeLinePositions(blocks, width);
    const totalLines = blocks.reduce((sum, b) => sum + b.lineCount, 0);
    return { blocks, headings: [], totalLines };
  }

  it("returns -1 for empty document", () => {
    const doc = makeDoc("");
    expect(findBlockAtLine(doc, 0)).toBe(-1);
  });

  it("finds first block at line 0", () => {
    const doc = makeDoc("# Hello\n\nWorld");
    expect(findBlockAtLine(doc, 0)).toBe(0);
  });

  it("finds second block after first", () => {
    const doc = makeDoc("# Hello\n\nWorld");
    const secondBlockStart = doc.blocks[1].startLine;
    expect(findBlockAtLine(doc, secondBlockStart)).toBe(1);
  });

  it("finds block containing line (not just starting)", () => {
    // Code block spanning multiple lines
    const doc = makeDoc("```\nline1\nline2\nline3\n```");
    expect(findBlockAtLine(doc, 0)).toBe(0);
    expect(findBlockAtLine(doc, 1)).toBe(0);
    expect(findBlockAtLine(doc, 2)).toBe(0);
  });

  it("uses binary search (O log n)", () => {
    // Create many blocks
    const content = Array.from({ length: 100 }, (_, i) => `# Heading ${i}`).join(
      "\n\n"
    );
    const doc = makeDoc(content);
    // Find block near the end
    const lastBlock = doc.blocks[doc.blocks.length - 1];
    expect(findBlockAtLine(doc, lastBlock.startLine)).toBe(doc.blocks.length - 1);
  });

  it("returns last block for line beyond document", () => {
    const doc = makeDoc("# Hello\n\nWorld");
    expect(findBlockAtLine(doc, 9999)).toBe(doc.blocks.length - 1);
  });
});

describe("getVisibleBlocks", () => {
  function makeDoc(content: string, width = 80): Document {
    const blocks = parseBlocks(content);
    computeLinePositions(blocks, width);
    const totalLines = blocks.reduce((sum, b) => sum + b.lineCount, 0);
    return { blocks, headings: [], totalLines };
  }

  it("returns empty for empty document", () => {
    const doc = makeDoc("");
    expect(getVisibleBlocks(doc, 0, 10)).toEqual([]);
  });

  it("returns all blocks if they fit in viewport", () => {
    const doc = makeDoc("# Hello\n\nWorld");
    const visible = getVisibleBlocks(doc, 0, 100);
    expect(visible).toHaveLength(2);
  });

  it("returns only visible blocks", () => {
    // 10 headings, each 1 line
    const content = Array.from({ length: 10 }, (_, i) => `# H${i}`).join("\n\n");
    const doc = makeDoc(content);
    // Viewport of 3 lines starting at line 0
    const visible = getVisibleBlocks(doc, 0, 3);
    expect(visible.length).toBeLessThanOrEqual(3);
  });

  it("handles scroll position mid-document", () => {
    const content = Array.from({ length: 10 }, (_, i) => `# H${i}`).join("\n\n");
    const doc = makeDoc(content);
    // Start at line 5
    const visible = getVisibleBlocks(doc, 5, 3);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible[0].startLine).toBeLessThanOrEqual(5);
  });

  it("includes partially visible blocks", () => {
    // Block that starts before viewport but extends into it
    const doc = makeDoc("```\nline1\nline2\nline3\nline4\nline5\n```\n\n# Next");
    // Start at line 3 (middle of code block)
    const visible = getVisibleBlocks(doc, 3, 5);
    expect(visible[0].token.type).toBe("code");
  });
});

describe("createDocument", () => {
  it("creates empty document from empty string", () => {
    const doc = createDocument("", 80);
    expect(doc.blocks).toEqual([]);
    expect(doc.headings).toEqual([]);
    expect(doc.totalLines).toBe(0);
  });

  it("extracts headings with correct block indices", () => {
    const content = `# H1

Paragraph

## H2

More text

### H3`;
    const doc = createDocument(content, 80);
    expect(doc.headings).toHaveLength(3);
    expect(doc.headings[0]).toEqual({ blockIndex: 0, depth: 1, text: "H1" });
    expect(doc.headings[1]).toEqual({ blockIndex: 2, depth: 2, text: "H2" });
    expect(doc.headings[2]).toEqual({ blockIndex: 4, depth: 3, text: "H3" });
  });

  it("computes correct totalLines", () => {
    const content = "# H1\n\n# H2\n\n# H3";
    const doc = createDocument(content, 80);
    expect(doc.totalLines).toBe(3); // 3 headings, 1 line each
  });

  it("handles nested headings correctly", () => {
    const content = `# Chapter 1

## Section 1.1

### Subsection 1.1.1

## Section 1.2

# Chapter 2`;
    const doc = createDocument(content, 80);
    expect(doc.headings.map((h) => h.depth)).toEqual([1, 2, 3, 2, 1]);
  });

  it("preserves heading text with formatting", () => {
    const content = "# Hello **world**";
    const doc = createDocument(content, 80);
    expect(doc.headings[0].text).toBe("Hello **world**");
  });
});

describe("edge cases", () => {
  it("handles very long lines", () => {
    const longLine = "x".repeat(10000);
    const doc = createDocument(longLine, 80);
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0].lineCount).toBe(125); // 10000 / 80 = 125
  });

  it("handles many blocks efficiently", () => {
    const content = Array.from({ length: 1000 }, (_, i) => `# Heading ${i}`).join(
      "\n\n"
    );
    const start = performance.now();
    const doc = createDocument(content, 80);
    const elapsed = performance.now() - start;

    expect(doc.blocks).toHaveLength(1000);
    expect(doc.headings).toHaveLength(1000);
    expect(elapsed).toBeLessThan(100); // Should be fast
  });

  it("handles unicode content", () => {
    const content = "# Caf\u00e9 \u2615\n\nHello \u4e16\u754c";
    const doc = createDocument(content, 80);
    expect(doc.blocks).toHaveLength(2);
    expect(doc.headings[0].text).toBe("Caf\u00e9 \u2615");
  });

  it("handles mixed markdown and HTML", () => {
    const content = `# Title

<div class="note">
This is HTML
</div>

Regular paragraph`;
    const doc = createDocument(content, 80);
    expect(doc.blocks.map((b) => b.token.type)).toEqual([
      "heading",
      "html",
      "paragraph",
    ]);
  });

  it("handles empty lines between blocks", () => {
    const content = "# A\n\n\n\n\n# B";
    const doc = createDocument(content, 80);
    expect(doc.blocks).toHaveLength(2);
    expect(doc.headings).toHaveLength(2);
  });

  it("handles tables", () => {
    const content = `| A | B |
|---|---|
| 1 | 2 |
| 3 | 4 |`;
    const doc = createDocument(content, 80);
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0].token.type).toBe("table");
    expect(doc.blocks[0].lineCount).toBe(3); // header + 2 rows
  });
});

describe("StreamingDocument", () => {
  it("creates empty streaming document", () => {
    const sdoc = createStreamingDocument(80);
    expect(sdoc.document.blocks).toEqual([]);
    expect(sdoc.document.totalLines).toBe(0);
  });

  it("appends content incrementally", () => {
    const sdoc = createStreamingDocument(80);
    sdoc.append("# Hello\n\n");
    expect(sdoc.document.blocks).toHaveLength(1);
    expect(sdoc.document.headings).toHaveLength(1);

    sdoc.append("World\n\n");
    expect(sdoc.document.blocks).toHaveLength(2);
  });

  it("handles partial blocks at chunk boundaries", () => {
    const sdoc = createStreamingDocument(80);
    // Partial code block
    sdoc.append("```js\nconst x");
    // Should buffer incomplete block
    expect(sdoc.document.blocks).toHaveLength(0);

    // Complete the block
    sdoc.append(" = 1;\n```\n\n");
    expect(sdoc.document.blocks).toHaveLength(1);
    expect(sdoc.document.blocks[0].token.type).toBe("code");
  });

  it("flushes pending content on finalize", () => {
    const sdoc = createStreamingDocument(80);
    sdoc.append("# Heading");
    // Might be buffered as incomplete
    sdoc.finalize();
    expect(sdoc.document.blocks).toHaveLength(1);
  });

  it("maintains correct line positions after append", () => {
    const sdoc = createStreamingDocument(80);
    sdoc.append("# H1\n\n");
    sdoc.append("# H2\n\n");
    sdoc.append("# H3\n\n");

    expect(sdoc.document.blocks[0].startLine).toBe(0);
    expect(sdoc.document.blocks[1].startLine).toBe(1);
    expect(sdoc.document.blocks[2].startLine).toBe(2);
    expect(sdoc.document.totalLines).toBe(3);
  });

  it("updates headings incrementally", () => {
    const sdoc = createStreamingDocument(80);
    sdoc.append("# First\n\nParagraph\n\n");
    expect(sdoc.document.headings).toHaveLength(1);

    sdoc.append("## Second\n\n");
    expect(sdoc.document.headings).toHaveLength(2);
    expect(sdoc.document.headings[1].depth).toBe(2);
  });

  it("handles large streaming input efficiently", () => {
    const sdoc = createStreamingDocument(80);
    const chunk = "# Heading\n\nParagraph text here.\n\n";

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      sdoc.append(chunk);
    }
    sdoc.finalize();
    const elapsed = performance.now() - start;

    expect(sdoc.document.blocks.length).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(100); // Should be fast
  });

  it("reports if more content is expected", () => {
    const sdoc = createStreamingDocument(80);
    expect(sdoc.isComplete).toBe(false);

    sdoc.append("# Hello");
    expect(sdoc.isComplete).toBe(false);

    sdoc.finalize();
    expect(sdoc.isComplete).toBe(true);
  });
});
