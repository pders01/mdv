import { describe, it, expect } from "bun:test";
import {
  renderBlock,
  renderInline,
  type StyledSpan,
  type RenderedLine,
  type RenderOptions,
} from "./renderer";
import { parseBlocks } from "./document";

const defaultOptions: RenderOptions = {
  width: 80,
};

function getBlock(content: string, index = 0) {
  const blocks = parseBlocks(content);
  return blocks[index];
}

describe("renderBlock", () => {
  describe("headings", () => {
    it("renders h1 with bold red style", () => {
      const block = getBlock("# Hello World");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(1);
      expect(lines[0].spans).toHaveLength(1);
      expect(lines[0].spans[0].text).toBe("Hello World");
      expect(lines[0].spans[0].style.bold).toBe(true);
      expect(lines[0].spans[0].style.fg).toBe("#ff6464");
    });

    it("renders h2 with different color", () => {
      const block = getBlock("## Subtitle");
      const lines = renderBlock(block, defaultOptions);
      expect(lines[0].spans[0].style.fg).toBe("#ff9664");
    });

    it("renders h3-h6 with progressively different colors", () => {
      const colors = ["#ffc864", "#c8c864", "#96c864", "#64c864"];
      for (let i = 3; i <= 6; i++) {
        const block = getBlock("#".repeat(i) + " Heading");
        const lines = renderBlock(block, defaultOptions);
        expect(lines[0].spans[0].style.fg).toBe(colors[i - 3]);
      }
    });
  });

  describe("paragraphs", () => {
    it("renders simple paragraph", () => {
      const block = getBlock("Hello world");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(1);
      expect(lines[0].spans[0].text).toBe("Hello world");
    });

    it("wraps long paragraphs", () => {
      const longText = "word ".repeat(30).trim(); // ~150 chars
      const block = getBlock(longText);
      const lines = renderBlock(block, { width: 40 });
      expect(lines.length).toBeGreaterThan(1);
    });

    it("preserves inline formatting across wraps", () => {
      const text = "Normal **bold text that is quite long** normal";
      const block = getBlock(text);
      const lines = renderBlock(block, { width: 20 });
      // Bold should be preserved even when wrapped
      const allSpans = lines.flatMap((l) => l.spans);
      const boldSpans = allSpans.filter((s) => s.style.bold);
      expect(boldSpans.length).toBeGreaterThan(0);
    });
  });

  describe("code blocks", () => {
    it("renders code block with background", () => {
      const block = getBlock("```\nconst x = 1;\n```");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(1);
      expect(lines[0].spans[0].text).toBe("const x = 1;");
      expect(lines[0].spans[0].style.bg).toBe("#282828");
    });

    it("renders multi-line code block", () => {
      const block = getBlock("```\nline1\nline2\nline3\n```");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(3);
    });

    it("does not wrap code lines", () => {
      const longCode = "x".repeat(100);
      const block = getBlock("```\n" + longCode + "\n```");
      const lines = renderBlock(block, { width: 40 });
      // Code should not wrap, just truncate or scroll
      expect(lines).toHaveLength(1);
    });
  });

  describe("lists", () => {
    it("renders unordered list with bullets", () => {
      const block = getBlock("- Item 1\n- Item 2\n- Item 3");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(3);
      expect(lines[0].spans[0].text).toMatch(/^[•\-\*]\s/);
    });

    it("renders ordered list with numbers", () => {
      const block = getBlock("1. First\n2. Second\n3. Third");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(3);
      expect(lines[0].spans[0].text).toMatch(/^1\.\s/);
    });

    it("handles nested lists", () => {
      const content = "- Level 1\n  - Level 2\n    - Level 3";
      const block = getBlock(content);
      const lines = renderBlock(block, defaultOptions);
      // Should have indentation
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("blockquotes", () => {
    it("renders blockquote with prefix", () => {
      const block = getBlock("> Quote text");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(1);
      expect(lines[0].spans[0].text).toMatch(/^[│>]/);
      expect(lines[0].spans[0].style.fg).toBe("#888888");
    });

    it("renders multi-line blockquote", () => {
      const block = getBlock("> Line 1\n> Line 2");
      const lines = renderBlock(block, defaultOptions);
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it("handles nested blockquotes", () => {
      const block = getBlock("> Outer\n> > Inner");
      const lines = renderBlock(block, defaultOptions);
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("horizontal rules", () => {
    it("renders hr as line", () => {
      const block = getBlock("---");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(1);
      expect(lines[0].spans[0].text).toMatch(/^[─\-]{3,}$/);
      expect(lines[0].spans[0].style.fg).toBe("#555555");
    });

    it("spans full width", () => {
      const block = getBlock("---");
      const lines = renderBlock(block, { width: 40 });
      expect(lines[0].spans[0].text.length).toBe(40);
    });
  });

  describe("HTML blocks", () => {
    it("renders HTML heading as styled text", () => {
      const block = getBlock("<h2>HTML Heading</h2>");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(1);
      expect(lines[0].spans[0].text).toBe("HTML Heading");
      expect(lines[0].spans[0].style.bold).toBe(true);
    });

    it("strips unknown HTML tags", () => {
      const block = getBlock("<div>Content</div>");
      const lines = renderBlock(block, defaultOptions);
      expect(lines[0].spans[0].text).toBe("Content");
    });

    it("handles empty HTML gracefully", () => {
      const block = getBlock("<br>");
      const lines = renderBlock(block, defaultOptions);
      expect(lines).toHaveLength(1);
    });
  });

  describe("tables", () => {
    it("renders simple table", () => {
      const content = `| A | B |
|---|---|
| 1 | 2 |`;
      const block = getBlock(content);
      const lines = renderBlock(block, defaultOptions);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("renderInline", () => {
  it("renders plain text", () => {
    const spans = renderInline("Hello world");
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe("Hello world");
    expect(spans[0].style).toEqual({});
  });

  it("renders bold text", () => {
    const spans = renderInline("Hello **bold** world");
    expect(spans).toHaveLength(3);
    expect(spans[0].text).toBe("Hello ");
    expect(spans[1].text).toBe("bold");
    expect(spans[1].style.bold).toBe(true);
    expect(spans[2].text).toBe(" world");
  });

  it("renders italic text", () => {
    const spans = renderInline("Hello *italic* world");
    expect(spans).toHaveLength(3);
    expect(spans[1].text).toBe("italic");
    expect(spans[1].style.italic).toBe(true);
  });

  it("renders inline code", () => {
    const spans = renderInline("Use `code` here");
    expect(spans).toHaveLength(3);
    expect(spans[1].text).toBe("code");
    expect(spans[1].style.fg).toBe("#dc9664");
    expect(spans[1].style.bg).toBe("#282828");
  });

  it("renders strikethrough", () => {
    const spans = renderInline("Hello ~~deleted~~ world");
    expect(spans).toHaveLength(3);
    expect(spans[1].text).toBe("deleted");
    expect(spans[1].style.dim).toBe(true);
  });

  it("renders links", () => {
    const spans = renderInline("Click [here](http://example.com)");
    expect(spans).toHaveLength(2);
    expect(spans[1].text).toBe("here");
    expect(spans[1].style.fg).toBe("#6496ff");
    expect(spans[1].style.underline).toBe(true);
  });

  it("renders nested formatting", () => {
    const spans = renderInline("Hello ***bold italic*** world");
    const middle = spans.find((s) => s.text.includes("bold"));
    expect(middle?.style.bold).toBe(true);
    expect(middle?.style.italic).toBe(true);
  });

  it("handles adjacent formatting", () => {
    const spans = renderInline("**bold** and *italic*");
    const bold = spans.find((s) => s.text === "bold");
    const italic = spans.find((s) => s.text === "italic");
    expect(bold?.style.bold).toBe(true);
    expect(italic?.style.italic).toBe(true);
  });

  it("renders images as alt text", () => {
    const spans = renderInline("See ![alt text](image.png)");
    expect(spans.some((s) => s.text.includes("alt text"))).toBe(true);
  });
});
