/**
 * Table rendering tests
 */

import { describe, test, expect } from "bun:test";
import { lexer } from "marked";
import type { TableToken } from "../../types.js";

describe("table token parsing", () => {
  test("parses simple table", () => {
    const markdown = `| Name | Value |
| ---- | ----- |
| Foo  | 100   |
| Bar  | 200   |`;

    const tokens = lexer(markdown);
    const table = tokens.find(t => t.type === "table") as TableToken;

    expect(table).toBeDefined();
    expect(table.header.length).toBe(2);
    expect(table.rows.length).toBe(2);
  });

  test("parses table headers correctly", () => {
    const markdown = `| Column A | Column B | Column C |
| -------- | -------- | -------- |
| Data     | More     | Info     |`;

    const tokens = lexer(markdown);
    const table = tokens.find(t => t.type === "table") as TableToken;

    expect(table).toBeDefined();
    expect(table.header[0].text).toBe("Column A");
    expect(table.header[1].text).toBe("Column B");
    expect(table.header[2].text).toBe("Column C");
  });

  test("parses table rows correctly", () => {
    const markdown = `| Name | Age |
| ---- | --- |
| John | 25  |
| Jane | 30  |`;

    const tokens = lexer(markdown);
    const table = tokens.find(t => t.type === "table") as TableToken;

    expect(table).toBeDefined();
    expect(table.rows[0][0].text).toBe("John");
    expect(table.rows[0][1].text).toBe("25");
    expect(table.rows[1][0].text).toBe("Jane");
    expect(table.rows[1][1].text).toBe("30");
  });

  test("parses table alignment", () => {
    const markdown = `| Left | Center | Right |
| :--- | :----: | ----: |
| L    | C      | R     |`;

    const tokens = lexer(markdown);
    const table = tokens.find(t => t.type === "table") as TableToken;

    expect(table).toBeDefined();
    expect(table.align).toBeDefined();
    expect(table.align?.[0]).toBe("left");
    expect(table.align?.[1]).toBe("center");
    expect(table.align?.[2]).toBe("right");
  });

  test("handles empty cells", () => {
    const markdown = `| Col1 | Col2 |
| ---- | ---- |
| Data |      |
|      | More |`;

    const tokens = lexer(markdown);
    const table = tokens.find(t => t.type === "table") as TableToken;

    expect(table).toBeDefined();
    expect(table.rows.length).toBe(2);
  });

  test("handles table with formatting", () => {
    const markdown = `| Feature | Status |
| ------- | ------ |
| **Bold** | Done   |
| *Italic* | WIP    |`;

    const tokens = lexer(markdown);
    const table = tokens.find(t => t.type === "table") as TableToken;

    expect(table).toBeDefined();
    expect(table.rows.length).toBe(2);
  });
});
