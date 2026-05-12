import { describe, it, expect } from "bun:test";
import { tableToSpec } from "../../rendering/table.js";
import { calculateColumnWidths, padCell, truncateCell } from "../../rendering/table-utils.js";
import type { ThemeColors, TableToken } from "../../types.js";

const colors: ThemeColors = {
  fg: "#fff",
  bg: "#000",
  link: "#0af",
  red: "#f00",
  orange: "#fa0",
  yellow: "#ff0",
  green: "#0f0",
  cyan: "#0ff",
  blue: "#00f",
  purple: "#a0a",
  gray: "#888",
  codeBg: "#222",
};

describe("table-utils cell-width math", () => {
  it("calculateColumnWidths counts CJK as 2 cells per char", () => {
    // "中文" (2 cells × 2) = 4 wide; "abc" = 3 wide.
    const widths = calculateColumnWidths([["中文", "abc"]]);
    expect(widths).toEqual([4, 3]);
  });

  it("padCell uses cell width so CJK rows line up with ASCII rows", () => {
    expect(padCell("中文", 6)).toBe("中文  "); // 4 cells + 2 spaces = 6
    expect(padCell("abcd", 6)).toBe("abcd  "); // 4 cells + 2 spaces = 6
    expect(padCell("中文", 6, "right")).toBe("  中文");
    expect(padCell("中文", 6, "center")).toBe(" 中文 ");
  });

  it("truncateCell respects cell width when slicing", () => {
    // 6 cells, max 4 → "中" alone fits (2), can't add another wide char with the
    // ellipsis budget (need 1 for ellipsis, 1 remaining cell can't hold "文")
    expect(truncateCell("中文中", 4)).toBe("中…");
    expect(truncateCell("中文", 4)).toBe("中文"); // already fits
    expect(truncateCell("abcdef", 4)).toBe("abc…"); // ASCII unchanged
  });

  it("truncateCell handles maxWidth=1 (single cell) with a CJK char", () => {
    // 1-cell budget can't fit a 2-cell char — should return empty rather
    // than render a half-char that breaks the column layout.
    expect(truncateCell("中", 1)).toBe("");
    expect(truncateCell("a", 1)).toBe("a");
  });
});

describe("tableToSpec", () => {
  function makeTable(): TableToken {
    return {
      header: [{ text: "Name" }, { text: "描述" }],
      rows: [[{ text: "short" }, { text: "简短" }]],
    };
  }

  it("emits a column-flex box with header + separator + one row per data line", () => {
    const spec = tableToSpec(colors, makeTable(), 80);
    expect(spec.kind).toBe("box");
    expect(spec.flexDirection).toBe("column");
    expect(spec.children).toHaveLength(3); // header, separator, 1 data row

    for (const child of spec.children) {
      expect(child.kind).toBe("text");
    }
  });

  it("right-pads the header cell with spaces accounting for CJK width", () => {
    const spec = tableToSpec(colors, makeTable(), 80);
    const header = spec.children[0] as { chunks: Array<{ text: string }> };
    // Header chunks: leftBorder, "Name" padded, innerSep, "描述" padded, rightBorder
    const cell2 = header.chunks[3]!.text;
    // "描述" is 4 cells; padded to colWidth + cellPadding(2). With 80-col
    // budget and natural widths 4+4=8, no shrinking needed. So colWidth=4
    // for "描述", paddedWidth=6. cell2 = "描述  " (4 cells + 2 spaces).
    expect(cell2).toBe("描述  ");
  });
});
