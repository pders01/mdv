import { describe, it, expect } from "bun:test";
import { cellWidth, cellColumn, takeUpToCellWidth, truncateToCellWidth } from "../../util/width.js";

describe("cellWidth", () => {
  it("returns char count for pure ASCII", () => {
    expect(cellWidth("hello")).toBe(5);
    expect(cellWidth("")).toBe(0);
  });

  it("doubles for CJK characters", () => {
    expect(cellWidth("中")).toBe(2);
    expect(cellWidth("中文")).toBe(4);
    expect(cellWidth("一二三")).toBe(6);
  });

  it("mixes ASCII and CJK correctly", () => {
    expect(cellWidth("abc 中文")).toBe(8);
    expect(cellWidth("中 a 文")).toBe(7);
  });
});

describe("cellColumn", () => {
  it("returns 0 for char index 0 or negative", () => {
    expect(cellColumn("anything", 0)).toBe(0);
    expect(cellColumn("anything", -3)).toBe(0);
  });

  it("equals char index for pure ASCII", () => {
    expect(cellColumn("hello world", 6)).toBe(6);
  });

  it("counts each CJK char as 2 cells", () => {
    // "中文 foo" — char index 3 is the 'f', after "中文 " (cells: 2+2+1=5).
    expect(cellColumn("中文 foo", 3)).toBe(5);
  });

  it("handles a mixed prefix", () => {
    // "abc 中文 xyz" — char index 4 is the '中', after "abc " (4 cells).
    expect(cellColumn("abc 中文 xyz", 4)).toBe(4);
    // char index 6 is the ' ' after "abc 中文" (4 + 2 + 2 = 8 cells).
    expect(cellColumn("abc 中文 xyz", 6)).toBe(8);
  });
});

describe("takeUpToCellWidth", () => {
  it("returns empty for non-positive budget", () => {
    expect(takeUpToCellWidth("anything", 0)).toBe("");
    expect(takeUpToCellWidth("anything", -1)).toBe("");
  });

  it("walks ASCII chars exactly", () => {
    expect(takeUpToCellWidth("hello world", 5)).toBe("hello");
    expect(takeUpToCellWidth("hello", 100)).toBe("hello");
  });

  it("drops a CJK char that would overflow the budget rather than half-rendering", () => {
    // "中" is 2 cells; budget 1 leaves no room.
    expect(takeUpToCellWidth("中文", 1)).toBe("");
    // budget 2 fits exactly one CJK char.
    expect(takeUpToCellWidth("中文", 2)).toBe("中");
    // budget 3 still only fits one CJK + can't fit the next.
    expect(takeUpToCellWidth("中文", 3)).toBe("中");
  });
});

describe("truncateToCellWidth", () => {
  it("passes through when input already fits", () => {
    expect(truncateToCellWidth("abc", 5)).toBe("abc");
    expect(truncateToCellWidth("中文", 4)).toBe("中文");
  });

  it("appends ellipsis (1 cell) and takes the rest of the budget for content", () => {
    expect(truncateToCellWidth("abcdef", 4)).toBe("abc…");
    // "中文中" = 6 cells; budget 4 → fit 1 CJK (2 cells) + … (1) = 3 used.
    expect(truncateToCellWidth("中文中", 4)).toBe("中…");
  });

  it("falls back to takeUpToCellWidth without ellipsis when max <= 1", () => {
    expect(truncateToCellWidth("中文", 1)).toBe("");
    expect(truncateToCellWidth("abcdef", 1)).toBe("a");
  });
});
