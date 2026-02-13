/**
 * Blockquote rendering tests
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import { extractBlockquoteText } from "../../rendering/blockquote.js";

describe("extractBlockquoteText", () => {
  test("extracts text from simple blockquote", () => {
    const tokens = lexer("> This is a simple blockquote.");
    const blockquote = tokens.find((t) => t.type === "blockquote");
    expect(blockquote).toBeDefined();

    const text = extractBlockquoteText(blockquote as any);
    expect(text).toBe("This is a simple blockquote.");
  });

  test("extracts text from multi-line blockquote", () => {
    const tokens = lexer("> Line 1\n> Line 2");
    const blockquote = tokens.find((t) => t.type === "blockquote");
    expect(blockquote).toBeDefined();

    const text = extractBlockquoteText(blockquote as any);
    expect(text).toContain("Line 1");
    expect(text).toContain("Line 2");
  });

  test("handles nested blockquotes", () => {
    const tokens = lexer("> Level 1\n> > Level 2");
    const blockquote = tokens.find((t) => t.type === "blockquote");
    expect(blockquote).toBeDefined();

    const text = extractBlockquoteText(blockquote as any);
    expect(text).toContain("Level 1");
  });

  test("extracts text with formatting", () => {
    const tokens = lexer("> Text with **bold** and *italic*");
    const blockquote = tokens.find((t) => t.type === "blockquote");
    expect(blockquote).toBeDefined();

    const text = extractBlockquoteText(blockquote as any);
    expect(text).toContain("bold");
    expect(text).toContain("italic");
  });
});

describe("blockquote parsing with fixtures", () => {
  const blockquoteFixture = `
> This is a simple blockquote.
> It spans multiple lines.

> Level 1 quote
>
> > Level 2 nested quote
`;

  test("parses multiple blockquotes", () => {
    const tokens = lexer(blockquoteFixture);
    const blockquotes = tokens.filter((t) => t.type === "blockquote");
    expect(blockquotes.length).toBeGreaterThanOrEqual(2);
  });

  test("simple blockquote has correct structure", () => {
    const tokens = lexer("> Simple quote");
    const blockquote = tokens.find((t) => t.type === "blockquote") as any;
    expect(blockquote).toBeDefined();
    expect(blockquote.tokens).toBeDefined();
  });
});
