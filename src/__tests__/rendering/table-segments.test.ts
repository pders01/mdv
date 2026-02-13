/**
 * Table segment extraction tests
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import type { TableToken } from "../../types.js";
import { tableToBlock } from "../../rendering/table.js";
import {
  TEST_COLORS,
  renderToBlocks,
  flattenToText,
} from "../helpers/render-harness.js";

function getTableToken(markdown: string): TableToken {
  const tokens = lexer(markdown);
  return tokens.find((t) => t.type === "table") as TableToken;
}

describe("tableToBlock", () => {
  test("renders basic table with header, separator, and data", () => {
    const markdown = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    expect(block.type).toBe("table");
    expect(block.marginTop).toBe(1);
    expect(block.marginBottom).toBe(1);
    // 1 header + 1 separator + 2 data rows = 4 lines
    expect(block.lines.length).toBe(4);
  });

  test("header cells are cyan and bold", () => {
    const markdown = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    const headerLine = block.lines[0];
    const headerCells = headerLine.filter((s) => s.fg === TEST_COLORS.cyan);
    expect(headerCells.length).toBeGreaterThan(0);
    for (const cell of headerCells) {
      expect(cell.bold).toBe(true);
    }
  });

  test("separator line contains box-drawing characters", () => {
    const markdown = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    const separatorLine = block.lines[1];
    const sepText = separatorLine.map((s) => s.text).join("");
    expect(sepText).toContain("\u251C"); // ├
    expect(sepText).toContain("\u2500"); // ─
    expect(sepText).toContain("\u2524"); // ┤
  });

  test("data cells use fg color", () => {
    const markdown = "| A | B |\n| --- | --- |\n| hello | world |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    const dataLine = block.lines[2];
    const dataCells = dataLine.filter((s) => s.fg === TEST_COLORS.fg);
    expect(dataCells.length).toBeGreaterThan(0);
  });

  test("pipe separators are gray", () => {
    const markdown = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    const headerLine = block.lines[0];
    const pipes = headerLine.filter(
      (s) => s.text.includes("\u2502") && s.fg === TEST_COLORS.gray,
    );
    expect(pipes.length).toBeGreaterThan(0);
  });

  test("handles right-aligned columns", () => {
    const markdown = "| Left | Right |\n| --- | ---: |\n| a | 123 |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    // The right-aligned cell should have padding on the left
    const dataLine = block.lines[2];
    const rightCell = dataLine.find((s) => s.text.includes("123"));
    expect(rightCell).toBeDefined();
    if (rightCell) {
      // Right-aligned: padding on the left
      expect(rightCell.text).toMatch(/^\s+123/);
    }
  });

  test("handles center-aligned columns", () => {
    const markdown = "| Left | Center |\n| --- | :---: |\n| a | b |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    expect(block.lines.length).toBe(3);
  });

  test("handles empty cells", () => {
    const markdown = "| A | B |\n| --- | --- |\n| filled |  |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    expect(block.lines.length).toBe(3);
    const text = block.lines[2].map((s) => s.text).join("");
    expect(text).toContain("filled");
  });

  test("handles single-column table", () => {
    const markdown = "| Only |\n| --- |\n| value |";
    const token = getTableToken(markdown);
    const block = tableToBlock(TEST_COLORS, token);

    expect(block.lines.length).toBe(3);
  });
});

describe("table via full pipeline", () => {
  test("renders table block", () => {
    const blocks = renderToBlocks("| A | B |\n| --- | --- |\n| 1 | 2 |");
    const tableBlocks = blocks.filter((b) => b.type === "table");
    expect(tableBlocks.length).toBe(1);
  });

  test("preserves all cell content", () => {
    const blocks = renderToBlocks(
      "| Name | Score |\n| --- | --- |\n| Alice | 95 |\n| Bob | 87 |",
    );
    const text = flattenToText(blocks);
    expect(text).toContain("Name");
    expect(text).toContain("Score");
    expect(text).toContain("Alice");
    expect(text).toContain("95");
    expect(text).toContain("Bob");
    expect(text).toContain("87");
  });
});
