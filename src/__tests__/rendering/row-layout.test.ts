import { describe, it, expect } from "bun:test";
import { walkRenderable as getRowLayout } from "../../render/measure-block.js";

function mockBlock(y: number, height: number, children?: Array<{ y: number; height: number }>) {
  return {
    x: 0,
    y,
    width: 80,
    height,
    getChildren: children
      ? () => children.map((c) => ({ x: 0, width: 80, y: c.y, height: c.height }))
      : undefined,
  };
}

describe("getRowLayout", () => {
  it("returns the block's own y for single-line blocks", () => {
    const r = mockBlock(10, 1, [{ y: 10, height: 1 }]);
    expect(getRowLayout(r, 1, 0)).toEqual({ y: 10, height: 1 });
  });

  it("uses uniform divide for paragraph blocks with one child but wrapped height", () => {
    const r = mockBlock(5, 7, [{ y: 5, height: 7 }]);
    // 1 source line that wrapped to 7 rows — uniform fallback (linesInBlock=1).
    expect(getRowLayout(r, 1, 0)).toEqual({ y: 5, height: 7 });
  });

  it("walks children for multi-row blocks when child count matches line count", () => {
    // Mimic a 6-item CJK list where items 2 and 4 wrapped.
    const r = mockBlock(31, 11, [
      { y: 31, height: 1 },
      { y: 32, height: 1 },
      { y: 33, height: 2 },
      { y: 35, height: 1 },
      { y: 36, height: 4 },
      { y: 40, height: 2 },
    ]);
    expect(getRowLayout(r, 6, 0)).toEqual({ y: 31, height: 1 });
    expect(getRowLayout(r, 6, 2)).toEqual({ y: 33, height: 2 });
    expect(getRowLayout(r, 6, 4)).toEqual({ y: 36, height: 4 });
    expect(getRowLayout(r, 6, 5)).toEqual({ y: 40, height: 2 });
  });

  it("falls back to uniform divide when child count does not match", () => {
    // Block claims 4 source lines but only 2 children — uneven render shape,
    // can't trust the walk so we fall back.
    const r = mockBlock(10, 8, [
      { y: 10, height: 4 },
      { y: 14, height: 4 },
    ]);
    // Uniform: lineHeight = 8 / 4 = 2, lineY = 10 + 2 * 2 = 14.
    expect(getRowLayout(r, 4, 2)).toEqual({ y: 14, height: 2 });
  });

  it("descends one DFS layer when top-level children count doesn't match line count", () => {
    // Mimic a list with one top item containing a nested sub-list:
    //   - top
    //     - nested 1 (wraps to 2 rows)
    //     - nested 2
    // 3 source lines, 1 top-level child (the outer item box). The leaf
    // walk should pick up the three TextRenderables and place each at
    // its actual rendered y.
    const nestedItem1 = { x: 0, width: 80, y: 6, height: 2 }; // wrapped
    const nestedItem2 = { x: 0, width: 80, y: 8, height: 1 };
    const nestedList = {
      x: 0,
      width: 80,
      y: 6,
      height: 3,
      getChildren: () => [
        { ...nestedItem1, getChildren: () => [nestedItem1] },
        { ...nestedItem2, getChildren: () => [nestedItem2] },
      ],
    };
    const topText = { x: 0, width: 80, y: 5, height: 1 };
    const topItem = {
      x: 0,
      width: 80,
      y: 5,
      height: 4,
      getChildren: () => [topText, nestedList],
    };
    const listBox = {
      x: 0,
      width: 80,
      y: 5,
      height: 4,
      getChildren: () => [topItem],
    };

    // Source lines 0..2 within the block.
    expect(getRowLayout(listBox, 3, 0).y).toBe(5); // top
    expect(getRowLayout(listBox, 3, 1).y).toBe(6); // nested 1 (wrapped)
    expect(getRowLayout(listBox, 3, 2).y).toBe(8); // nested 2 — *after* the wrap
  });

  it("falls back to uniform divide when the block has no getChildren", () => {
    const r = { x: 0, y: 10, width: 80, height: 6 };
    // 6 / 3 = 2 per row; row 1 starts at 10 + 1 * 2 = 12.
    expect(getRowLayout(r, 3, 1)).toEqual({ y: 12, height: 2 });
  });

  it("handles linesInBlock=0 defensively without divide-by-zero", () => {
    const r = mockBlock(10, 5);
    expect(getRowLayout(r, 0, 0)).toEqual({ y: 10, height: 1 });
  });
});
