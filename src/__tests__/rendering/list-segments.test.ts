/**
 * List segment extraction tests
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import type { ListToken } from "../../types.js";
import { listToBlocks, inlineTokensToSegments } from "../../rendering/list.js";
import {
  TEST_COLORS,
  renderToBlocks,
  flattenToText,
} from "../helpers/render-harness.js";

function getListToken(markdown: string): ListToken {
  const tokens = lexer(markdown);
  return tokens.find((t) => t.type === "list") as ListToken;
}

describe("listToBlocks", () => {
  test("renders unordered list items with bullet", () => {
    const token = getListToken("* Item 1\n* Item 2\n* Item 3");
    const blocks = listToBlocks(TEST_COLORS, token);

    expect(blocks.length).toBe(3);
    for (const block of blocks) {
      expect(block.type).toBe("list");
      expect(block.indent).toBe(0);
      // Each block has one line with bullet + content
      expect(block.lines.length).toBe(1);
      // First segment is the bullet
      expect(block.lines[0][0].text).toContain("\u2022");
      expect(block.lines[0][0].fg).toBe(TEST_COLORS.cyan);
    }
  });

  test("renders ordered list items with numbers", () => {
    const token = getListToken("1. First\n2. Second\n3. Third");
    const blocks = listToBlocks(TEST_COLORS, token);

    expect(blocks.length).toBe(3);
    expect(blocks[0].lines[0][0].text).toContain("1.");
    expect(blocks[1].lines[0][0].text).toContain("2.");
    expect(blocks[2].lines[0][0].text).toContain("3.");
  });

  test("sets margins on first and last items at depth 0", () => {
    const token = getListToken("* A\n* B\n* C");
    const blocks = listToBlocks(TEST_COLORS, token);

    expect(blocks[0].marginTop).toBe(1);
    expect(blocks[0].marginBottom).toBe(0);
    expect(blocks[1].marginTop).toBe(0);
    expect(blocks[1].marginBottom).toBe(0);
    expect(blocks[2].marginTop).toBe(0);
    expect(blocks[2].marginBottom).toBe(1);
  });

  test("renders nested lists with increased depth", () => {
    const markdown = "* Level 1\n    * Level 2\n        * Level 3";
    const token = getListToken(markdown);
    const blocks = listToBlocks(TEST_COLORS, token);

    // Should have blocks at different indent levels
    const indents = blocks.map((b) => b.indent);
    expect(indents).toContain(0);
    expect(indents).toContain(1);
    expect(indents).toContain(2);
  });

  test("nested items have indent prefix in bullet text", () => {
    const markdown = "* Level 1\n    * Level 2";
    const token = getListToken(markdown);
    const blocks = listToBlocks(TEST_COLORS, token);

    const depth1Block = blocks.find((b) => b.indent === 1);
    expect(depth1Block).toBeDefined();
    if (depth1Block) {
      // Bullet text should have "  " prefix for depth 1
      expect(depth1Block.lines[0][0].text).toMatch(/^\s+/);
    }
  });

  test("preserves inline formatting in list items", () => {
    const markdown = "* Item with **bold**\n* Item with *italic*\n* Item with `code`";
    const token = getListToken(markdown);
    const blocks = listToBlocks(TEST_COLORS, token);

    expect(blocks.length).toBe(3);

    // Check bold in first item
    const boldSegments = blocks[0].lines[0];
    const boldSeg = boldSegments.find((s) => s.bold);
    expect(boldSeg).toBeDefined();

    // Check italic in second item
    const italicSegments = blocks[1].lines[0];
    const italicSeg = italicSegments.find((s) => s.italic);
    expect(italicSeg).toBeDefined();

    // Check code in third item
    const codeSegments = blocks[2].lines[0];
    const codeSeg = codeSegments.find((s) => s.fg === TEST_COLORS.cyan);
    expect(codeSeg).toBeDefined();
  });

  test("preserves links in list items", () => {
    const markdown = "* [Link text](http://example.com)\n* Another [link](http://test.com)";
    const token = getListToken(markdown);
    const blocks = listToBlocks(TEST_COLORS, token);

    expect(blocks.length).toBe(2);

    // First item should have link-colored segment
    const linkSeg = blocks[0].lines[0].find((s) => s.fg === TEST_COLORS.link);
    expect(linkSeg).toBeDefined();

    // And a gray URL segment
    const urlSeg = blocks[0].lines[0].find(
      (s) => s.fg === TEST_COLORS.gray && s.text.includes("http"),
    );
    expect(urlSeg).toBeDefined();
  });

  test("handles mixed ordered/unordered nesting", () => {
    const markdown = "1. Ordered\n    * Unordered child\n    * Another child";
    const token = getListToken(markdown);
    const blocks = listToBlocks(TEST_COLORS, token);

    // First block should be numbered
    expect(blocks[0].lines[0][0].text).toContain("1.");
    // Nested blocks should have bullets
    const nested = blocks.filter((b) => b.indent === 1);
    expect(nested.length).toBe(2);
    for (const n of nested) {
      expect(n.lines[0][0].text).toContain("\u2022");
    }
  });
});

describe("inlineTokensToSegments", () => {
  test("converts text tokens to segments", () => {
    const tokens = lexer("Hello world");
    const para = tokens.find((t) => t.type === "paragraph") as any;
    const segments = inlineTokensToSegments(TEST_COLORS, para.tokens);

    expect(segments.length).toBeGreaterThan(0);
    const text = segments.map((s) => s.text).join("");
    expect(text).toContain("Hello world");
  });
});

describe("list via full pipeline", () => {
  test("renders list blocks with correct type", () => {
    const blocks = renderToBlocks("* Item 1\n* Item 2");
    const listBlocks = blocks.filter((b) => b.type === "list");
    expect(listBlocks.length).toBe(2);
  });

  test("preserves all text content", () => {
    const blocks = renderToBlocks("* Alpha\n* Beta\n* Gamma");
    const text = flattenToText(blocks);
    expect(text).toContain("Alpha");
    expect(text).toContain("Beta");
    expect(text).toContain("Gamma");
  });
});
