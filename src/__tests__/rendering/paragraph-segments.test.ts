/**
 * Paragraph segment extraction tests
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import type { ParagraphToken } from "../../types.js";
import { paragraphToSegments } from "../../rendering/paragraph.js";
import {
  TEST_COLORS,
  expectSegment,
  renderToBlocks,
} from "../helpers/render-harness.js";

function getParagraphToken(markdown: string): ParagraphToken {
  const tokens = lexer(markdown);
  return tokens.find((t) => t.type === "paragraph") as ParagraphToken;
}

describe("paragraphToSegments", () => {
  test("returns segments for plain text", () => {
    const token = getParagraphToken("Hello world");
    const segments = paragraphToSegments(TEST_COLORS, token);

    expect(segments.length).toBeGreaterThan(0);
    const text = segments.map((s) => s.text).join("");
    expect(text).toContain("Hello world");
  });

  test("returns empty for null tokens", () => {
    const token = { type: "paragraph", text: "", raw: "" } as ParagraphToken;
    const segments = paragraphToSegments(TEST_COLORS, token);
    expect(segments).toEqual([]);
  });

  test("renders bold text with bold flag", () => {
    const token = getParagraphToken("normal **bold** normal");
    const segments = paragraphToSegments(TEST_COLORS, token);

    expectSegment(segments, "bold", { bold: true, italic: false });
  });

  test("renders italic text with italic flag", () => {
    const token = getParagraphToken("normal *italic* normal");
    const segments = paragraphToSegments(TEST_COLORS, token);

    expectSegment(segments, "italic", { italic: true, bold: false });
  });

  test("renders inline code with cyan color", () => {
    const token = getParagraphToken("use `console.log`");
    const segments = paragraphToSegments(TEST_COLORS, token);

    expectSegment(segments, "console.log", { fg: TEST_COLORS.cyan });
  });

  test("renders link text with link color", () => {
    const token = getParagraphToken("[click here](http://example.com)");
    const segments = paragraphToSegments(TEST_COLORS, token);

    expectSegment(segments, "click here", { fg: TEST_COLORS.link });
    // URL in parentheses
    expectSegment(segments, "(http://example.com)", { fg: TEST_COLORS.gray });
  });

  test("renders strikethrough with gray color", () => {
    const token = getParagraphToken("~~deleted~~");
    const segments = paragraphToSegments(TEST_COLORS, token);

    expectSegment(segments, "deleted", { fg: TEST_COLORS.gray });
  });

  test("handles escape sequences", () => {
    const token = getParagraphToken("test \\* escaped");
    const segments = paragraphToSegments(TEST_COLORS, token);

    const text = segments.map((s) => s.text).join("");
    expect(text).toContain("*");
  });

  describe("inline HTML", () => {
    test("renders <b> as bold", () => {
      const token = getParagraphToken("normal <b>bold</b> normal");
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "bold", { bold: true });
    });

    test("renders <i> as italic", () => {
      const token = getParagraphToken("normal <i>italic</i> normal");
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "italic", { italic: true });
    });

    test("renders <code> with cyan color", () => {
      const token = getParagraphToken("use <code>console.log</code>");
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "console.log", { fg: TEST_COLORS.cyan });
    });

    test("renders <a> with link color and URL", () => {
      const token = getParagraphToken('<a href="http://example.com">click</a>');
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "click", { fg: TEST_COLORS.link });
      expectSegment(segments, "(http://example.com)", { fg: TEST_COLORS.gray });
    });

    test("renders <sub> as subscript Unicode", () => {
      const token = getParagraphToken("H<sub>2</sub>O");
      const segments = paragraphToSegments(TEST_COLORS, token);

      const text = segments.map((s) => s.text).join("");
      expect(text).toContain("\u2082"); // subscript 2
    });

    test("renders <sup> as superscript Unicode", () => {
      const token = getParagraphToken("x<sup>2</sup>");
      const segments = paragraphToSegments(TEST_COLORS, token);

      const text = segments.map((s) => s.text).join("");
      expect(text).toContain("\u00B2"); // superscript 2
    });

    test("renders <mark> with yellow color", () => {
      const token = getParagraphToken("normal <mark>highlighted</mark> normal");
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "highlighted", { fg: TEST_COLORS.yellow });
    });

    test("renders <kbd> with cyan color", () => {
      const token = getParagraphToken("Press <kbd>Ctrl+C</kbd>");
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "Ctrl+C", { fg: TEST_COLORS.cyan });
    });

    test("renders <br> as newline", () => {
      const token = getParagraphToken("line 1<br>line 2");
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "\n");
    });

    test("renders <img> with alt text", () => {
      const token = getParagraphToken('text <img src="photo.jpg" alt="My photo"> more');
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "[My photo]", { fg: TEST_COLORS.gray });
    });

    test("renders nested bold+italic HTML", () => {
      const token = getParagraphToken("<b>bold <i>bold-italic</i></b>");
      const segments = paragraphToSegments(TEST_COLORS, token);

      // The bold-italic text should have both flags
      const biSegment = segments.find(
        (s) => s.text.includes("bold-italic"),
      );
      expect(biSegment).toBeDefined();
      if (biSegment) {
        expect(biSegment.bold).toBe(true);
        expect(biSegment.italic).toBe(true);
      }
    });

    test("renders <del>/<s>/<strike> with gray color", () => {
      const token = getParagraphToken("normal <del>deleted</del> normal");
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "deleted", { fg: TEST_COLORS.gray });
    });

    test("renders <u>/<ins> with green color", () => {
      const token = getParagraphToken("normal <u>underlined</u> normal");
      const segments = paragraphToSegments(TEST_COLORS, token);

      expectSegment(segments, "underlined", { fg: TEST_COLORS.green });
    });
  });

  test("decodes HTML entities", () => {
    const token = getParagraphToken("a &lt; b &amp; c &gt; d");
    const segments = paragraphToSegments(TEST_COLORS, token);

    const text = segments.map((s) => s.text).join("");
    expect(text).toContain("<");
    expect(text).toContain("&");
    expect(text).toContain(">");
  });
});

describe("paragraph via full pipeline", () => {
  test("renders paragraph block with correct type", () => {
    const blocks = renderToBlocks("Hello world");
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].type).toBe("paragraph");
  });

  test("paragraph has marginBottom of 1", () => {
    const blocks = renderToBlocks("Hello world");
    expect(blocks[0].marginBottom).toBe(1);
  });
});
