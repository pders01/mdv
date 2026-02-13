/**
 * Code block segment extraction tests
 * Tests the Shiki highlighting path with a mock highlighter
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import type { Token } from "marked";
import { codeToBlock } from "../../rendering/code.js";
import type { HighlighterInstance } from "../../highlighting/shiki.js";
import { TEST_COLORS, renderToBlocks, flattenToText } from "../helpers/render-harness.js";

interface CodeToken extends Token {
  text: string;
  lang?: string;
}

function getCodeToken(markdown: string): CodeToken {
  const tokens = lexer(markdown);
  return tokens.find((t) => t.type === "code") as CodeToken;
}

/**
 * Create a mock highlighter that returns predictable tokens
 */
function createMockHighlighter(
  mockTokens: Array<Array<{ content: string; color?: string; fontStyle?: number }>>,
): HighlighterInstance {
  return {
    highlighter: {
      getLoadedLanguages: () => ["javascript", "typescript"],
      codeToTokens: () => ({ tokens: mockTokens }),
    } as any,
    theme: "test-theme",
    colors: TEST_COLORS,
  };
}

describe("codeToBlock without highlighter", () => {
  test("produces plain text for code without language", () => {
    const token = getCodeToken("```\nplain code\n```");
    const block = codeToBlock(TEST_COLORS, token);

    expect(block.type).toBe("code");
    expect(block.marginTop).toBe(1);
    expect(block.marginBottom).toBe(1);

    const allText = block.lines.flatMap((l) => l.map((s) => s.text)).join("");
    expect(allText).toBe("plain code");
  });

  test("produces plain text for code with language but no highlighter", () => {
    const token = getCodeToken("```javascript\nconst x = 1;\n```");
    const block = codeToBlock(TEST_COLORS, token);

    const allText = block.lines.flatMap((l) => l.map((s) => s.text)).join("");
    expect(allText).toBe("const x = 1;");
    // All segments use default fg color
    for (const line of block.lines) {
      for (const seg of line) {
        expect(seg.fg).toBe(TEST_COLORS.fg);
      }
    }
  });
});

describe("codeToBlock with mock highlighter", () => {
  test("converts RGBA floats to correct hex colors", () => {
    // Shiki returns colors as hex strings, which RGBA.fromHex converts to 0-1 floats
    const mock = createMockHighlighter([
      [
        { content: "const", color: "#ff0000" },
        { content: " x", color: "#00ff00" },
        { content: " = ", color: "#0000ff" },
        { content: "1", color: "#ff8040" },
      ],
    ]);

    const token = getCodeToken("```javascript\nconst x = 1\n```");
    const block = codeToBlock(TEST_COLORS, token, mock);

    expect(block.type).toBe("code");

    const segments = block.lines[0];
    expect(segments.length).toBe(4);

    expect(segments[0].text).toBe("const");
    expect(segments[0].fg).toBe("#ff0000");

    expect(segments[1].text).toBe(" x");
    expect(segments[1].fg).toBe("#00ff00");

    expect(segments[2].text).toBe(" = ");
    expect(segments[2].fg).toBe("#0000ff");

    expect(segments[3].text).toBe("1");
    expect(segments[3].fg).toBe("#ff8040");
  });

  test("splits multi-line code into separate lines", () => {
    const mock = createMockHighlighter([
      [{ content: "line 1", color: "#e1e4e8" }],
      [{ content: "line 2", color: "#e1e4e8" }],
      [{ content: "line 3", color: "#e1e4e8" }],
    ]);

    const token = getCodeToken("```javascript\nline 1\nline 2\nline 3\n```");
    const block = codeToBlock(TEST_COLORS, token, mock);

    expect(block.lines.length).toBe(3);
    expect(block.lines[0][0].text).toBe("line 1");
    expect(block.lines[1][0].text).toBe("line 2");
    expect(block.lines[2][0].text).toBe("line 3");
  });

  test("handles font styles (italic and bold)", () => {
    const mock = createMockHighlighter([
      [
        { content: "normal", color: "#e1e4e8", fontStyle: 0 },
        { content: "italic", color: "#e1e4e8", fontStyle: 1 },
        { content: "bold", color: "#e1e4e8", fontStyle: 2 },
        { content: "both", color: "#e1e4e8", fontStyle: 3 },
      ],
    ]);

    const token = getCodeToken("```javascript\nnormalbothitalicbold\n```");
    const block = codeToBlock(TEST_COLORS, token, mock);

    const segments = block.lines[0];
    expect(segments[0].bold).toBe(false);
    expect(segments[0].italic).toBe(false);

    expect(segments[1].italic).toBe(true);
    expect(segments[1].bold).toBe(false);

    expect(segments[2].bold).toBe(true);
    expect(segments[2].italic).toBe(false);

    expect(segments[3].bold).toBe(true);
    expect(segments[3].italic).toBe(true);
  });

  test("falls back to fg color when token has no color", () => {
    const mock = createMockHighlighter([
      [{ content: "no color" }],
    ]);

    const token = getCodeToken("```javascript\nno color\n```");
    const block = codeToBlock(TEST_COLORS, token, mock);

    // shikiToChunks defaults to #E1E4E8 when no color is provided
    expect(block.lines[0][0].fg).toBeDefined();
    expect(block.lines[0][0].fg.startsWith("#")).toBe(true);
  });

  test("handles empty code block", () => {
    const mock = createMockHighlighter([
      [{ content: "", color: "#e1e4e8" }],
    ]);

    const token = getCodeToken("```javascript\n\n```");
    const block = codeToBlock(TEST_COLORS, token, mock);

    expect(block.type).toBe("code");
    expect(block.lines.length).toBeGreaterThanOrEqual(1);
  });

  test("handles unsupported language gracefully", () => {
    // Mock highlighter that doesn't include "haskell"
    const mock = createMockHighlighter([]);

    const token = getCodeToken("```haskell\nmain = putStrLn \"hello\"\n```");
    const block = codeToBlock(TEST_COLORS, token, mock);

    // Falls back to plain text (shikiToChunks checks getLoadedLanguages)
    const allText = block.lines.flatMap((l) => l.map((s) => s.text)).join("");
    expect(allText).toContain("main");
  });
});

describe("code via full pipeline", () => {
  test("renders code block with correct type", () => {
    const blocks = renderToBlocks("```\nhello\n```");
    const codeBlocks = blocks.filter((b) => b.type === "code");
    expect(codeBlocks.length).toBe(1);
  });

  test("preserves code content", () => {
    const blocks = renderToBlocks("```\nfunction foo() {\n  return 42;\n}\n```");
    const text = flattenToText(blocks);
    expect(text).toContain("function foo()");
    expect(text).toContain("return 42");
  });
});
