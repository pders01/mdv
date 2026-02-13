/**
 * Blockquote segment extraction tests
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import type { Token } from "marked";
import { blockquoteToBlock } from "../../rendering/blockquote.js";
import {
  TEST_COLORS,
  renderToBlocks,
  flattenToText,
} from "../helpers/render-harness.js";

function getBlockquoteToken(markdown: string): Token {
  const tokens = lexer(markdown);
  return tokens.find((t) => t.type === "blockquote") as Token;
}

describe("blockquoteToBlock", () => {
  test("renders simple blockquote with quote bar and text", () => {
    const token = getBlockquoteToken("> Hello world");
    const block = blockquoteToBlock(TEST_COLORS, token as any);

    expect(block.type).toBe("blockquote");
    expect(block.marginTop).toBe(1);
    expect(block.marginBottom).toBe(1);
    expect(block.lines.length).toBe(1);

    // First segment is the quote bar
    expect(block.lines[0][0].text).toBe("\u2502 ");
    expect(block.lines[0][0].fg).toBe(TEST_COLORS.purple);

    // Second segment is the text
    expect(block.lines[0][1].text).toContain("Hello world");
    expect(block.lines[0][1].fg).toBe(TEST_COLORS.gray);
    expect(block.lines[0][1].italic).toBe(true);
  });

  test("renders nested blockquote with > prefix", () => {
    const token = getBlockquoteToken("> Outer\n> > Inner");
    const block = blockquoteToBlock(TEST_COLORS, token as any);

    expect(block.lines[0][1].text).toContain(">");
    expect(block.lines[0][1].text).toContain("Inner");
  });

  test("renders blockquote with formatting in text", () => {
    const token = getBlockquoteToken("> Quote with **bold** text");
    const block = blockquoteToBlock(TEST_COLORS, token as any);

    // extractBlockquoteText returns raw text, so bold markers may be stripped
    expect(block.lines[0][1].text.length).toBeGreaterThan(0);
  });
});

describe("blockquote via full pipeline", () => {
  test("renders blockquote block", () => {
    const blocks = renderToBlocks("> A quote");
    const bqBlocks = blocks.filter((b) => b.type === "blockquote");
    expect(bqBlocks.length).toBe(1);
  });

  test("preserves quote text", () => {
    const blocks = renderToBlocks("> This is a quotation");
    const text = flattenToText(blocks);
    expect(text).toContain("This is a quotation");
  });

  test("quote bar is purple", () => {
    const blocks = renderToBlocks("> Important");
    const bqBlock = blocks.find((b) => b.type === "blockquote");
    expect(bqBlock).toBeDefined();
    if (bqBlock) {
      const barSegment = bqBlock.lines[0][0];
      expect(barSegment.fg).toBe(TEST_COLORS.purple);
    }
  });
});
